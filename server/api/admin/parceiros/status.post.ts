import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { parceiroId, ativo } = await readBody<{ parceiroId: string; ativo: boolean }>(event)

  if (!parceiroId || typeof ativo !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'parceiroId e ativo obrigatórios' })
  }

  const supabase = getServiceClient()
  const { error } = await supabase
    .from('parceiros')
    .update({ ativo, updated_at: new Date().toISOString() })
    .eq('id', parceiroId)
  if (error) return { success: false, error: error.message }

  return { success: true }
})
