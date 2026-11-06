import { requireParceiroPrepago } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import {
  ACAO_RENOVACAO_COM_AVISO, TIPOS_CREDITO_DELIVERY, isTipoCredito, mensagemErro, normalizarIdempotencyKey,
  aplicarRateLimit, registrarAuditoria, registrarTentativaDelivery, vinculoAtivoDoParceiro,
  type UsoDelivery,
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
  const body = await readBody<{
    empresaId?: string
    tipoCredito?: string
    idempotencyKey?: string
    confirmouAvisoUso?: boolean
  }>(event)

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

  // O bloqueio por falta de uso é da função do banco. Aqui fica só o aviso: renova,
  // mas o parceiro precisa ter lido e confirmado na tela.
  let usoComAviso: UsoDelivery | null = null
  if (TIPOS_CREDITO_DELIVERY.includes(body.tipoCredito)) {
    const { data: vinculo } = await vinculoAtivoDoParceiro(supabase, parceiro.id, empresaId)
    if (vinculo) {
      const { data: uso, error: usoErr } = await supabase.rpc('parceiro_delivery_uso', { p_empresa_id: empresaId })
      if (usoErr) return failPublic(usoErr, 'parceiro/renovar', 'Não foi possível concluir a renovação.')
      if ((uso as UsoDelivery | null)?.situacao === 'aviso') {
        if (body.confirmouAvisoUso !== true) {
          return { success: false as const, codigo: 'DELIVERY_USAGE_WARNING', error: 'Leia os avisos e confirme que este cliente vende pelo Delivery.' }
        }
        usoComAviso = uso as UsoDelivery
      }
    }
  }

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
    if (resultado?.erro === 'DELIVERY_MODULE_REQUIRED') {
      await registrarTentativaDelivery(supabase, event, {
        parceiroId: parceiro.id, empresaId, userId, tipoCredito: body.tipoCredito,
      })
    }
    return { success: false as const, codigo: resultado?.erro ?? null, error: mensagemErro(resultado?.erro) }
  }

  if (usoComAviso && !resultado.repetida) {
    await registrarAuditoria(supabase, event, {
      parceiro_id: parceiro.id,
      empresa_id: empresaId,
      ator_user_id: userId,
      ator_papel: 'parceiro',
      acao: ACAO_RENOVACAO_COM_AVISO,
      estado_novo: {
        tipo_credito: body.tipoCredito,
        pedidos_30d: usoComAviso.pedidos_30d,
        clientes_30d: usoComAviso.clientes_30d,
        renovacoes_delivery: usoComAviso.renovacoes_delivery,
      },
      motivo: 'Leu os avisos e confirmou que o cliente vende pelo Delivery.',
      origem: 'painel_parceiro',
    })
  }

  return { success: true as const, data: resultado }
})
