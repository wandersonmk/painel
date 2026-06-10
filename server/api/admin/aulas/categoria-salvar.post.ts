import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { id, nome, ordem } = await readBody<{
    id?: string
    nome: string
    ordem?: number
  }>(event)

  if (!nome?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Nome do módulo obrigatório' })
  }

  const supabase = getServiceClient()
  const payload = {
    nome: nome.trim(),
    ordem: Number.isFinite(ordem) ? Number(ordem) : 0,
    updated_at: new Date().toISOString(),
  }

  if (id) {
    const { error } = await supabase.from('parceiro_aulas_categorias').update(payload).eq('id', id)
    if (error) return { success: false, error: error.message }
  } else {
    const { error } = await supabase.from('parceiro_aulas_categorias').insert(payload)
    if (error) return { success: false, error: error.message }
  }

  return { success: true }
})
