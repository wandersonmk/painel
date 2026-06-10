import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { empresaId } = await readBody<{ empresaId: string }>(event)

  if (!empresaId) {
    throw createError({ statusCode: 400, statusMessage: 'empresaId obrigatório' })
  }

  const supabase = getServiceClient()
  const { error } = await supabase
    .from('parceiro_empresas')
    .delete()
    .eq('empresa_id', empresaId)
  if (error) return { success: false, error: error.message }

  return { success: true }
})
