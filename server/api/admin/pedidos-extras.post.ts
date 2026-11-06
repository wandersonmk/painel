import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'

const MENSAGENS: Record<string, string> = {
  FORBIDDEN_ACTION: 'Você não tem permissão para esta ação.',
  INVALID_QUANTITY: 'Informe a quantidade de pedidos extras.',
  INVALID_VALUE: 'Valor cobrado inválido.',
  DELIVERY_MODULE_REQUIRED: 'Esta empresa não tem o módulo Delivery ligado.',
}

/**
 * Venda de pedidos extras. Só a Agzap vende: a função do banco confere de novo
 * se quem chamou é superAdmin, soma o saldo e grava a venda numa transação só.
 */
export default defineEventHandler(async (event) => {
  const adminUserId = await requireSuperAdmin(event)
  const body = await readBody<{ clienteId?: string; quantidade?: number; valor?: number }>(event)

  const empresaId = String(body?.clienteId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(empresaId)) {
    throw createError({ statusCode: 400, statusMessage: 'Cliente inválido' })
  }
  const quantidade = Number(body?.quantidade)
  const valor = Number(body?.valor)
  if (!Number.isInteger(quantidade) || !Number.isFinite(valor)) {
    throw createError({ statusCode: 400, statusMessage: 'Informe a quantidade e o valor cobrado.' })
  }

  const { data, error } = await getServiceClient().rpc('delivery_adicionar_pedidos_extras', {
    p_admin_user_id: adminUserId,
    p_empresa_id: empresaId,
    p_quantidade: quantidade,
    p_valor: valor,
  })
  if (error) return failPublic(error, 'admin/pedidos-extras', 'Não foi possível adicionar os pedidos extras.')

  const resultado = data as { success: boolean; erro?: string; saldo?: number }
  if (!resultado?.success) {
    return { success: false as const, error: MENSAGENS[resultado?.erro ?? ''] ?? 'Não foi possível adicionar os pedidos extras.' }
  }
  return { success: true as const, data: { saldo: resultado.saldo ?? 0 } }
})
