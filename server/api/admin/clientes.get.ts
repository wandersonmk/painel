import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const supabase = getServiceClient()

  try {
    const { data: empresas, error } = await supabase
      .from('empresas')
      .select('id, nome, nome_cliente, email, whatsapp, subscription_status, subscription_plan, subscription_period, trial_ends_at, subscription_renews_at, subscription_price, subscription_price_anual, ativo, created_at, auth_user_id, max_instancias, max_agentes, max_webhooks_entrada, max_webhooks_saida, max_profissionais, max_clientes, cancel_at_period_end, roteamento_habilitado, agendamentos_habilitado, pagina_agendamento_habilitada, api_assistente_habilitada, webhooks_habilitado, documentacao_habilitada, envios_habilitado, max_envios_mes, delivery_modulo_ativo, max_macros, max_acoes_macro, max_pedidos_mes, max_produtos_vitrine, vitrine_habilitada, imoveis_modulo_ativo, max_imoveis, indicado_por_empresa_id')
      .order('created_at', { ascending: false })
    if (error) throw error

    // Vínculos de parceiro (1 por empresa) para exibir na lista
    const { data: vinculos } = await supabase
      .from('parceiro_empresas')
      .select('empresa_id, parceiro_id, comissao_percentual, ativo, bloqueio_origem, bloqueado_em, cobranca_agzap, parceiros ( nome )')
    // Vínculo ativo ganha do histórico: sem isso, uma empresa que trocou de
    // parceiro podia aparecer com o parceiro antigo (e com o bloqueio dele).
    const vinculoPorEmpresa = new Map<string, any>()
    for (const v of (vinculos || []) as any[]) {
      const atual = vinculoPorEmpresa.get(v.empresa_id)
      if (!atual || (v.ativo && !atual.ativo)) vinculoPorEmpresa.set(v.empresa_id, v)
    }

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

    // Papel do dono (parceiro ou afiliado, um por vez) para o menu mostrar
    // "Tornar…" (troca automática) e "Remover…". Papel REMOVIDO (removido_em)
    // não conta; suspenso/bloqueado conta (dá para remover). Tabelas pequenas.
    const [{ data: parceirosVivos }, { data: afiliadosVivos }] = await Promise.all([
      supabase.from('parceiros').select('auth_user_id, ativo').is('removido_em', null).not('auth_user_id', 'is', null),
      supabase.from('afiliados').select('auth_user_id, ativo').is('removido_em', null),
    ])
    const situacaoParceiroPorDono = new Map<string, 'ativo' | 'suspenso'>(
      ((parceirosVivos || []) as any[]).map(p => [p.auth_user_id, p.ativo ? 'ativo' : 'suspenso']))
    const situacaoAfiliadoPorDono = new Map<string, 'ativo' | 'bloqueado'>(
      ((afiliadosVivos || []) as any[]).map(a => [a.auth_user_id, a.ativo ? 'ativo' : 'bloqueado']))

    // Afiliado que trouxe a empresa (1ª conexão: afiliado_empresas, 1 por
    // empresa). Duas leituras em lote nas tabelas pequenas, sem N+1. O nome
    // vem de afiliados mesmo quando a afiliação foi removida (removido_em): o
    // cliente antigo continua mostrando quem o trouxe, marcado como removido.
    const [{ data: viaAfiliado }, { data: afiliadosTodos }] = await Promise.all([
      supabase.from('afiliado_empresas').select('empresa_id, afiliado_id'),
      supabase.from('afiliados').select('id, nome, removido_em'),
    ])
    const afiliadoPorId = new Map<string, { nome: string; removido: boolean }>(
      ((afiliadosTodos || []) as any[]).map(a => [a.id, { nome: a.nome, removido: !!a.removido_em }]))
    const afiliadoIdPorEmpresa = new Map<string, string>(
      ((viaAfiliado || []) as any[]).map(v => [v.empresa_id, v.afiliado_id]))

    // Indicação cliente → cliente: quem indicou também é empresa desta lista,
    // então resolve o nome sem query extra.
    const empresaPorId = new Map<string, any>((empresas || []).map((e: any) => [e.id, e]))

    const clientesComRole = (empresas || []).map((emp) => {
      const userRole = emp.auth_user_id ? (rolePorAuthId.get(emp.auth_user_id) || 'user') : 'user'
      const vinculo = vinculoPorEmpresa.get(emp.id)
      const indicadora = emp.indicado_por_empresa_id ? empresaPorId.get(emp.indicado_por_empresa_id) : null
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
        subscription_price_anual: emp.subscription_price_anual == null
          ? null
          : Number(emp.subscription_price_anual),
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
        // Add-on pago desde 28/09/2026: ausente = bloqueado.
        roteamento_habilitado: emp.roteamento_habilitado ?? false,
        agendamentos_habilitado: emp.agendamentos_habilitado ?? true,
        pagina_agendamento_habilitada: emp.pagina_agendamento_habilitada ?? true,
        api_assistente_habilitada: emp.api_assistente_habilitada ?? true,
        webhooks_habilitado: emp.webhooks_habilitado ?? true,
        documentacao_habilitada: emp.documentacao_habilitada ?? true,
        // Envios é add-on pago: o default aqui é FALSE, ao contrário dos gates
        // acima. Ausente = bloqueado, nunca liberado por omissão.
        envios_habilitado: emp.envios_habilitado ?? false,
        max_envios_mes: emp.max_envios_mes ?? 0,
        // Delivery é add-on pago, mesmo padrão de envios: ausente = bloqueado.
        delivery_modulo_ativo: emp.delivery_modulo_ativo ?? false,
        max_macros: emp.max_macros ?? 5,
        max_acoes_macro: emp.max_acoes_macro ?? 5,
        max_pedidos_mes: emp.max_pedidos_mes ?? 0,
        max_produtos_vitrine: emp.max_produtos_vitrine ?? 0,
        // Gate comum (nasce true): ausente = liberado.
        vitrine_habilitada: emp.vitrine_habilitada ?? true,
        // Imóveis é add-on pago (01/10/2026), mesmo padrão de Delivery:
        // ausente = bloqueado. Limite padrão 100, 0 = sem limite.
        imoveis_modulo_ativo: emp.imoveis_modulo_ativo ?? false,
        max_imoveis: emp.max_imoveis ?? 100,
        parceiro_nome: vinculo?.parceiros?.nome ?? null,
        // Id do parceiro: o filtro da tela usa o id (nomes podem se repetir).
        parceiro_id: vinculo?.parceiro_id ?? null,
        // Afiliado que trouxe a empresa (1ª conexão). null = não veio por afiliado.
        afiliado_id: afiliadoIdPorEmpresa.get(emp.id) ?? null,
        afiliado_nome: afiliadoPorId.get(afiliadoIdPorEmpresa.get(emp.id) ?? '')?.nome ?? null,
        afiliado_removido: afiliadoPorId.get(afiliadoIdPorEmpresa.get(emp.id) ?? '')?.removido ?? false,
        parceiro_comissao: vinculo ? Number(vinculo.comissao_percentual) : null,
        // Cliente de parceiro que segue pagando a Agzap direto (não consome
        // crédito do parceiro). Usado no resumo da tela para separar quem paga
        // a Agzap de quem paga o parceiro.
        parceiro_cobranca_agzap: vinculo ? vinculo.cobranca_agzap === true : false,
        // Quem derrubou o acesso: 'parceiro' (bloqueio comercial dele) ou 'admin'
        // (desativação pela Agzap). Só vale para vínculo ativo — bloqueio de
        // vínculo antigo é histórico, não situação atual do cliente.
        parceiro_bloqueio_origem: vinculo?.ativo ? (vinculo.bloqueio_origem ?? null) : null,
        parceiro_bloqueado_em: vinculo?.ativo ? (vinculo.bloqueado_em ?? null) : null,
        indicado_por_empresa_id: emp.indicado_por_empresa_id ?? null,
        indicado_por_nome: indicadora?.nome ?? null,
        indicado_por_responsavel: indicadora?.nome_cliente?.trim() || null,
        dono_parceiro: !!emp.auth_user_id && situacaoParceiroPorDono.get(emp.auth_user_id) === 'ativo',
        dono_afiliado: !!emp.auth_user_id && situacaoAfiliadoPorDono.get(emp.auth_user_id) === 'ativo',
        // null = sem o papel (ou papel removido).
        dono_parceiro_situacao: (emp.auth_user_id && situacaoParceiroPorDono.get(emp.auth_user_id)) || null,
        dono_afiliado_situacao: (emp.auth_user_id && situacaoAfiliadoPorDono.get(emp.auth_user_id)) || null,
      }
    })

    return { success: true, data: clientesComRole }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao listar clientes' }
  }
})
