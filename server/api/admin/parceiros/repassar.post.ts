import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { parceiroId } = await readBody<{ parceiroId: string }>(event)

  if (!parceiroId) {
    throw createError({ statusCode: 400, statusMessage: 'parceiroId obrigatório' })
  }

  const supabase = getServiceClient()
  const agora = new Date().toISOString()

  // Marca como repassadas apenas as comissões já liberadas (30+ dias, sem estorno)
  const { data, error } = await supabase
    .from('parceiro_comissao_pagamentos')
    .update({ status: 'repassado', repassado_em: agora, updated_at: agora })
    .eq('parceiro_id', parceiroId)
    .eq('status', 'retido')
    .lte('liberar_em', agora)
    .select('valor_comissao')
  if (error) return { success: false, error: error.message }

  const total = (data || []).reduce((s: number, r: any) => s + Number(r.valor_comissao), 0)
  return {
    success: true,
    data: { quantidade: (data || []).length, total: Math.round(total * 100) / 100 },
  }
})
