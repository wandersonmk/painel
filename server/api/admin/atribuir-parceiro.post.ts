import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  const adminUserId = await requireSuperAdmin(event)
  const { empresaId, parceiroId, comissaoPercentual, valorBaseOverride } = await readBody<{
    empresaId: string
    parceiroId: string
    comissaoPercentual: number
    valorBaseOverride?: number | null
  }>(event)

  if (!empresaId || !parceiroId) {
    throw createError({ statusCode: 400, statusMessage: 'empresaId e parceiroId obrigatórios' })
  }
  if (!Number.isFinite(comissaoPercentual) || comissaoPercentual < 0 || comissaoPercentual > 100) {
    throw createError({ statusCode: 400, statusMessage: 'Comissão inválida (0–100%)' })
  }
  const override = valorBaseOverride ?? null
  if (override !== null && (!Number.isFinite(override) || override < 0)) {
    throw createError({ statusCode: 400, statusMessage: 'Valor base inválido' })
  }

  const supabase = getServiceClient()

  const { data: parceiro, error: parceiroErr } = await supabase
    .from('parceiros')
    .select('id, ativo')
    .eq('id', parceiroId)
    .maybeSingle()
  if (parceiroErr) return { success: false, error: parceiroErr.message }
  if (!parceiro) throw createError({ statusCode: 404, statusMessage: 'Parceiro não encontrado' })

  // 1 empresa só tem 1 parceiro (unique em empresa_id): atualiza o vínculo existente ou cria um novo
  const { data: existente, error: existErr } = await supabase
    .from('parceiro_empresas')
    .select('id')
    .eq('empresa_id', empresaId)
    .maybeSingle()
  if (existErr) return { success: false, error: existErr.message }

  if (existente) {
    const { error } = await supabase
      .from('parceiro_empresas')
      .update({
        parceiro_id: parceiroId,
        comissao_percentual: comissaoPercentual,
        valor_base_override: override,
        ativo: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existente.id)
    if (error) return { success: false, error: error.message }
  } else {
    const { error } = await supabase
      .from('parceiro_empresas')
      .insert({
        empresa_id: empresaId,
        parceiro_id: parceiroId,
        comissao_percentual: comissaoPercentual,
        valor_base_override: override,
        ativo: true,
        atribuido_por: adminUserId,
      })
    if (error) return { success: false, error: error.message }
  }

  return { success: true }
})
