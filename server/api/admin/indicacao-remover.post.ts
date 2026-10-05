import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

/**
 * POST /api/admin/indicacao-remover { empresaId } — remove a indicação do
 * cliente (empresas.indicado_por_empresa_id = null).
 *
 * Exemplo do dono: a Tatiana indicou o Kaique e depois cancelou a assinatura
 * dela; o admin remove a indicação do Kaique.
 *
 * Efeitos:
 *  - o cliente deixa de gerar comissão para quem indicou nas próximas
 *    renovações (o gatilho indicacao_comissao_renovacao_manual e o webhook do
 *    Stripe só geram com indicado_por_empresa_id preenchido);
 *  - os meses ainda não liberados (pendente_liberacao, inclusive os programados
 *    do plano anual) viram 'cancelado' com o motivo registrado;
 *  - o que já foi liberado/utilizado continua no histórico de quem indicou;
 *  - não mexe na assinatura de nenhuma das duas empresas.
 */
export default defineEventHandler(async (event) => {
  const adminUserId = await requireSuperAdmin(event)
  const { empresaId } = await readBody<{ empresaId: string }>(event)
  if (!empresaId) throw createError({ statusCode: 400, statusMessage: 'empresaId é obrigatório' })

  const supabase = getServiceClient()
  const { data: indicada, error } = await supabase
    .from('empresas')
    .select('id, nome, indicado_por_empresa_id')
    .eq('id', empresaId)
    .maybeSingle()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!indicada) throw createError({ statusCode: 404, statusMessage: 'Cliente não encontrado' })
  if (!indicada.indicado_por_empresa_id) {
    throw createError({ statusCode: 409, statusMessage: 'Este cliente não tem indicação' })
  }
  const indicadoraId = indicada.indicado_por_empresa_id

  // 1) Desfaz o vínculo primeiro: daqui pra frente nenhuma renovação gera
  //    comissão. O .eq no vínculo atual evita apagar uma troca feita em paralelo.
  const { error: vincErr } = await supabase
    .from('empresas')
    .update({ indicado_por_empresa_id: null })
    .eq('id', empresaId)
    .eq('indicado_por_empresa_id', indicadoraId)
  if (vincErr) throw createError({ statusCode: 500, statusMessage: `Não foi possível remover a indicação: ${vincErr.message}` })

  // 2) Cancela o que ainda não saiu (carência + meses programados do anual).
  const agora = new Date().toISOString()
  const { data: canceladas, error: cancErr } = await supabase
    .from('indicacoes_comissoes')
    .update({
      status: 'cancelado',
      motivo_estorno: 'Indicação removida pelo admin',
      estornado_em: agora,
      updated_at: agora,
    })
    .eq('empresa_indicada_id', empresaId)
    .eq('empresa_indicadora_id', indicadoraId)
    .eq('status', 'pendente_liberacao')
    .select('id, valor_credito')
  if (cancErr) {
    throw createError({
      statusCode: 500,
      statusMessage: `Indicação removida, mas os meses pendentes não foram cancelados: ${cancErr.message}`,
    })
  }

  const valorCancelado = Math.round((canceladas || []).reduce((a: number, l: any) => a + Number(l.valor_credito || 0), 0) * 100) / 100
  console.log(`[admin/indicacao-remover] admin=${adminUserId} indicada=${empresaId} indicadora=${indicadoraId} meses_cancelados=${canceladas?.length ?? 0} valor_cancelado=${valorCancelado}`)

  return {
    success: true,
    data: { mesesCancelados: canceladas?.length ?? 0, valorCancelado },
  }
})
