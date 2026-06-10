import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const supabase = getServiceClient()

  const { data, error } = await supabase
    .from('parceiro_materiais')
    .select('id, titulo, descricao, tipo, arquivo_url, arquivo_nome, tamanho_bytes, ordem, ativo, created_at')
    .order('ordem')
    .order('created_at', { ascending: false })
  if (error) return { success: false, error: error.message }

  return { success: true, data: data || [] }
})
