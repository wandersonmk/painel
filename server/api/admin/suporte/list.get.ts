import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const supabase = getServiceClient()

  const [trilhasRes, aulasRes] = await Promise.all([
    supabase
      .from('suporte_trilhas')
      .select('id, slug, nome, nivel_label, descricao, icone, cor, ordem, ativo')
      .order('ordem')
      .order('created_at'),
    supabase
      .from('suporte_aulas')
      .select('id, trilha_id, titulo, descricao, video_url, thumbnail_url, duracao_segundos, ordem, ativo')
      .order('ordem')
      .order('created_at'),
  ])
  if (trilhasRes.error) return { success: false, error: trilhasRes.error.message }
  if (aulasRes.error) return { success: false, error: aulasRes.error.message }

  return {
    success: true,
    data: { trilhas: trilhasRes.data || [], aulas: aulasRes.data || [] },
  }
})
