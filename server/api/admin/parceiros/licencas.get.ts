import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'

/**
 * Visão administrativa do modelo de licenças: saldo por parceiro, carteira,
 * movimentações e renovações. Só leitura — toda escrita tem endpoint próprio.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const supabase = getServiceClient()

  const [parceirosRes, saldosRes, vinculosRes, ledgerRes, renovacoesRes, precosRes] = await Promise.all([
    supabase.from('parceiros')
      .select('id, nome, email, telefone, ativo, modelo_negocio, migrado_em')
      .order('nome'),
    supabase.from('parceiro_creditos_saldo').select('parceiro_id, tipo_credito, saldo'),
    supabase.from('parceiro_empresas')
      .select(`
        id, parceiro_id, empresa_id, ativo, cobranca_agzap, bloqueio_origem, created_at,
        empresas ( id, nome, ativo, subscription_status, subscription_renews_at, trial_ends_at )
      `)
      .eq('ativo', true),
    supabase.from('parceiro_creditos_ledger')
      .select('id, parceiro_id, tipo_credito, quantidade, operacao, empresa_nome, referencia, valor_pago, descricao, criado_por_papel, created_at')
      .order('created_at', { ascending: false })
      .limit(300),
    supabase.from('parceiro_renovacoes')
      .select('id, parceiro_id, empresa_id, empresa_nome, tipo_credito, origem, consumiu_credito, vencimento_anterior, vencimento_novo, status, executado_em')
      .order('executado_em', { ascending: false })
      .limit(300),
    supabase.from('parceiro_precos_licenca')
      .select('id, tipo_credito, quantidade_min, preco_unitario, preco_sugerido_revenda')
      .eq('ativo', true)
      .order('tipo_credito').order('quantidade_min'),
  ])
  if (parceirosRes.error) return failPublic(parceirosRes.error, 'admin/parceiros/licencas', 'Não foi possível carregar os parceiros.')

  const agora = Date.now()
  const ledger = (ledgerRes.data ?? []) as any[]
  const vinculos = ((vinculosRes.data ?? []) as any[]).filter(v => v.empresas)

  const saldoPorParceiro = new Map<string, { mensal_30d: number; anual_12m: number }>()
  for (const s of (saldosRes.data ?? []) as any[]) {
    const atual = saldoPorParceiro.get(s.parceiro_id) ?? { mensal_30d: 0, anual_12m: 0 }
    if (s.tipo_credito in atual) atual[s.tipo_credito as 'mensal_30d' | 'anual_12m'] = Number(s.saldo) || 0
    saldoPorParceiro.set(s.parceiro_id, atual)
  }

  const parceiros = ((parceirosRes.data ?? []) as any[]).map(p => {
    const carteira = vinculos.filter(v => v.parceiro_id === p.id)
    const situacao = (v: any) => {
      const e = v.empresas
      const venc = e.subscription_renews_at ?? e.trial_ends_at ?? null
      if (v.bloqueio_origem === 'parceiro') return 'bloqueado_parceiro'
      if (v.bloqueio_origem === 'admin' || e.ativo === false) return 'bloqueado_admin'
      if (venc && new Date(venc).getTime() < agora) return 'vencido'
      return 'ativo'
    }
    const ultimoConsumo = ledger.find(l => l.parceiro_id === p.id && l.operacao === 'consumo') ?? null

    return {
      id: p.id,
      nome: p.nome,
      email: p.email,
      telefone: p.telefone,
      ativo: p.ativo,
      modelo_negocio: p.modelo_negocio,
      migrado_em: p.migrado_em,
      saldos: saldoPorParceiro.get(p.id) ?? { mensal_30d: 0, anual_12m: 0 },
      clientes_total: carteira.length,
      clientes_ativos: carteira.filter(v => situacao(v) === 'ativo').length,
      clientes_vencidos: carteira.filter(v => situacao(v) === 'vencido').length,
      clientes_bloqueados: carteira.filter(v => situacao(v).startsWith('bloqueado')).length,
      ultimo_consumo_em: ultimoConsumo?.created_at ?? null,
      clientes: carteira.map(v => ({
        vinculo_id: v.id,
        empresa_id: v.empresa_id,
        empresa_nome: v.empresas.nome,
        vinculado_em: v.created_at,
        vencimento: v.empresas.subscription_renews_at ?? v.empresas.trial_ends_at ?? null,
        situacao: situacao(v),
        cobranca_agzap: v.cobranca_agzap === true,
      })),
    }
  })

  return {
    success: true,
    data: {
      parceiros,
      movimentacoes: ledger,
      renovacoes: renovacoesRes.data ?? [],
      precos: precosRes.data ?? [],
    },
  }
})
