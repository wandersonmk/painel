import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { id } = await readBody<{ id: string }>(event)

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id obrigatório' })
  }

  // As aulas do módulo não são apagadas — ficam "sem módulo" (FK on delete set null)
  const supabase = getServiceClient()
  const { error } = await supabase.from('parceiro_aulas_categorias').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  return { success: true }
})
