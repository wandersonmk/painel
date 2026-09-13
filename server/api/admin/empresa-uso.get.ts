import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { janelaDoMes } from '~~/server/utils/janelaMes'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { empresaId } = getQuery(event) as { empresaId?: string }
  if (!empresaId) throw createError({ statusCode: 400, statusMessage: 'empresaId obrigatório' })

  const supabase = getServiceClient()

  // Fuso da empresa decide a janela do mês (envios/pedidos) — mesmo cálculo
  // que as próprias funções de cota do app usam pra não bater diferente
  // do que a empresa vê no dia a dia.
  const { data: empresaFuso } = await supabase
    .from('empresas').select('fuso_horario').eq('id', empresaId).maybeSingle()
  const { de, ate } = janelaDoMes(empresaFuso?.fuso_horario || 'America/Sao_Paulo')

  const [
    agentesResp, webhooksResp, webhooksSaidaResp, profissionaisResp, clientesResp,
    instanciasResp, macrosResp, enviosResp, pedidosResp,
  ] = await Promise.all([
    supabase.from('agente_configuracoes').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    supabase.from('webhooks_entrada').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    supabase.from('webhooks_saida').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    // Só os ativos: é o que o trigger trg_limite_profissionais conta.
    supabase.from('profissionais').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('status', 'ativo'),
    supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    // Canais WhatsApp nativos — é o que max_instancias limita (create-uazapi.post.ts).
    supabase.from('instancias_uazapi').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).neq('status', 'deleted'),
    supabase.from('macros').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    // Mesmo critério de quotaDisparosDoMes (server/utils/disparos.ts do app):
    // tentativa real de envio no mês, falha inclusa (consumiu chamada à Meta).
    supabase.from('disparo_campanha_contatos').select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .in('status', ['enviado', 'entregue', 'lido', 'respondido', 'falha'])
      .gte('enviado_em', de).lt('enviado_em', ate),
    // Pedidos de Delivery no mês (WhatsApp + site) — mesma janela que
    // delivery_criar_pedido usa pra checar empresas.max_pedidos_mes.
    supabase.from('delivery_pedidos').select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .gte('created_at', de).lt('created_at', ate),
  ])

  return {
    success: true,
    data: {
      assistentes: agentesResp.count ?? 0,
      webhooks: webhooksResp.count ?? 0,
      webhooksSaida: webhooksSaidaResp.count ?? 0,
      profissionais: profissionaisResp.count ?? 0,
      clientes: clientesResp.count ?? 0,
      instancias: instanciasResp.count ?? 0,
      macros: macrosResp.count ?? 0,
      enviosMes: enviosResp.count ?? 0,
      pedidosMes: pedidosResp.count ?? 0,
    },
  }
})
