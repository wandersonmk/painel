import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  const adminUserId = await requireSuperAdmin(event)
  const { clienteId } = await readBody<{ clienteId: string }>(event)
  if (!clienteId) throw createError({ statusCode: 400, statusMessage: 'clienteId obrigatório' })

  const supabase = getServiceClient()

  const { data: emp } = await supabase
    .from('empresas')
    .select('auth_user_id')
    .eq('id', clienteId)
    .single()

  if (emp?.auth_user_id) {
    const { data: u } = await supabase
      .from('usuarios')
      .select('role')
      .eq('auth_user_id', emp.auth_user_id)
      .single()
    if (u?.role === 'superAdmin') {
      throw createError({ statusCode: 403, statusMessage: 'Não é possível desativar um superAdmin.' })
    }
  }

  const agora = new Date().toISOString()
  const { error } = await supabase
    .from('empresas')
    .update({
      ativo: false,
      subscription_status: 'canceled',
      updated_at: agora,
    })
    .eq('id', clienteId)

  if (error) return { success: false, error: error.message }

  // Bloqueio administrativo prevalece sobre o comercial: marcado no vínculo
  // para o parceiro não conseguir desbloquear pelo painel dele.
  await supabase
    .from('parceiro_empresas')
    .update({ bloqueio_origem: 'admin', bloqueado_em: agora, bloqueado_por: adminUserId, updated_at: agora })
    .eq('empresa_id', clienteId)
    .eq('ativo', true)

  return { success: true }
})
