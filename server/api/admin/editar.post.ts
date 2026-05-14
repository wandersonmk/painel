import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const body = await readBody<{ clienteId: string; nome: string; email: string; whatsapp: string | null; subscription_price: number | null }>(event)

  if (!body?.clienteId) {
    throw createError({ statusCode: 400, statusMessage: 'clienteId obrigatório' })
  }

  const supabase = getServiceClient()
  const { error } = await supabase
    .from('empresas')
    .update({
      nome: body.nome,
      email: body.email,
      whatsapp: body.whatsapp,
      subscription_price: body.subscription_price,
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.clienteId)

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
})
