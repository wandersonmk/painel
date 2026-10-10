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
 *
 * Comissão do AFILIADO do mesmo pagamento (09/10/2026): também é desfeita.
 * A referência dela tem o id da empresa no meio — indicação
 * 'painel-admin:<renews_at>', afiliado 'painel-admin:<empresa_id>:<renews_at>'
 * (no Stripe as duas usam o id da fatura).
 *  - retido → 'cancelado'; disponível → 'estornado';
 *  - em saque ou já sacado → o status fica, mas motivo_estorno é marcado (se o
 *    saque for recusado, ela vira 'estornado' em vez de voltar ao disponível)
 *    e a resposta leva um aviso para o admin acertar com o afiliado.
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

  // Mesmo pagamento na tabela do afiliado (o pagante é o próprio cliente).
  const PREFIXO_PAINEL = 'painel-admin:'
  const refsAfiliado = [referencia]
  if (referencia.startsWith(PREFIXO_PAINEL)) {
    refsAfiliado.push(`${PREFIXO_PAINEL}${empresaId}:${referencia.slice(PREFIXO_PAINEL.length)}`)
  }
  const { data: linhasAfiliado, error: errAfiliado } = await supabase
    .from('afiliado_comissoes')
    .select('id, status, valor, motivo_estorno')
    .eq('empresa_pagante_id', empresaId)
    .in('referencia_pagamento', refsAfiliado)
  if (errAfiliado) throw createError({ statusCode: 500, statusMessage: errAfiliado.message })

  if (!linhas?.length && !linhasAfiliado?.length) throw createError({ statusCode: 404, statusMessage: 'Pagamento não encontrado para este cliente' })

  const agora = new Date().toISOString()
  const soma = (ls: any[]) => Math.round(ls.reduce((a, l) => a + Number(l.valor_credito || 0), 0) * 100) / 100
  const pendentes = (linhas ?? []).filter((l: any) => l.status === 'pendente_liberacao')
  const liberados = (linhas ?? []).filter((l: any) => l.status === 'liberado')
  const utilizados = (linhas ?? []).filter((l: any) => l.status === 'utilizado' || l.status === 'creditado')

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

  // Comissão do afiliado do mesmo pagamento.
  const somaAfiliado = (ls: any[]) => Math.round(ls.reduce((a, l) => a + Number(l.valor || 0), 0) * 100) / 100
  const motivoAfiliado = `${motivoFinal} (registrado pelo admin)`
  const afRetidos = (linhasAfiliado ?? []).filter((l: any) => l.status === 'retido')
  const afDisponiveis = (linhasAfiliado ?? []).filter((l: any) => l.status === 'disponivel')
  const afEmSaque = (linhasAfiliado ?? []).filter((l: any) => l.status === 'em_saque')
  const afSacados = (linhasAfiliado ?? []).filter((l: any) => l.status === 'sacado')

  if (afRetidos.length) {
    const { error: e3 } = await supabase
      .from('afiliado_comissoes')
      .update({ status: 'cancelado', motivo_estorno: motivoAfiliado, estornado_em: agora, updated_at: agora })
      .in('id', afRetidos.map((l: any) => l.id))
      .eq('status', 'retido')
    if (e3) throw createError({ statusCode: 500, statusMessage: `Falha ao cancelar a comissão retida do afiliado: ${e3.message}` })
  }
  if (afDisponiveis.length) {
    const { error: e4 } = await supabase
      .from('afiliado_comissoes')
      .update({ status: 'estornado', motivo_estorno: motivoAfiliado, estornado_em: agora, updated_at: agora })
      .in('id', afDisponiveis.map((l: any) => l.id))
      .eq('status', 'disponivel')
    if (e4) throw createError({ statusCode: 500, statusMessage: `Falha ao estornar a comissão disponível do afiliado: ${e4.message}` })
  }
  // Em saque ou sacada: não some calada. O status fica; a marca em
  // motivo_estorno faz a recusa do saque estornar em vez de devolver.
  const afMarcar = [...afEmSaque, ...afSacados]
  if (afMarcar.length) {
    const { error: e5 } = await supabase
      .from('afiliado_comissoes')
      .update({ motivo_estorno: motivoAfiliado, updated_at: agora })
      .in('id', afMarcar.map((l: any) => l.id))
      .in('status', ['em_saque', 'sacado'])
    if (e5) throw createError({ statusCode: 500, statusMessage: `Falha ao marcar a comissão do afiliado que está em saque: ${e5.message}` })
  }

  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const avisos: string[] = []
  if (afEmSaque.length) {
    avisos.push(`${brl(somaAfiliado(afEmSaque))} da comissão do afiliado deste pagamento está num saque pedido e ainda não pago. Recuse esse saque em Afiliados › Saques (essa parte fica estornada e o resto volta ao disponível dele) ou, se pagar, desconte do afiliado.`)
  }
  if (afSacados.length) {
    avisos.push(`${brl(somaAfiliado(afSacados))} da comissão do afiliado deste pagamento já foi paga num saque. Ficou marcada para estorno: acerte esse valor com o afiliado.`)
  }

  const resultado = {
    cancelado: soma(pendentes),
    estornado: soma(liberados),
    jaUtilizado: soma(utilizados),
    afiliado: {
      cancelado: somaAfiliado(afRetidos),
      estornado: somaAfiliado(afDisponiveis),
      emSaque: somaAfiliado(afEmSaque),
      sacado: somaAfiliado(afSacados),
    },
  }
  console.log(`[admin/indicacao-estornar] admin=${adminUserId} indicada=${empresaId} referencia=${referencia} motivo=${motivoFinal} ${JSON.stringify(resultado)}`)
  return { success: true, data: resultado, aviso: avisos.length ? avisos.join(' ') : null }
})
