import { requireParceiroPrepago } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'

/** Saldo + extrato de créditos do parceiro logado. Somente leitura. */
export default defineEventHandler(async (event) => {
  const { parceiro } = await requireParceiroPrepago(event)
  const supabase = getServiceClient()

  const [saldosRes, ledgerRes, precosRes] = await Promise.all([
    supabase.from('parceiro_creditos_saldo')
      .select('tipo_credito, saldo, updated_at')
      .eq('parceiro_id', parceiro.id),
    supabase.from('parceiro_creditos_ledger')
      .select('id, tipo_credito, quantidade, operacao, empresa_id, empresa_nome, referencia, descricao, created_at, renovacao_id')
      .eq('parceiro_id', parceiro.id)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('parceiro_precos_licenca')
      .select('tipo_credito, quantidade_min, preco_unitario, preco_sugerido_revenda')
      .eq('ativo', true)
      .order('tipo_credito')
      .order('quantidade_min'),
  ])
  if (saldosRes.error) return failPublic(saldosRes.error, 'parceiro/creditos', 'Não foi possível carregar seus créditos.')
  if (ledgerRes.error) return failPublic(ledgerRes.error, 'parceiro/creditos', 'Não foi possível carregar seus créditos.')

  const renovacaoIds = ((ledgerRes.data ?? []) as any[])
    .map(l => l.renovacao_id).filter(Boolean)

  let validadePorRenovacao = new Map<string, string>()
  if (renovacaoIds.length) {
    const { data: renovacoes } = await supabase
      .from('parceiro_renovacoes')
      .select('id, vencimento_novo')
      .in('id', renovacaoIds)
    validadePorRenovacao = new Map(
      ((renovacoes ?? []) as any[]).map(r => [r.id, r.vencimento_novo]),
    )
  }

  const saldos = { mensal_30d: 0, anual_12m: 0 }
  for (const s of (saldosRes.data ?? []) as any[]) {
    if (s.tipo_credito in saldos) saldos[s.tipo_credito as keyof typeof saldos] = Number(s.saldo) || 0
  }

  const movimentacoes = ((ledgerRes.data ?? []) as any[]).map(l => ({
    id: l.id,
    tipo_credito: l.tipo_credito,
    quantidade: Number(l.quantidade),
    operacao: l.operacao,
    empresa_id: l.empresa_id,
    empresa_nome: l.empresa_nome,
    // Referência interna do pedido não vai para o parceiro; descrição sim.
    descricao: l.descricao,
    nova_validade: l.renovacao_id ? validadePorRenovacao.get(l.renovacao_id) ?? null : null,
    created_at: l.created_at,
  }))

  return {
    success: true,
    data: {
      saldos,
      movimentacoes,
      precos: precosRes.data ?? [],
    },
  }
})
