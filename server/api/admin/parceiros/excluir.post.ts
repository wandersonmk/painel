import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { parceiroId } = await readBody<{ parceiroId: string }>(event)

  if (!parceiroId) {
    throw createError({ statusCode: 400, statusMessage: 'parceiroId obrigatório' })
  }

  // Exclui o parceiro; vínculos e extrato caem junto (FK on delete cascade)
  const supabase = getServiceClient()
  const { error } = await supabase.from('parceiros').delete().eq('id', parceiroId)
  if (error) return { success: false, error: error.message }

  return { success: true }
})
