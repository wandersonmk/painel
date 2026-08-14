import { requireParceiroPrepago } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'

export type SituacaoAcesso = 'ativo' | 'vencido' | 'bloqueado_parceiro' | 'bloqueado_admin'

const DIA_MS = 24 * 60 * 60 * 1000

export default defineEventHandler(async (event) => {
  const { parceiro } = await requireParceiroPrepago(event)
  const supabase = getServiceClient()

  // A carteira sai de parceiro_empresas, NÃO de empresas: o parceiro também
  // pode ser cliente da Agzap, e a RLS de empresas devolveria a empresa dele.
  const { data: vinculos, error } = await supabase
    .from('parceiro_empresas')
    .select(`
      id, empresa_id, ativo, cobranca_agzap, bloqueio_origem, bloqueado_em, preco_anual, created_at,
      empresas ( id, nome, nome_cliente, email, whatsapp, ativo, created_at,
                 subscription_status, subscription_plan, subscription_price,
                 subscription_renews_at, trial_ends_at,
                 max_instancias, max_agentes )
    `)
    .eq('parceiro_id', parceiro.id)
    .eq('ativo', true)
  if (error) return failPublic(error, 'parceiro/carteira', 'Não foi possível carregar sua carteira.')

  const linhas = (vinculos ?? []).filter((v: any) => v.empresas)
  const empresaIds = linhas.map((v: any) => v.empresa_id)

  const [saldosRes, uazRes, metaRes, agentesRes, renovacoesRes] = await Promise.all([
    supabase.from('parceiro_creditos_saldo')
      .select('tipo_credito, saldo').eq('parceiro_id', parceiro.id),
    empresaIds.length
      ? supabase.from('instancias_uazapi').select('empresa_id').in('empresa_id', empresaIds)
      : Promise.resolve({ data: [], error: null }),
    empresaIds.length
      ? supabase.from('instancias_meta').select('empresa_id').in('empresa_id', empresaIds)
      : Promise.resolve({ data: [], error: null }),
    empresaIds.length
      ? supabase.from('agente_configuracoes').select('empresa_id').in('empresa_id', empresaIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('parceiro_renovacoes')
      .select('empresa_id, tipo_credito, vencimento_novo, executado_em, origem')
      .eq('parceiro_id', parceiro.id)
      .eq('status', 'concluida')
      .order('executado_em', { ascending: false })
      .limit(500),
  ])

  const contar = (linhas: any[] | null) => {
    const mapa = new Map<string, number>()
    for (const l of linhas ?? []) mapa.set(l.empresa_id, (mapa.get(l.empresa_id) ?? 0) + 1)
    return mapa
  }
  const porUaz = contar(uazRes.data as any[])
  const porMeta = contar(metaRes.data as any[])
  const porAgente = contar(agentesRes.data as any[])

  // A lista já vem ordenada do mais recente: o primeiro de cada empresa vence.
  const ultimaRenovacao = new Map<string, any>()
  for (const r of (renovacoesRes.data ?? []) as any[]) {
    if (r.empresa_id && !ultimaRenovacao.has(r.empresa_id)) ultimaRenovacao.set(r.empresa_id, r)
  }

  const agora = Date.now()

  const clientes = linhas.map((v: any) => {
    const e = v.empresas
    const vencimentoIso: string | null = e.subscription_renews_at ?? e.trial_ends_at ?? null
    const vencimentoMs = vencimentoIso ? new Date(vencimentoIso).getTime() : null
    const diasRestantes = vencimentoMs === null
      ? null
      : Math.ceil((vencimentoMs - agora) / DIA_MS)

    let situacao: SituacaoAcesso
    if (v.bloqueio_origem === 'parceiro') situacao = 'bloqueado_parceiro'
    else if (v.bloqueio_origem === 'admin' || e.ativo === false) situacao = 'bloqueado_admin'
    else if (vencimentoMs !== null && vencimentoMs < agora) situacao = 'vencido'
    else situacao = 'ativo'

    const ultima = ultimaRenovacao.get(v.empresa_id) ?? null

    return {
      vinculo_id: v.id,
      empresa_id: v.empresa_id,
      empresa_nome: e.nome,
      responsavel: e.nome_cliente ?? null,
      email: e.email ?? null,
      telefone: e.whatsapp ?? null,
      plano: e.subscription_plan ?? null,
      // O parceiro define este valor: é o que o cliente dele vê na tela de
      // assinatura do app.
      preco: e.subscription_price === null || e.subscription_price === undefined
        ? null
        : Number(e.subscription_price),
      // Preço fechado do plano de 12 meses. Nulo = ainda não definido.
      preco_anual: v.preco_anual === null || v.preco_anual === undefined
        ? null
        : Number(v.preco_anual),
      status_assinatura: e.subscription_status ?? null,
      vinculado_em: v.created_at,
      empresa_cadastro: e.created_at,
      vencimento: vencimentoIso,
      dias_restantes: diasRestantes,
      situacao,
      bloqueado_em: v.bloqueado_em,
      cobranca_agzap: v.cobranca_agzap === true,
      // Só leitura: o parceiro não altera limites nem cria instância/assistente.
      instancias: (porUaz.get(v.empresa_id) ?? 0) + (porMeta.get(v.empresa_id) ?? 0),
      max_instancias: e.max_instancias ?? 0,
      assistentes: porAgente.get(v.empresa_id) ?? 0,
      max_assistentes: e.max_agentes ?? 0,
      ultima_renovacao: ultima
        ? { em: ultima.executado_em, tipo_credito: ultima.tipo_credito, origem: ultima.origem }
        : null,
    }
  })

  clientes.sort((a, b) => {
    if (!a.vencimento) return 1
    if (!b.vencimento) return -1
    return new Date(a.vencimento).getTime() - new Date(b.vencimento).getTime()
  })

  const saldos = { mensal_30d: 0, anual_12m: 0 }
  for (const s of (saldosRes.data ?? []) as any[]) {
    if (s.tipo_credito in saldos) saldos[s.tipo_credito as keyof typeof saldos] = Number(s.saldo) || 0
  }

  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)
  const renovacoesNoMes = ((renovacoesRes.data ?? []) as any[])
    .filter(r => new Date(r.executado_em) >= inicioMes)
  const consumidosNoMes = renovacoesNoMes.filter(r => r.origem === 'parceiro').length

  return {
    success: true,
    data: {
      parceiro: { id: parceiro.id, nome: parceiro.nome, modelo_negocio: parceiro.modelo_negocio },
      saldos,
      clientes,
      indicadores: {
        total: clientes.length,
        ativos: clientes.filter(c => c.situacao === 'ativo').length,
        vencendo_7d: clientes.filter(c =>
          c.situacao === 'ativo' && c.dias_restantes !== null && c.dias_restantes <= 7).length,
        vencidos: clientes.filter(c => c.situacao === 'vencido').length,
        bloqueados_pelo_parceiro: clientes.filter(c => c.situacao === 'bloqueado_parceiro').length,
        creditos_consumidos_mes: consumidosNoMes,
        renovacoes_mes: renovacoesNoMes.length,
      },
    },
  }
})
