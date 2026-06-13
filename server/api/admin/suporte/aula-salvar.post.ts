import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const body = await readBody<{
    id?: string
    trilhaId?: string
    titulo: string
    descricao?: string | null
    videoUrl?: string | null
    thumbnailUrl?: string | null
    duracaoSegundos?: number
    ordem?: number
    ativo?: boolean
  }>(event)

  if (!body.titulo?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Título obrigatório' })
  }

  const supabase = getServiceClient()
  // video_url vazio vira NULL — o app mostra a capa "Em breve"
  const payload = {
    titulo: body.titulo.trim(),
    descricao: body.descricao?.trim() || null,
    video_url: body.videoUrl?.trim() || null,
    thumbnail_url: body.thumbnailUrl?.trim() || null,
    duracao_segundos: Number.isFinite(body.duracaoSegundos) ? Math.max(0, Math.round(Number(body.duracaoSegundos))) : 0,
    ordem: Number.isFinite(body.ordem) ? Number(body.ordem) : 0,
    ativo: body.ativo ?? true,
  }

  if (body.id) {
    const { error } = await supabase.from('suporte_aulas').update(payload).eq('id', body.id)
    if (error) return { success: false, error: error.message }
  } else {
    if (!body.trilhaId) {
      throw createError({ statusCode: 400, statusMessage: 'Escolha a trilha da nova aula' })
    }
    const { error } = await supabase.from('suporte_aulas').insert({ ...payload, trilha_id: body.trilhaId })
    if (error) return { success: false, error: error.message }
  }

  return { success: true }
})
