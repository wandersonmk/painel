import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

/**
 * POST /api/admin/indicacao-estornar { empresaId, referencia, motivo } —
 * chargeback/estorno de UM pagamento do cliente indicado feito fora do Stripe
 * (Pix, link de cartão de outra maquininha). O Stripe é tratado sozinho pelo
 * webhook do app (charge.dispute.created / charge.refunded).
 *
 * Regra do dono (05/10/2026): ganho de pagamento contestado fica retido,
 * mesmo que já tenha passado da carência — não pode virar desconto.
 *  - em carência / meses programados do anual → 'cancelado';
 *  - liberado (ainda não usado) → 'estornado' (sai do saldo disponível);
 *  - já utilizado como desconto → não dá pra desfazer: devolve o valor pro
 *    admin decidir (descontar do próximo pedido dela ou assumir).
 */
export default defineEventHandler(async (event) => {
  const adminUserId = await requireSuperAdmin(event)
  const { empresaId, referencia, motivo } = await readBody<{ empresaId: string; referencia: string; motivo?: string }>(event)
  if (!empresaId || !referencia) throw createError({ statusCode: 400, statusMessage: 'empresaId e referencia são obrigatórios' })

  const motivoFinal = (motivo || 'chargeback').trim().slice(0, 120) || 'chargeback'
  const supabase = getServiceClient()

  const { data: linhas, error } = await supabase
    .from('indicacoes_comissoes')
    .select('id, status, valor_credito')
    .eq('empresa_indicada_id', empresaId)
    .eq('referencia_pagamento', referencia)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!linhas?.length) throw createError({ statusCode: 404, statusMessage: 'Pagamento não encontrado para este cliente' })

  const agora = new Date().toISOString()
  const soma = (ls: any[]) => Math.round(ls.reduce((a, l) => a + Number(l.valor_credito || 0), 0) * 100) / 100
  const pendentes = linhas.filter((l: any) => l.status === 'pendente_liberacao')
  const liberados = linhas.filter((l: any) => l.status === 'liberado')
  const utilizados = linhas.filter((l: any) => l.status === 'utilizado' || l.status === 'creditado')

  if (pendentes.length) {
    const { error: e1 } = await supabase
      .from('indicacoes_comissoes')
      .update({ status: 'cancelado', motivo_estorno: `${motivoFinal} (registrado pelo admin)`, estornado_em: agora, updated_at: agora })
      .in('id', pendentes.map((l: any) => l.id))
      .eq('status', 'pendente_liberacao')
    if (e1) throw createError({ statusCode: 500, statusMessage: `Falha ao cancelar os meses pendentes: ${e1.message}` })
  }
  if (liberados.length) {
    const { error: e2 } = await supabase
      .from('indicacoes_comissoes')
      .update({ status: 'estornado', motivo_estorno: `${motivoFinal} (registrado pelo admin)`, estornado_em: agora, updated_at: agora })
      .in('id', liberados.map((l: any) => l.id))
      .eq('status', 'liberado')
    if (e2) throw createError({ statusCode: 500, statusMessage: `Falha ao estornar o saldo liberado: ${e2.message}` })
  }

  const resultado = {
    cancelado: soma(pendentes),
    estornado: soma(liberados),
    jaUtilizado: soma(utilizados),
  }
  console.log(`[admin/indicacao-estornar] admin=${adminUserId} indicada=${empresaId} referencia=${referencia} motivo=${motivoFinal} ${JSON.stringify(resultado)}`)
  return { success: true, data: resultado }
})
