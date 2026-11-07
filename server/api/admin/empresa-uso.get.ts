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
    instanciasResp, macrosResp, enviosResp, cotaResp, produtosVitrineResp,
    imoveisResp, funisResp, webchatsResp,
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
    // Pedidos do Delivery: a mesma função que o app usa, para bater com a cota
    // que bloqueia de verdade (ciclo, canais e pedidos extras).
    supabase.rpc('delivery_pedidos_mes_uso', { p_empresa_id: empresaId }),
    // Produtos da Vitrine (ativos e inativos) — o mesmo que o app conta pra
    // empresas.max_produtos_vitrine (POST /api/vitrine/produtos no app).
    supabase.from('vitrine_produtos').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    // Imóveis (todos, inativos inclusos) — o mesmo que POST /api/imoveis do app
    // conta pra empresas.max_imoveis. Tolerante: se a tabela ainda não existir
    // (migration do módulo não aplicada), o PostgREST devolve erro com count
    // null e cai em 0; o catch cobre falha de rede pra não derrubar o resto.
    supabase.from('imoveis').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId)
      .then(r => r, () => ({ count: null })),
    // Funis de CRM sem o quadro Geral: o Geral não conta no limite (dono,
    // 07/11/2026), igual ao trigger trg_limite_funis.
    supabase.from('crm_boards').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId)
      .not('is_geral', 'is', true)
      .then(r => r, () => ({ count: null })),
    // Chats do site: o mesmo que POST /api/webchat/canais do app conta.
    supabase.from('instancias_webchat').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId)
      .then(r => r, () => ({ count: null })),
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
      pedidosMes: Number((cotaResp.data as { usados?: number } | null)?.usados ?? 0) || 0,
      pedidosExtras: Number((cotaResp.data as { extras?: number } | null)?.extras ?? 0) || 0,
      produtosVitrine: produtosVitrineResp.count ?? 0,
      imoveis: imoveisResp.count ?? 0,
      funis: funisResp.count ?? 0,
      webchats: webchatsResp.count ?? 0,
    },
  }
})
