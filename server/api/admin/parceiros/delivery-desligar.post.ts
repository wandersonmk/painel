import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { ACAO_DELIVERY_DESLIGADO_AGZAP, registrarAuditoria } from '~~/server/utils/parceiroLicencas'

/**
 * A Agzap desliga o Delivery de um cliente de parceiro. Mesmo efeito do desligar
 * em /api/admin/modulos, com registro na auditoria do parceiro. Cardápio e
 * pedidos ficam guardados; crédito não volta e o vencimento não muda.
 */
export default defineEventHandler(async (event) => {
  const adminUserId = await requireSuperAdmin(event)
  const body = await readBody<{ empresaId?: string }>(event)

  const empresaId = String(body?.empresaId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(empresaId)) {
    throw createError({ statusCode: 400, statusMessage: 'Cliente inválido' })
  }

  const supabase = getServiceClient()
  const { data: vinculo, error: vincErr } = await supabase
    .from('parceiro_empresas')
    .select('parceiro_id, empresas ( delivery_modulo_ativo, max_pedidos_mes )')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .limit(1)
    .maybeSingle()
  if (vincErr) return failPublic(vincErr, 'admin/parceiros/delivery-desligar', 'Não foi possível desligar o Delivery.')
  if (!vinculo) return { success: false as const, error: 'Este cliente não está vinculado a um parceiro.' }

  const empresa = (vinculo as any).empresas
  if (!empresa?.delivery_modulo_ativo) return { success: true as const }

  const { error } = await supabase.from('empresas')
    .update({ delivery_modulo_ativo: false, max_pedidos_mes: 0, updated_at: new Date().toISOString() })
    .eq('id', empresaId)
  if (error) return failPublic(error, 'admin/parceiros/delivery-desligar', 'Não foi possível desligar o Delivery.')

  await registrarAuditoria(supabase, event, {
    parceiro_id: vinculo.parceiro_id,
    empresa_id: empresaId,
    ator_user_id: adminUserId,
    ator_papel: 'admin',
    acao: ACAO_DELIVERY_DESLIGADO_AGZAP,
    estado_anterior: { delivery_modulo_ativo: true, max_pedidos_mes: empresa.max_pedidos_mes },
    estado_novo: { delivery_modulo_ativo: false, max_pedidos_mes: 0 },
    origem: 'painel_admin',
  })

  return { success: true as const }
})
