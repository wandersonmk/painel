import { requireParceiroPrepago } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import {
  ACAO_DELIVERY_LIBERADO, ACAO_DELIVERY_REMOVIDO, COTA_INICIAL_DELIVERY,
  aplicarRateLimit, registrarAuditoria, vinculoAtivoDoParceiro,
} from '~~/server/utils/parceiroLicencas'

const CONFIRMACAO_LIBERAR = 'Confirmou que o cliente vai vender pelo Delivery. Usar o crédito de Delivery em outro tipo de negócio é proibido pelo Termo do Parceiro.'

/**
 * Parceiro liga ou desliga o módulo Delivery de um cliente vinculado.
 *
 * Não consome crédito nem mexe no vencimento. A cota não é escolhida aqui:
 * liberar sempre deixa 500, e só a renovação com crédito muda esse número, para
 * o parceiro não conseguir aumentar limite. Remover zera a cota, igual ao
 * desligar em /api/admin/modulos; cardápio e pedidos ficam guardados.
 */
export default defineEventHandler(async (event) => {
  const { userId, parceiro } = await requireParceiroPrepago(event)
  const body = await readBody<{ empresaId?: string; acao?: string; confirmado?: boolean }>(event)

  const empresaId = String(body?.empresaId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(empresaId)) {
    throw createError({ statusCode: 400, statusMessage: 'Cliente inválido' })
  }
  if (body?.acao !== 'liberar' && body?.acao !== 'remover') {
    throw createError({ statusCode: 400, statusMessage: 'Ação inválida' })
  }
  const liberar = body.acao === 'liberar'
  if (liberar && body.confirmado !== true) {
    return { success: false as const, error: 'Confirme que este cliente vai vender pelo Delivery.' }
  }

  aplicarRateLimit(`delivery-modulo:${parceiro.id}`, 20, 60_000)

  const supabase = getServiceClient()

  // Vínculo revalidado a cada ação: o id que veio da tela nunca basta.
  const { data: vinculo, error: vincErr } = await vinculoAtivoDoParceiro(supabase, parceiro.id, empresaId)
  if (vincErr) return failPublic(vincErr, 'parceiro/delivery-modulo', 'Não foi possível concluir a operação.')
  if (!vinculo) {
    return { success: false as const, error: 'Este cliente não está vinculado à sua conta.' }
  }
  if (vinculo.cobranca_agzap) {
    return { success: false as const, error: 'Este cliente é cobrado diretamente pela Agzap. Fale com a Agzap para mudar o Delivery dele.' }
  }
  if (vinculo.bloqueio_origem === 'admin') {
    return { success: false as const, error: 'Este cliente está bloqueado pela Agzap. Solicite a liberação ao suporte.' }
  }

  const { data: empresa, error: empErr } = await supabase
    .from('empresas')
    .select('id, delivery_modulo_ativo, max_pedidos_mes')
    .eq('id', empresaId)
    .maybeSingle()
  if (empErr || !empresa) {
    return failPublic(empErr, 'parceiro/delivery-modulo', 'Não foi possível concluir a operação.')
  }

  // Já está como pedido: sair aqui impede que repetir "Liberar" derrube uma
  // cota de 5.000 para 500.
  if (empresa.delivery_modulo_ativo === liberar) {
    return { success: true as const, data: { delivery_ativo: liberar, cota_pedidos: empresa.max_pedidos_mes } }
  }

  const cota = liberar ? COTA_INICIAL_DELIVERY : 0
  const { error } = await supabase.from('empresas')
    .update({ delivery_modulo_ativo: liberar, max_pedidos_mes: cota, updated_at: new Date().toISOString() })
    .eq('id', empresaId)
  if (error) return failPublic(error, 'parceiro/delivery-modulo', 'Não foi possível concluir a operação.')

  await registrarAuditoria(supabase, event, {
    parceiro_id: parceiro.id,
    empresa_id: empresaId,
    ator_user_id: userId,
    ator_papel: 'parceiro',
    acao: liberar ? ACAO_DELIVERY_LIBERADO : ACAO_DELIVERY_REMOVIDO,
    estado_anterior: { delivery_modulo_ativo: empresa.delivery_modulo_ativo, max_pedidos_mes: empresa.max_pedidos_mes },
    estado_novo: { delivery_modulo_ativo: liberar, max_pedidos_mes: cota },
    motivo: liberar ? CONFIRMACAO_LIBERAR : null,
    origem: 'painel_parceiro',
  })

  return { success: true as const, data: { delivery_ativo: liberar, cota_pedidos: cota } }
})
