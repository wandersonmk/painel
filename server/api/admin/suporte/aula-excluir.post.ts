import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { id } = await readBody<{ id: string }>(event)
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID da aula obrigatório' })
  }

  // DELETE cascateia para suporte_aula_progresso e suporte_aula_anotacoes —
  // o front exige confirmação dupla antes de chamar esta rota
  const supabase = getServiceClient()
  const { error } = await supabase.from('suporte_aulas').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  return { success: true }
})
