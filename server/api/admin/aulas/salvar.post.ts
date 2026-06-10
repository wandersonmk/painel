import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { id, titulo, descricao, youtubeUrl, ordem, ativo, categoriaId } = await readBody<{
    id?: string
    titulo: string
    descricao?: string
    youtubeUrl: string
    ordem?: number
    ativo?: boolean
    categoriaId?: string | null
  }>(event)

  if (!titulo?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Título obrigatório' })
  }
  if (!youtubeUrl?.trim() || !/youtu\.?be/i.test(youtubeUrl)) {
    throw createError({ statusCode: 400, statusMessage: 'Link do YouTube inválido' })
  }

  const supabase = getServiceClient()
  const payload = {
    titulo: titulo.trim(),
    descricao: descricao?.trim() || null,
    youtube_url: youtubeUrl.trim(),
    ordem: Number.isFinite(ordem) ? Number(ordem) : 0,
    ativo: ativo ?? true,
    categoria_id: categoriaId || null,
    updated_at: new Date().toISOString(),
  }

  if (id) {
    const { error } = await supabase.from('parceiro_aulas').update(payload).eq('id', id)
    if (error) return { success: false, error: error.message }
  } else {
    const { error } = await supabase.from('parceiro_aulas').insert(payload)
    if (error) return { success: false, error: error.message }
  }

  return { success: true }
})
