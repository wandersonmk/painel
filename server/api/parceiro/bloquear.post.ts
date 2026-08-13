import { requireParceiroPrepago } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { calcularStatusReativacao } from '~~/server/utils/acessoCliente'
import { aplicarRateLimit, registrarAuditoria } from '~~/server/utils/parceiroLicencas'

/**
 * Bloqueio/desbloqueio comercial do parceiro sobre um cliente dele.
 *
 * Usa exatamente o mesmo mecanismo do /api/admin/desativar (empresas.ativo +
 * subscription_status), então o efeito para o cliente final é o já conhecido.
 * O que muda é o registro de QUEM bloqueou, em parceiro_empresas.bloqueio_origem.
 *
 * Não altera vencimento, não devolve crédito, não exclui nada.
 */
export default defineEventHandler(async (event) => {
  const { userId, parceiro } = await requireParceiroPrepago(event)
  const body = await readBody<{ empresaId?: string; bloquear?: boolean; motivo?: string }>(event)

  const empresaId = String(body?.empresaId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(empresaId)) {
    throw createError({ statusCode: 400, statusMessage: 'Cliente inválido' })
  }
  if (typeof body?.bloquear !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'Ação inválida' })
  }
  const motivo = (body.motivo ?? '').trim().slice(0, 300) || null

  aplicarRateLimit(`bloquear:${parceiro.id}`, 20, 60_000)

  const supabase = getServiceClient()

  // Vínculo revalidado a cada ação — nunca só no carregamento da página.
  const { data: vinculo, error: vincErr } = await supabase
    .from('parceiro_empresas')
    .select('id, bloqueio_origem, cobranca_agzap')
    .eq('empresa_id', empresaId)
    .eq('parceiro_id', parceiro.id)
    .eq('ativo', true)
    .maybeSingle()
  if (vincErr) return failPublic(vincErr, 'parceiro/bloquear', 'Não foi possível concluir a operação.')
  if (!vinculo) {
    return { success: false as const, error: 'Este cliente não está vinculado à sua conta.' }
  }

  const { data: empresa, error: empErr } = await supabase
    .from('empresas')
    .select('id, ativo, subscription_status, subscription_plan, subscription_period, subscription_renews_at, trial_ends_at')
    .eq('id', empresaId)
    .maybeSingle()
  if (empErr || !empresa) {
    return failPublic(empErr, 'parceiro/bloquear', 'Não foi possível concluir a operação.')
  }

  // Bloqueio da Agzap prevalece: o parceiro não desfaz decisão administrativa.
  if (vinculo.bloqueio_origem === 'admin') {
    return {
      success: false as const,
      error: 'Este cliente está bloqueado pela Agzap. Solicite a liberação ao suporte.',
    }
  }

  const agora = new Date().toISOString()

  if (body.bloquear) {
    const { error } = await supabase.from('empresas')
      .update({ ativo: false, subscription_status: 'canceled', updated_at: agora })
      .eq('id', empresaId)
    if (error) return failPublic(error, 'parceiro/bloquear', 'Não foi possível bloquear o cliente.')

    await supabase.from('parceiro_empresas')
      .update({ bloqueio_origem: 'parceiro', bloqueado_em: agora, bloqueado_por: userId, updated_at: agora })
      .eq('id', vinculo.id)
  }
  else {
    // Desbloquear não renova e não consome crédito: só recalcula o status.
    const novoStatus = calcularStatusReativacao(empresa)
    const { error } = await supabase.from('empresas')
      .update({ ativo: true, subscription_status: novoStatus, updated_at: agora })
      .eq('id', empresaId)
    if (error) return failPublic(error, 'parceiro/bloquear', 'Não foi possível desbloquear o cliente.')

    await supabase.from('parceiro_empresas')
      .update({ bloqueio_origem: null, bloqueado_em: null, bloqueado_por: null, updated_at: agora })
      .eq('id', vinculo.id)
  }

  await registrarAuditoria(supabase, event, {
    parceiro_id: parceiro.id,
    empresa_id: empresaId,
    ator_user_id: userId,
    ator_papel: 'parceiro',
    acao: body.bloquear ? 'bloqueio_cliente' : 'desbloqueio_cliente',
    estado_anterior: { ativo: empresa.ativo, status: empresa.subscription_status, bloqueio_origem: vinculo.bloqueio_origem },
    estado_novo: { ativo: !body.bloquear, bloqueio_origem: body.bloquear ? 'parceiro' : null },
    motivo,
    origem: 'painel_parceiro',
  })

  return { success: true as const }
})
