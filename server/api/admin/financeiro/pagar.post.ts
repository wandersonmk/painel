import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { id, pago, data } = await readBody<{ id: string; pago: boolean; data?: string }>(event)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id obrigatório' })

  const data_pagamento = pago ? (data || new Date().toISOString().slice(0, 10)) : null

  const supabase = getServiceClient()
  const { error } = await supabase
    .from('financeiro_lancamentos')
    .update({ data_pagamento })
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  return { success: true, data_pagamento }
})
