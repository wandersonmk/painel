import { requireParceiro } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'

/**
 * Link de indicação do parceiro logado (06/10/2026). Quem cria a conta por ele
 * já nasce vinculado a este parceiro (o cadastro do app grava parceiro_empresas).
 */
const APP_URL = 'https://app.agzap.com.br'

export default defineEventHandler(async (event) => {
  const { parceiro } = await requireParceiro(event)
  const { data, error } = await getServiceClient()
    .from('parceiros')
    .select('codigo_indicacao')
    .eq('id', parceiro.id)
    .maybeSingle()
  if (error) return { success: false, error: error.message }
  const codigo = (data as { codigo_indicacao?: string } | null)?.codigo_indicacao
  if (!codigo) return { success: false, error: 'Seu link ainda não foi gerado. Fale com a Agzap.' }
  return { success: true, data: { codigo, url: `${APP_URL}/login?parceiro=${encodeURIComponent(codigo)}` } }
})
