import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const supabase = getServiceClient()

  const { data, error } = await supabase
    .from('financeiro_lancamentos')
    .select('id, tipo, descricao, categoria, valor, data_vencimento, data_pagamento, observacao, created_at, updated_at')
    .order('data_vencimento', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) return { success: false, error: error.message, data: [] }
  return { success: true, data: data || [] }
})
