import { requireParceiro } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'

/** 1.0 = termo de comissão. 2.0 = termo de licenças pré-pagas. */
export const TERMOS_VERSAO = '1.0'
export const TERMOS_VERSAO_LICENCAS = '2.0'

export function versaoTermos(modelo?: string) {
  return modelo === 'licenca_prepaga' ? TERMOS_VERSAO_LICENCAS : TERMOS_VERSAO
}

export default defineEventHandler(async (event) => {
  const { parceiro, userId } = await requireParceiro(event)

  const supabase = getServiceClient()
  const dadosSplit = {
    ...(parceiro.dados_split || {}),
    termos: {
      aceito_em: new Date().toISOString(),
      // Migrar de modelo troca a versão, então o parceiro é chamado a
      // aceitar o termo novo no próximo acesso.
      versao: versaoTermos(parceiro.modelo_negocio),
      auth_user_id: userId,
    },
  }

  const { error } = await supabase
    .from('parceiros')
    .update({ dados_split: dadosSplit, updated_at: new Date().toISOString() })
    .eq('id', parceiro.id)
  if (error) return failPublic(error, 'parceiro/aceitar-termos', 'Não foi possível registrar o aceite.')

  return { success: true }
})
