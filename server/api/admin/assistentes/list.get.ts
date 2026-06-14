import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const supabase = getServiceClient()

  // Traz todos os modelos (inclusive ocultos) para gestão no painel
  const { data, error } = await supabase
    .from('assistente_modelos')
    .select('id, slug, nome, segmento, descricao, icone, cor, personalidade, instrucao_principal, requer_api, integracao_video_url, ordem, ativo, created_at')
    .order('ordem')
    .order('created_at', { ascending: false })
  if (error) return { success: false, error: error.message }

  return { success: true, data: data || [] }
})
