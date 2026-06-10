import { requireParceiro } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'

export const TERMOS_VERSAO = '1.0'

export default defineEventHandler(async (event) => {
  const { parceiro, userId } = await requireParceiro(event)

  const supabase = getServiceClient()
  const dadosSplit = {
    ...(parceiro.dados_split || {}),
    termos: {
      aceito_em: new Date().toISOString(),
      versao: TERMOS_VERSAO,
      auth_user_id: userId,
    },
  }

  const { error } = await supabase
    .from('parceiros')
    .update({ dados_split: dadosSplit, updated_at: new Date().toISOString() })
    .eq('id', parceiro.id)
  if (error) return { success: false, error: error.message }

  return { success: true }
})
