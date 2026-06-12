import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const supabase = getServiceClient()

  try {
    const { data: empresas, error } = await supabase
      .from('empresas')
      .select('id, nome, email, whatsapp, subscription_status, subscription_plan, subscription_period, trial_ends_at, subscription_renews_at, subscription_price, ativo, created_at, auth_user_id, max_instancias, max_agentes, max_webhooks_entrada, cancel_at_period_end, roteamento_habilitado, transporte_habilitado')
      .order('created_at', { ascending: false })
    if (error) throw error

    // Vínculos de parceiro (1 por empresa) para exibir na lista
    const { data: vinculos } = await supabase
      .from('parceiro_empresas')
      .select('empresa_id, comissao_percentual, ativo, parceiros ( nome )')
    const vinculoPorEmpresa = new Map(
      (vinculos || []).map((v: any) => [v.empresa_id, v]),
    )

    const clientesComRole = await Promise.all((empresas || []).map(async (emp) => {
      let userRole = 'user'
      if (emp.auth_user_id) {
        const { data: u } = await supabase.from('usuarios').select('role').eq('auth_user_id', emp.auth_user_id).single()
        if (u) userRole = u.role
      }
      const vinculo = vinculoPorEmpresa.get(emp.id)
      return {
        id: emp.id,
        nome: emp.nome,
        email: emp.email || '',
        whatsapp: emp.whatsapp,
        subscription_status: emp.subscription_status || 'trial',
        subscription_plan: emp.subscription_plan || 'free',
        subscription_period: emp.subscription_period || 'trial',
        trial_ends_at: emp.trial_ends_at,
        subscription_renews_at: emp.subscription_renews_at,
        subscription_price: emp.subscription_price,
        ativo: emp.ativo,
        created_at: emp.created_at,
        role: userRole,
        max_instancias: emp.max_instancias ?? 1,
        max_agentes: emp.max_agentes ?? 1,
        max_webhooks_entrada: emp.max_webhooks_entrada ?? 5,
        cancel_at_period_end: emp.cancel_at_period_end || false,
        roteamento_habilitado: emp.roteamento_habilitado ?? true,
        transporte_habilitado: emp.transporte_habilitado ?? true,
        parceiro_nome: vinculo?.parceiros?.nome ?? null,
        parceiro_comissao: vinculo ? Number(vinculo.comissao_percentual) : null,
      }
    }))

    return { success: true, data: clientesComRole }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao listar clientes' }
  }
})
