import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { clienteId } = await readBody<{ clienteId: string }>(event)
  if (!clienteId) throw createError({ statusCode: 400, statusMessage: 'clienteId obrigatório' })

  const supabase = getServiceClient()

  const { data: emp } = await supabase
    .from('empresas')
    .select('auth_user_id, nome')
    .eq('id', clienteId)
    .single()

  if (emp?.auth_user_id) {
    const { data: u } = await supabase
      .from('usuarios')
      .select('role')
      .eq('auth_user_id', emp.auth_user_id)
      .single()
    if (u?.role === 'superAdmin') {
      throw createError({ statusCode: 403, statusMessage: '❌ Não é possível excluir um superAdmin!' })
    }
  }

  // 1) mensagens (filhas de conversas) → coleta IDs das conversas primeiro
  const { data: convs } = await supabase
    .from('conversas')
    .select('id')
    .eq('empresa_id', clienteId)
  const convIds = (convs || []).map(c => c.id)
  if (convIds.length > 0) {
    await supabase.from('mensagens').delete().in('conversa_id', convIds)
    await supabase.from('midias_conversas').delete().in('conversa_id', convIds)
  }

  // 2) conversas
  await supabase.from('conversas').delete().eq('empresa_id', clienteId)

  // 3) CRM
  const { data: leads } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('empresa_id', clienteId)
  const leadIds = (leads || []).map(l => l.id)
  if (leadIds.length > 0) {
    await supabase.from('crm_lead_tags').delete().in('lead_id', leadIds)
    await supabase.from('crm_lead_observacoes').delete().in('lead_id', leadIds)
    await supabase.from('crm_lead_tasks').delete().in('lead_id', leadIds)
  }
  await supabase.from('crm_leads').delete().eq('empresa_id', clienteId)
  await supabase.from('crm_columns').delete().eq('empresa_id', clienteId)
  await supabase.from('crm_tags').delete().eq('empresa_id', clienteId)

  // 4) Resto em cascata
  const cascadeTables = [
    'clientes',
    'produtos',
    'categorias',
    'agendamentos',
    'servicos_profissionais',
    'servicos',
    'profissionais',
    'instancias_uazapi',
    'usuarios_empresas',
  ] as const

  for (const t of cascadeTables) {
    await supabase.from(t).delete().eq('empresa_id', clienteId)
  }

  // 5) Usuário (linha em `usuarios` + auth.users)
  if (emp?.auth_user_id) {
    await supabase.from('usuarios').delete().eq('auth_user_id', emp.auth_user_id)
    try {
      await supabase.auth.admin.deleteUser(emp.auth_user_id)
    } catch (err) {
      console.error('[excluir] auth.admin.deleteUser falhou:', err)
    }
  }

  // 6) empresa
  const { error } = await supabase.from('empresas').delete().eq('id', clienteId)
  if (error) return { success: false, error: error.message }
  return { success: true }
})
