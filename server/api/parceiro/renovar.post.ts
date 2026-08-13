import { requireParceiroPrepago } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import {
  isTipoCredito, mensagemErro, normalizarIdempotencyKey, aplicarRateLimit,
} from '~~/server/utils/parceiroLicencas'

/**
 * Renovação do cliente consumindo 1 crédito do parceiro.
 *
 * O trabalho pesado está na função parceiro_consumir_credito_renovacao, que roda
 * tudo numa transação só: valida vínculo, trava a carteira, debita, grava o
 * ledger, move o vencimento e audita. Aqui só autenticamos e repassamos.
 *
 * O parceiro NUNCA é lido do body — sai do token.
 */
export default defineEventHandler(async (event) => {
  const { userId, parceiro } = await requireParceiroPrepago(event)
  const body = await readBody<{ empresaId?: string; tipoCredito?: string; idempotencyKey?: string }>(event)

  const empresaId = String(body?.empresaId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(empresaId)) {
    throw createError({ statusCode: 400, statusMessage: 'Cliente inválido' })
  }
  if (!isTipoCredito(body?.tipoCredito)) {
    throw createError({ statusCode: 400, statusMessage: 'Tipo de crédito inválido' })
  }
  const idempotencyKey = normalizarIdempotencyKey(body?.idempotencyKey, `renov:${parceiro.id}`)

  aplicarRateLimit(`renovar:${parceiro.id}`, 10, 60_000)

  const supabase = getServiceClient()
  const { data, error } = await supabase.rpc('parceiro_consumir_credito_renovacao', {
    p_auth_user_id: userId,
    p_empresa_id: empresaId,
    p_tipo_credito: body.tipoCredito,
    p_idempotency_key: idempotencyKey,
  })
  if (error) return failPublic(error, 'parceiro/renovar', 'Não foi possível concluir a renovação.')

  const resultado = data as {
    success: boolean
    erro?: string | null
    repetida?: boolean
    renovacao_id?: string
    vencimento_anterior?: string | null
    vencimento_novo?: string
    saldo_restante?: number
  }

  if (!resultado?.success) {
    return { success: false as const, codigo: resultado?.erro ?? null, error: mensagemErro(resultado?.erro) }
  }

  return { success: true as const, data: resultado }
})
