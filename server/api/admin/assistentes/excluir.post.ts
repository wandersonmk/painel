import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { id } = await readBody<{ id: string }>(event)
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID do modelo obrigatório' })
  }

  // Modelos não têm dependências de clientes (cada cliente copia o conteúdo
  // para o próprio assistente), então excluir não cascateia dados de clientes.
  const supabase = getServiceClient()
  const { error } = await supabase.from('assistente_modelos').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  return { success: true }
})
