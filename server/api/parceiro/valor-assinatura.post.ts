import { requireParceiroPrepago } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { aplicarRateLimit, registrarAuditoria } from '~~/server/utils/parceiroLicencas'

/**
 * O parceiro define quanto o cliente dele vê como valor da assinatura.
 *
 * Quem revende cobra o preço que quiser, então a tela de assinatura do cliente
 * precisa mostrar o valor combinado com o parceiro, não o de tabela da Agzap.
 *
 * Escreve UMA coluna: empresas.subscription_price. Não toca em vencimento,
 * status, plano nem em nada do Stripe — mudar preço não pode virar renovação.
 */
export default defineEventHandler(async (event) => {
  const { userId, parceiro } = await requireParceiroPrepago(event)
  const body = await readBody<{ empresaId?: string; valor?: number | null }>(event)

  const empresaId = String(body?.empresaId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(empresaId)) {
    throw createError({ statusCode: 400, statusMessage: 'Cliente inválido' })
  }

  // null limpa o valor; qualquer outra coisa precisa ser dinheiro plausível.
  const valor = body?.valor === null || body?.valor === undefined ? null : Number(body.valor)
  if (valor !== null && (!Number.isFinite(valor) || valor < 0 || valor > 100_000)) {
    throw createError({ statusCode: 400, statusMessage: 'Valor inválido' })
  }
  const valorFinal = valor === null ? null : Number(valor.toFixed(2))

  aplicarRateLimit(`valor:${parceiro.id}`, 30, 60_000)

  const supabase = getServiceClient()

  // Vínculo revalidado a cada ação — nunca só no carregamento da página.
  const { data: vinculo, error: vincErr } = await supabase
    .from('parceiro_empresas')
    .select('id, cobranca_agzap')
    .eq('empresa_id', empresaId)
    .eq('parceiro_id', parceiro.id)
    .eq('ativo', true)
    .maybeSingle()
  if (vincErr) return failPublic(vincErr, 'parceiro/valor-assinatura', 'Não foi possível concluir a operação.')
  if (!vinculo) {
    return { success: false as const, error: 'Este cliente não está vinculado à sua conta.' }
  }
  if (vinculo.cobranca_agzap) {
    return {
      success: false as const,
      error: 'Este cliente é cobrado diretamente pela Agzap — o valor da assinatura é definido por ela.',
    }
  }

  const { data: empresa, error: empErr } = await supabase
    .from('empresas')
    .select('id, subscription_price')
    .eq('id', empresaId)
    .maybeSingle()
  if (empErr || !empresa) {
    return failPublic(empErr, 'parceiro/valor-assinatura', 'Não foi possível concluir a operação.')
  }

  const { error } = await supabase
    .from('empresas')
    .update({ subscription_price: valorFinal, updated_at: new Date().toISOString() })
    .eq('id', empresaId)
  if (error) return failPublic(error, 'parceiro/valor-assinatura', 'Não foi possível salvar o valor.')

  await registrarAuditoria(supabase, event, {
    parceiro_id: parceiro.id,
    empresa_id: empresaId,
    ator_user_id: userId,
    ator_papel: 'parceiro',
    acao: 'valor_assinatura',
    estado_anterior: { subscription_price: empresa.subscription_price },
    estado_novo: { subscription_price: valorFinal },
    origem: 'painel_parceiro',
  })

  return { success: true as const, data: { valor: valorFinal } }
})
