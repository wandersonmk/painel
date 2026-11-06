import { requireParceiro } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'

/** Alertas da Agzap que este parceiro ainda não confirmou, do mais antigo ao mais novo. */
export default defineEventHandler(async (event) => {
  const { parceiro } = await requireParceiro(event)

  const { data, error } = await getServiceClient()
    .from('parceiro_alertas')
    .select('id, empresa_nome, mensagem, criado_em')
    .eq('parceiro_id', parceiro.id)
    .is('lido_em', null)
    .order('criado_em', { ascending: true })
  if (error) return failPublic(error, 'parceiro/alertas', 'Não foi possível carregar os alertas.')

  return { success: true as const, data: data ?? [] }
})
