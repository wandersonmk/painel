import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  const adminUserId = await requireSuperAdmin(event)
  const { parceiroId, valor, observacao } = await readBody<{
    parceiroId: string
    valor: number
    observacao?: string
  }>(event)

  if (!parceiroId) {
    throw createError({ statusCode: 400, statusMessage: 'parceiroId obrigatório' })
  }
  if (!Number.isFinite(valor) || valor === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Valor do ajuste inválido' })
  }

  const supabase = getServiceClient()
  const agora = new Date().toISOString()
  const valorAjuste = Math.round(Number(valor) * 100) / 100

  // Ajuste manual entra direto no saldo liberado (liberar_em = agora).
  // Valor negativo remove saldo; positivo adiciona.
  const { error } = await supabase.from('parceiro_comissao_pagamentos').insert({
    parceiro_id: parceiroId,
    empresa_id: null,
    origem: 'ajuste',
    valor_base: valorAjuste,
    comissao_percentual: 100,
    valor_comissao: valorAjuste,
    pago_em: agora,
    liberar_em: agora,
    status: 'retido',
    observacao: observacao?.trim() || null,
    criado_por: adminUserId,
  })
  if (error) return { success: false, error: error.message }

  return { success: true }
})
