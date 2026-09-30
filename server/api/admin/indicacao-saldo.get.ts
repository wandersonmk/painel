import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

/**
 * GET /api/admin/indicacao-saldo?empresaId= — saldo do programa de indicação
 * da empresa (como INDICADORA). Disponível = comissões 'liberado' (passaram
 * da carência e a empresa não tem cartão no Stripe: o admin abate na
 * renovação ou usa em serviço). 'creditado' já está no saldo Stripe da
 * fatura (desconta sozinho) — só aparece como informação.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const empresaId = String(getQuery(event).empresaId || '')
  if (!empresaId) throw createError({ statusCode: 400, statusMessage: 'empresaId é obrigatório' })

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('indicacoes_comissoes')
    .select('id, status, valor_credito, tipo, liberar_em, liberado_em, creditado_em, utilizado_em, utilizado_descricao, created_at, indicada:empresas!indicacoes_comissoes_empresa_indicada_id_fkey ( nome )')
    .eq('empresa_indicadora_id', empresaId)
    .in('status', ['pendente_liberacao', 'liberado', 'creditado', 'utilizado'])
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const linhas = (data || []) as any[]
  const soma = (st: string) => Math.round(linhas.filter(l => l.status === st).reduce((a, l) => a + Number(l.valor_credito || 0), 0) * 100) / 100
  return {
    disponivel: soma('liberado'),
    pendente: soma('pendente_liberacao'),
    naFatura: soma('creditado'),
    utilizado: soma('utilizado'),
    itens: linhas.map(l => ({
      id: l.id,
      status: l.status,
      valor: Number(l.valor_credito),
      tipo: l.tipo,
      indicada: l.indicada?.nome || null,
      liberarEm: l.liberar_em,
      liberadoEm: l.liberado_em,
      creditadoEm: l.creditado_em,
      utilizadoEm: l.utilizado_em,
      utilizadoDescricao: l.utilizado_descricao,
    })),
  }
})
