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
  const body = await readBody<{ empresaId?: string; valor?: number | null; valorAnual?: number | null }>(event)

  const empresaId = String(body?.empresaId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(empresaId)) {
    throw createError({ statusCode: 400, statusMessage: 'Cliente inválido' })
  }

  // null limpa o valor; qualquer outra coisa precisa ser dinheiro plausível.
  const normalizar = (bruto: unknown, rotulo: string) => {
    if (bruto === null || bruto === undefined) return null
    const n = Number(bruto)
    if (!Number.isFinite(n) || n < 0 || n > 100_000) {
      throw createError({ statusCode: 400, statusMessage: `${rotulo} inválido` })
    }
    return Number(n.toFixed(2))
  }
  const valorFinal = normalizar(body?.valor, 'Valor mensal')
  const valorAnualFinal = normalizar(body?.valorAnual, 'Valor anual')

  aplicarRateLimit(`valor:${parceiro.id}`, 30, 60_000)

  const supabase = getServiceClient()

  // Vínculo revalidado a cada ação — nunca só no carregamento da página.
  const { data: vinculo, error: vincErr } = await supabase
    .from('parceiro_empresas')
    .select('id, cobranca_agzap, preco_anual')
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

  // Mensal fica em empresas (é o que o cliente vê no app); anual fica no
  // vínculo, porque é dado comercial do parceiro e o app não precisa dele.
  const { error } = await supabase
    .from('empresas')
    .update({ subscription_price: valorFinal, updated_at: new Date().toISOString() })
    .eq('id', empresaId)
  if (error) return failPublic(error, 'parceiro/valor-assinatura', 'Não foi possível salvar o valor.')

  const { error: anualErr } = await supabase
    .from('parceiro_empresas')
    .update({ preco_anual: valorAnualFinal, updated_at: new Date().toISOString() })
    .eq('id', vinculo.id)
  if (anualErr) return failPublic(anualErr, 'parceiro/valor-assinatura', 'Não foi possível salvar o valor anual.')

  await registrarAuditoria(supabase, event, {
    parceiro_id: parceiro.id,
    empresa_id: empresaId,
    ator_user_id: userId,
    ator_papel: 'parceiro',
    acao: 'valor_assinatura',
    estado_anterior: { subscription_price: empresa.subscription_price, preco_anual: vinculo.preco_anual },
    estado_novo: { subscription_price: valorFinal, preco_anual: valorAnualFinal },
    origem: 'painel_parceiro',
  })

  return { success: true as const, data: { valor: valorFinal, valorAnual: valorAnualFinal } }
})
