import { requireParceiroPrepago } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import {
  TIPOS_CREDITO_DELIVERY, aplicarRateLimit, isTipoCredito, registrarTentativaDelivery, vinculoAtivoDoParceiro,
} from '~~/server/utils/parceiroLicencas'

/**
 * O parceiro escolheu crédito de Delivery para um cliente sem o módulo. A tela
 * já barra e nada é consumido; aqui só fica o registro para a Agzap acompanhar.
 * Só grava depois de conferir no banco, para não valer o que veio do navegador.
 */
export default defineEventHandler(async (event) => {
  const { userId, parceiro } = await requireParceiroPrepago(event)
  const body = await readBody<{ empresaId?: string; tipoCredito?: string }>(event)

  const empresaId = String(body?.empresaId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(empresaId)) {
    throw createError({ statusCode: 400, statusMessage: 'Cliente inválido' })
  }
  if (!isTipoCredito(body?.tipoCredito) || !TIPOS_CREDITO_DELIVERY.includes(body.tipoCredito)) {
    throw createError({ statusCode: 400, statusMessage: 'Tipo de crédito inválido' })
  }

  aplicarRateLimit(`delivery-tentativa:${parceiro.id}`, 20, 60_000)

  const supabase = getServiceClient()
  const { data: vinculo } = await vinculoAtivoDoParceiro(supabase, parceiro.id, empresaId)
  if (!vinculo) return { success: true as const }

  const { data: empresa } = await supabase
    .from('empresas').select('delivery_modulo_ativo').eq('id', empresaId).maybeSingle()
  if (!empresa || empresa.delivery_modulo_ativo) return { success: true as const }

  await registrarTentativaDelivery(supabase, event, {
    parceiroId: parceiro.id, empresaId, userId, tipoCredito: body.tipoCredito,
  })
  return { success: true as const }
})
