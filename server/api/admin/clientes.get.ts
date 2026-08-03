import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const supabase = getServiceClient()

  try {
    const { data: empresas, error } = await supabase
      .from('empresas')
      .select('id, nome, nome_cliente, email, whatsapp, subscription_status, subscription_plan, subscription_period, trial_ends_at, subscription_renews_at, subscription_price, ativo, created_at, auth_user_id, max_instancias, max_agentes, max_webhooks_entrada, max_webhooks_saida, max_profissionais, max_clientes, cancel_at_period_end, roteamento_habilitado, agendamentos_habilitado, pagina_agendamento_habilitada, api_assistente_habilitada, webhooks_habilitado, documentacao_habilitada, envios_habilitado, max_envios_mes')
      .order('created_at', { ascending: false })
    if (error) throw error

    // Vínculos de parceiro (1 por empresa) para exibir na lista
    const { data: vinculos } = await supabase
      .from('parceiro_empresas')
      .select('empresa_id, comissao_percentual, ativo, parceiros ( nome )')
    const vinculoPorEmpresa = new Map(
      (vinculos || []).map((v: any) => [v.empresa_id, v]),
    )

    // Papéis em uma única query (evita N+1 e o default silencioso de '.single()',
    // que escondia papel ausente/duplicado e podia exibir ações destrutivas indevidas).
    const authIds = (empresas || []).map(e => e.auth_user_id).filter(Boolean) as string[]
    const rolePorAuthId = new Map<string, string>()
    if (authIds.length) {
      const { data: usuarios } = await supabase
        .from('usuarios')
        .select('auth_user_id, role')
        .in('auth_user_id', authIds)
      for (const u of (usuarios || []) as any[]) rolePorAuthId.set(u.auth_user_id, u.role)
    }

    const clientesComRole = (empresas || []).map((emp) => {
      const userRole = emp.auth_user_id ? (rolePorAuthId.get(emp.auth_user_id) || 'user') : 'user'
      const vinculo = vinculoPorEmpresa.get(emp.id)
      return {
        id: emp.id,
        nome: emp.nome,
        nome_cliente: emp.nome_cliente?.trim() || null,
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
        max_webhooks_saida: emp.max_webhooks_saida ?? 5,
        max_profissionais: emp.max_profissionais ?? 20,
        max_clientes: emp.max_clientes ?? 100000,
        cancel_at_period_end: emp.cancel_at_period_end || false,
        roteamento_habilitado: emp.roteamento_habilitado ?? true,
        agendamentos_habilitado: emp.agendamentos_habilitado ?? true,
        pagina_agendamento_habilitada: emp.pagina_agendamento_habilitada ?? true,
        api_assistente_habilitada: emp.api_assistente_habilitada ?? true,
        webhooks_habilitado: emp.webhooks_habilitado ?? true,
        documentacao_habilitada: emp.documentacao_habilitada ?? true,
        // Envios é add-on pago: o default aqui é FALSE, ao contrário dos gates
        // acima. Ausente = bloqueado, nunca liberado por omissão.
        envios_habilitado: emp.envios_habilitado ?? false,
        max_envios_mes: emp.max_envios_mes ?? 0,
        parceiro_nome: vinculo?.parceiros?.nome ?? null,
        parceiro_comissao: vinculo ? Number(vinculo.comissao_percentual) : null,
      }
    })

    return { success: true, data: clientesComRole }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao listar clientes' }
  }
})
