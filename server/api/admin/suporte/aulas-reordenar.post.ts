import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { trilhaId, aulaIds } = await readBody<{ trilhaId: string; aulaIds: string[] }>(event)

  if (!trilhaId || !Array.isArray(aulaIds) || aulaIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Dados de reordenação inválidos' })
  }

  const supabase = getServiceClient()
  // O filtro por trilha_id garante que só aulas da própria trilha são renumeradas
  for (let i = 0; i < aulaIds.length; i++) {
    const { error } = await supabase
      .from('suporte_aulas')
      .update({ ordem: i + 1 })
      .eq('id', aulaIds[i] as string)
      .eq('trilha_id', trilhaId)
    if (error) return { success: false, error: error.message }
  }

  return { success: true }
})
