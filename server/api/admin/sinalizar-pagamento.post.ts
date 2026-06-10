import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { calcularLiberarEm } from '~~/server/utils/parceiroComissoes'

export default defineEventHandler(async (event) => {
  const adminUserId = await requireSuperAdmin(event)
  const { empresaId, valorBase, pagoEm, observacao } = await readBody<{
    empresaId: string
    valorBase?: number
    pagoEm?: string
    observacao?: string
  }>(event)

  if (!empresaId) {
    throw createError({ statusCode: 400, statusMessage: 'empresaId obrigatório' })
  }

  const supabase = getServiceClient()

  const { data: vinculo, error: vincErr } = await supabase
    .from('parceiro_empresas')
    .select('parceiro_id, comissao_percentual, valor_base_override, parceiros ( nome ), empresas ( nome, subscription_price )')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .maybeSingle()
  if (vincErr) return { success: false, error: vincErr.message }
  if (!vinculo) {
    return { success: false, error: 'Este cliente não está vinculado a nenhum parceiro' }
  }

  const v = vinculo as any
  const base = Number(
    valorBase ?? v.valor_base_override ?? v.empresas?.subscription_price ?? 0,
  )
  if (!Number.isFinite(base) || base <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Valor do pagamento inválido' })
  }

  // Data vem como YYYY-MM-DD; fixa meio-dia BRT para não voltar um dia no fuso
  const pagoEmDate = pagoEm ? new Date(`${pagoEm}T12:00:00-03:00`) : new Date()
  if (Number.isNaN(pagoEmDate.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'Data de pagamento inválida' })
  }
  // Sempre retido por 30 dias — vale para mensal, anual e qualquer valor.
  // Libera à meia-noite (BRT) do 31º dia.
  const liberarEm = calcularLiberarEm(pagoEmDate)

  const pct = Number(v.comissao_percentual) || 0
  const valorComissao = Math.round(base * pct) / 100

  const { error } = await supabase.from('parceiro_comissao_pagamentos').insert({
    parceiro_id: v.parceiro_id,
    empresa_id: empresaId,
    origem: 'manual',
    valor_base: Math.round(base * 100) / 100,
    comissao_percentual: pct,
    valor_comissao: valorComissao,
    pago_em: pagoEmDate.toISOString(),
    liberar_em: liberarEm.toISOString(),
    status: 'retido',
    observacao: observacao?.trim() || null,
    criado_por: adminUserId,
  })
  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: {
      parceiroNome: v.parceiros?.nome ?? '',
      valorComissao,
      liberarEm: liberarEm.toISOString(),
    },
  }
})
