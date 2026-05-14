import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { clienteId, maxInstancias } = await readBody<{ clienteId: string; maxInstancias: number }>(event)

  if (!clienteId || !Number.isFinite(maxInstancias) || maxInstancias < 1 || maxInstancias > 20) {
    throw createError({ statusCode: 400, statusMessage: 'Dados inválidos' })
  }

  const supabase = getServiceClient()
  const { error } = await supabase
    .from('empresas')
    .update({ max_instancias: maxInstancias, updated_at: new Date().toISOString() })
    .eq('id', clienteId)

  if (error) return { success: false, error: error.message }
  return { success: true }
})
