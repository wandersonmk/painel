import { requireParceiro } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { ACAO_ALERTA_LIDO, registrarAuditoria } from '~~/server/utils/parceiroLicencas'

/** "Li e entendi": grava quem confirmou e quando. Só vale para alerta do próprio parceiro. */
export default defineEventHandler(async (event) => {
  const { userId, parceiro } = await requireParceiro(event)
  const body = await readBody<{ alertaId?: string }>(event)

  const alertaId = String(body?.alertaId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(alertaId)) {
    throw createError({ statusCode: 400, statusMessage: 'Alerta inválido' })
  }

  const supabase = getServiceClient()
  const { data: alerta, error } = await supabase
    .from('parceiro_alertas')
    .update({ lido_em: new Date().toISOString(), lido_por: userId })
    .eq('id', alertaId)
    .eq('parceiro_id', parceiro.id)
    .is('lido_em', null)
    .select('id, empresa_id')
    .maybeSingle()
  if (error) return failPublic(error, 'parceiro/alertas', 'Não foi possível confirmar a leitura.')

  // Sem linha: já estava lido ou não é deste parceiro. A tela segue sem repetir o registro.
  if (alerta) {
    await registrarAuditoria(supabase, event, {
      parceiro_id: parceiro.id,
      empresa_id: alerta.empresa_id,
      ator_user_id: userId,
      ator_papel: 'parceiro',
      acao: ACAO_ALERTA_LIDO,
      estado_novo: { alerta_id: alerta.id },
      origem: 'painel_parceiro',
    })
  }

  return { success: true as const }
})
