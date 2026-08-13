import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { isTipoCredito, mensagemErro, normalizarIdempotencyKey } from '~~/server/utils/parceiroLicencas'

const OPERACOES = ['compra', 'concessao_admin', 'correcao', 'migracao']

/**
 * Concessão / correção de créditos de licença pelo administrador.
 *
 * A função do banco confere de novo se quem chamou é superAdmin, então nem um
 * bug aqui libera crédito indevido. Correção entra como lançamento novo — o
 * histórico original nunca é apagado.
 */
export default defineEventHandler(async (event) => {
  const adminUserId = await requireSuperAdmin(event)
  const body = await readBody<{
    parceiroId?: string
    tipoCredito?: string
    quantidade?: number
    operacao?: string
    referencia?: string
    valorPago?: number | null
    descricao?: string
    idempotencyKey?: string
  }>(event)

  const parceiroId = String(body?.parceiroId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(parceiroId)) {
    throw createError({ statusCode: 400, statusMessage: 'Parceiro inválido' })
  }
  if (!isTipoCredito(body?.tipoCredito)) {
    throw createError({ statusCode: 400, statusMessage: 'Tipo de crédito inválido' })
  }
  const operacao = String(body?.operacao ?? 'concessao_admin')
  if (!OPERACOES.includes(operacao)) {
    throw createError({ statusCode: 400, statusMessage: 'Operação inválida' })
  }
  const quantidade = Number(body?.quantidade)
  if (!Number.isInteger(quantidade) || quantidade === 0 || Math.abs(quantidade) > 10_000) {
    throw createError({ statusCode: 400, statusMessage: 'Quantidade inválida' })
  }
  if (quantidade < 0 && operacao !== 'correcao') {
    throw createError({ statusCode: 400, statusMessage: 'Só um lançamento de correção pode ser negativo' })
  }
  const valorPago = body?.valorPago === null || body?.valorPago === undefined
    ? null
    : Number(body.valorPago)
  if (valorPago !== null && (!Number.isFinite(valorPago) || valorPago < 0 || valorPago > 1_000_000)) {
    throw createError({ statusCode: 400, statusMessage: 'Valor pago inválido' })
  }
  if (operacao === 'correcao' && !String(body?.descricao ?? '').trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Correção exige uma justificativa' })
  }

  const idempotencyKey = normalizarIdempotencyKey(body?.idempotencyKey, `admcred:${parceiroId}`)

  const supabase = getServiceClient()
  const { data, error } = await supabase.rpc('parceiro_conceder_creditos', {
    p_admin_user_id: adminUserId,
    p_parceiro_id: parceiroId,
    p_tipo_credito: body.tipoCredito,
    p_quantidade: quantidade,
    p_operacao: operacao,
    p_idempotency_key: idempotencyKey,
    p_referencia: String(body?.referencia ?? '').trim().slice(0, 120) || null,
    p_valor_pago: valorPago,
    p_descricao: String(body?.descricao ?? '').trim().slice(0, 300) || null,
  })
  if (error) return failPublic(error, 'admin/parceiros/creditos', 'Não foi possível lançar os créditos.')

  const resultado = data as { success: boolean; erro?: string; saldo?: number; repetida?: boolean }
  if (!resultado?.success) {
    return { success: false as const, codigo: resultado?.erro ?? null, error: mensagemErro(resultado?.erro) }
  }

  return { success: true as const, data: resultado }
})
