import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

// Marca ou desmarca o cliente como não pagante (permuta, cortesia ou conta
// interna). Só muda o faturamento do Dashboard: o acesso ao app, o plano e o
// vencimento continuam iguais. Botão no menu do cliente (14/10/2026).
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const body = await readBody<{ clienteId?: string; naoPagante?: boolean }>(event)

  if (!body?.clienteId || typeof body.naoPagante !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'clienteId e naoPagante são obrigatórios' })
  }

  const supabase = getServiceClient()
  const { error } = await supabase
    .from('empresas')
    .update({ nao_pagante: body.naoPagante, updated_at: new Date().toISOString() })
    .eq('id', body.clienteId)

  if (error) return { success: false, error: error.message }
  return { success: true }
})
