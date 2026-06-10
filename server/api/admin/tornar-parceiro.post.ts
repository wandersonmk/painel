import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { empresaId } = await readBody<{ empresaId: string }>(event)

  if (!empresaId) {
    throw createError({ statusCode: 400, statusMessage: 'empresaId obrigatório' })
  }

  const supabase = getServiceClient()

  const { data: empresa, error: empErr } = await supabase
    .from('empresas')
    .select('id, nome, nome_cliente, email, whatsapp, auth_user_id')
    .eq('id', empresaId)
    .maybeSingle()
  if (empErr) return { success: false, error: empErr.message }
  if (!empresa) throw createError({ statusCode: 404, statusMessage: 'Empresa não encontrada' })
  if (!empresa.auth_user_id) {
    return { success: false, error: 'Esta empresa não tem usuário de login vinculado' }
  }

  // Já é parceiro? Reativa se estiver bloqueado; senão só informa.
  const { data: existente } = await supabase
    .from('parceiros')
    .select('id, nome, ativo')
    .eq('auth_user_id', empresa.auth_user_id)
    .maybeSingle()

  if (existente) {
    if (!existente.ativo) {
      const { error } = await supabase
        .from('parceiros')
        .update({ ativo: true, updated_at: new Date().toISOString() })
        .eq('id', existente.id)
      if (error) return { success: false, error: error.message }
      return { success: true, data: { jaEra: true, reativado: true, nome: existente.nome } }
    }
    return { success: true, data: { jaEra: true, reativado: false, nome: existente.nome } }
  }

  const nomeParceiro = empresa.nome_cliente?.trim() || empresa.nome
  const { error } = await supabase.from('parceiros').insert({
    nome: nomeParceiro,
    email: empresa.email?.trim().toLowerCase() || null,
    telefone: empresa.whatsapp || null,
    auth_user_id: empresa.auth_user_id,
    ativo: true,
    observacoes: `Convertido da empresa cliente "${empresa.nome}"`,
  })
  if (error) return { success: false, error: error.message }

  return { success: true, data: { jaEra: false, reativado: false, nome: nomeParceiro } }
})
