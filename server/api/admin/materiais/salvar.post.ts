import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { id, titulo, descricao, ordem, ativo } = await readBody<{
    id: string
    titulo?: string
    descricao?: string
    ordem?: number
    ativo?: boolean
  }>(event)

  if (!id) throw createError({ statusCode: 400, statusMessage: 'id obrigatório' })

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (titulo !== undefined) {
    if (!titulo.trim()) throw createError({ statusCode: 400, statusMessage: 'Título obrigatório' })
    payload.titulo = titulo.trim()
  }
  if (descricao !== undefined) payload.descricao = descricao?.trim() || null
  if (ordem !== undefined && Number.isFinite(ordem)) payload.ordem = Number(ordem)
  if (ativo !== undefined) payload.ativo = ativo

  const supabase = getServiceClient()
  const { error } = await supabase.from('parceiro_materiais').update(payload).eq('id', id)
  if (error) return { success: false, error: error.message }

  return { success: true }
})
