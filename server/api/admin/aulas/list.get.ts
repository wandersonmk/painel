import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const supabase = getServiceClient()

  const [aulasRes, categoriasRes] = await Promise.all([
    supabase
      .from('parceiro_aulas')
      .select('id, titulo, descricao, youtube_url, ordem, ativo, categoria_id, created_at')
      .order('ordem')
      .order('created_at'),
    supabase
      .from('parceiro_aulas_categorias')
      .select('id, nome, ordem, ativo')
      .order('ordem')
      .order('created_at'),
  ])
  if (aulasRes.error) return { success: false, error: aulasRes.error.message }
  if (categoriasRes.error) return { success: false, error: categoriasRes.error.message }

  return {
    success: true,
    data: { aulas: aulasRes.data || [], categorias: categoriasRes.data || [] },
  }
})
