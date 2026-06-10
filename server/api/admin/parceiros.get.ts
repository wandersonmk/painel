import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { empresaId } = getQuery(event) as { empresaId?: string }

  const supabase = getServiceClient()

  const { data: parceiros, error } = await supabase
    .from('parceiros')
    .select('id, nome, email, ativo')
    .order('nome')
  if (error) return { success: false, error: error.message }

  // Vínculo atual da empresa (se solicitado)
  let vinculo = null
  if (empresaId) {
    const { data, error: vincErr } = await supabase
      .from('parceiro_empresas')
      .select('id, parceiro_id, comissao_percentual, valor_base_override, ativo')
      .eq('empresa_id', empresaId)
      .maybeSingle()
    if (vincErr) return { success: false, error: vincErr.message }
    vinculo = data
  }

  return { success: true, data: { parceiros: parceiros || [], vinculo } }
})
