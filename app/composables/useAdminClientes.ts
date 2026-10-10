import { ref, computed } from 'vue'

// Dia-calendário no fuso de São Paulo, sem round-trip por Date local (que dava
// resultado errado em servidores/navegadores fora de BRT, ex.: Vercel em UTC).
const fmtDiaSP = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
})
const diaSP = (d: Date): number => {
  const partes = fmtDiaSP.format(d).split('-')
  const y = Number(partes[0])
  const m = Number(partes[1])
  const dd = Number(partes[2])
  return Date.UTC(y, m - 1, dd)
}

export interface AdminCliente {
  id: string
  nome: string
  nome_cliente?: string | null
  email: string
  whatsapp: string | null
  subscription_status: 'trial' | 'active' | 'canceled' | 'expired'
  subscription_plan: 'free' | 'basic' | 'pro' | 'enterprise'
  subscription_period: 'trial' | 'trial1d' | 'trial2d' | 'trial3d' | 'trial5d' | '1month' | '6months' | '12months'
  trial_ends_at: string | null
  subscription_renews_at: string | null
  subscription_price: number | null
  /** Valor fechado do plano de 12 meses. */
  subscription_price_anual?: number | null
  ativo: boolean
  created_at: string
  role?: 'user' | 'admin' | 'manager' | 'superAdmin'
  max_instancias?: number
  max_agentes?: number
  max_webhooks_entrada?: number
  max_webhooks_saida?: number
  max_profissionais?: number
  max_clientes?: number
  cancel_at_period_end?: boolean
  parceiro_nome?: string | null
  parceiro_comissao?: number | null
  // Cliente de parceiro marcado como "cobrado pela Agzap" (parceiro_empresas.cobranca_agzap):
  // paga a Agzap direto, não o parceiro.
  parceiro_cobranca_agzap?: boolean
  // Id do parceiro do vínculo (o filtro por parceiro usa o id; nomes podem se repetir).
  parceiro_id?: string | null
  // Afiliado que trouxe a empresa (1ª conexão, afiliado_empresas). null = não veio por afiliado.
  afiliado_id?: string | null
  afiliado_nome?: string | null
  // true = a afiliação dele foi removida (o vínculo com o cliente antigo continua).
  afiliado_removido?: boolean
  // Origem do bloqueio no vínculo (parceiro_empresas.bloqueio_origem):
  // 'parceiro' = bloqueio comercial do parceiro, 'admin' = desativação pela Agzap.
  parceiro_bloqueio_origem?: 'parceiro' | 'admin' | null
  parceiro_bloqueado_em?: string | null
  // Indicação cliente → cliente (empresas.indicado_por_empresa_id): quem
  // indicou ganha 10%/5% da própria mensalidade a cada mês pago por este.
  indicado_por_empresa_id?: string | null
  indicado_por_nome?: string | null
  indicado_por_responsavel?: string | null
  // Papel ativo do dono da conta: parceiro OU afiliado, nunca os dois (09/10/2026).
  dono_parceiro?: boolean
  dono_afiliado?: boolean
  // Papel ainda existente (não removido): ativo ou suspenso/bloqueado. null = sem papel.
  dono_parceiro_situacao?: 'ativo' | 'suspenso' | null
  dono_afiliado_situacao?: 'ativo' | 'bloqueado' | null
  // Gates de módulo do app (Painel Admin). Ausente = true (permissivo).
  // CRM Kanban não tem gate: fica sempre liberado.
  roteamento_habilitado?: boolean
  agendamentos_habilitado?: boolean
  pagina_agendamento_habilitada?: boolean
  api_assistente_habilitada?: boolean
  webhooks_habilitado?: boolean
  documentacao_habilitada?: boolean
  // Envios é add-on pago: ausente = false (bloqueado), nunca liberado por omissão.
  envios_habilitado?: boolean
  max_envios_mes?: number
  // Delivery é add-on pago, mesmo padrão de envios: ausente = false (bloqueado).
  delivery_modulo_ativo?: boolean
  max_macros?: number
  max_acoes_macro?: number
  max_pedidos_mes?: number
  max_produtos_vitrine?: number
  // Gate da Vitrine ("Produtos" no app). Ausente = true (permissivo).
  vitrine_habilitada?: boolean
  // Imóveis é add-on pago (01/10/2026): ausente = false (bloqueado).
  imoveis_modulo_ativo?: boolean
  // Limite de imóveis cadastrados. Padrão 100, 0 = sem limite.
  max_imoveis?: number
}

export interface AdminStats {
  totalClientes: number
  clientesTrial: number
  clientesPro: number
  clientesBasic: number
  clientesEnterprise: number
  clientesVencidos: number
  clientesAtivos: number
  clientesEssaSemana: number
  clientesVencendoHoje: number
}

export const useAdminClientes = () => {
  const clientes = ref<AdminCliente[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const getAuthHeaders = async () => useAdminAuthHeaders()

  const diasParaVencimento = (c: AdminCliente): number => {
    let dataVenc: Date | null = null
    if (c.subscription_status === 'active' && c.subscription_renews_at) dataVenc = new Date(c.subscription_renews_at)
    else if (c.subscription_status === 'trial' && c.trial_ends_at) dataVenc = new Date(c.trial_ends_at)
    else if (c.trial_ends_at) dataVenc = new Date(c.trial_ends_at)
    else if (c.subscription_renews_at) dataVenc = new Date(c.subscription_renews_at)
    if (!dataVenc) return Number.POSITIVE_INFINITY

    return Math.round((diaSP(dataVenc) - diaSP(new Date())) / 86_400_000)
  }

  const stats = computed<AdminStats>(() => {
    const total = clientes.value.length
    const trial = clientes.value.filter(c => c.subscription_status === 'trial').length
    const pro = clientes.value.filter(c => c.subscription_plan === 'pro').length
    const basic = clientes.value.filter(c => c.subscription_plan === 'basic').length
    const enterprise = clientes.value.filter(c => c.subscription_plan === 'enterprise').length
    const ativos = clientes.value.filter(c => c.ativo).length
    const vencidos = clientes.value.filter(c => c.subscription_status === 'expired' || diasParaVencimento(c) < 0).length

    const umaSemanaAtras = new Date()
    umaSemanaAtras.setDate(umaSemanaAtras.getDate() - 7)
    const essaSemana = clientes.value.filter(c => new Date(c.created_at) >= umaSemanaAtras).length
    const vencendoHoje = clientes.value.filter(c => diasParaVencimento(c) === 0).length

    return {
      totalClientes: total,
      clientesTrial: trial,
      clientesPro: pro,
      clientesBasic: basic,
      clientesEnterprise: enterprise,
      clientesVencidos: vencidos,
      clientesAtivos: ativos,
      clientesEssaSemana: essaSemana,
      clientesVencendoHoje: vencendoHoje,
    }
  })

  const loadClientes = async () => {
    loading.value = true
    error.value = null
    try {
      const headers = await getAuthHeaders()
      const resp = await $fetch<{ success: boolean; data?: AdminCliente[]; error?: string }>('/api/admin/clientes', { headers })
      if (!resp.success || !resp.data) throw new Error(resp.error || 'Erro ao carregar clientes')
      clientes.value = resp.data
    } catch (err: any) {
      error.value = err.message || 'Erro ao carregar clientes'
    } finally {
      loading.value = false
    }
  }

  const desativarCliente = async (id: string) => {
    const resp = await $fetch<{ success: boolean }>('/api/admin/desativar', { method: 'POST', body: { clienteId: id }, headers: await getAuthHeaders() })
    if (!resp.success) throw new Error('Erro ao desativar')
    const c = clientes.value.find(x => x.id === id)
    if (c) { c.ativo = false; c.subscription_status = 'canceled' }
  }

  const reativarCliente = async (id: string) => {
    const resp = await $fetch<{ success: boolean; subscription_status?: AdminCliente['subscription_status'] }>('/api/admin/reativar', { method: 'POST', body: { clienteId: id }, headers: await getAuthHeaders() })
    if (!resp.success) throw new Error('Erro ao reativar')
    const c = clientes.value.find(x => x.id === id)
    if (c) { c.ativo = true; if (resp.subscription_status) c.subscription_status = resp.subscription_status }
  }

  // ancora: de onde o novo período conta — 'vencimento' (mantém o dia do
  // vencimento atual) ou 'hoje'. Ausente = regra antiga do servidor (hoje + dias).
  const renovarAssinatura = async (
    id: string,
    plan: 'free' | 'basic' | 'pro' | 'enterprise',
    period: AdminCliente['subscription_period'],
    ancora?: 'vencimento' | 'hoje',
  ) => {
    const resp = await $fetch<{ success: boolean; error?: string; subscription_renews_at?: string | null; trial_ends_at?: string | null }>('/api/admin/renovar-assinatura', {
      method: 'POST',
      body: { clienteId: id, plan, period, ...(ancora ? { ancora } : {}) },
      headers: await getAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro ao renovar assinatura')

    const c = clientes.value.find(x => x.id === id)
    if (c) {
      c.subscription_plan = plan
      c.subscription_period = period
      c.subscription_status = 'active'
      c.ativo = true
      if (resp.subscription_renews_at !== undefined || resp.trial_ends_at !== undefined) {
        // Datas que o servidor gravou: a tabela já mostra o vencimento certo.
        c.subscription_renews_at = resp.subscription_renews_at ?? null
        c.trial_ends_at = resp.trial_ends_at ?? null
      } else {
        // Resposta sem as datas (servidor antigo): estimativa local.
        const days: Record<string, number> = { trial1d: 1, trial2d: 2, trial3d: 3, trial5d: 5, trial: 7, '1month': 30, '6months': 180, '12months': 365 }
        const renewDate = new Date()
        renewDate.setDate(renewDate.getDate() + (days[period] ?? 30))
        c.trial_ends_at = period.startsWith('trial') ? renewDate.toISOString() : null
        c.subscription_renews_at = period.startsWith('trial') ? null : renewDate.toISOString()
      }
    }
  }

  const excluirCliente = async (id: string) => {
    const resp = await $fetch<{ success: boolean }>('/api/admin/excluir', { method: 'POST', body: { clienteId: id }, headers: await getAuthHeaders() })
    if (!resp.success) throw new Error('Erro ao excluir')
    const idx = clientes.value.findIndex(x => x.id === id)
    if (idx !== -1) clientes.value.splice(idx, 1)
  }

  const editarCliente = async (
    id: string,
    dados: {
      nome: string
      email: string
      whatsapp: string | null
      subscription_price: number | null
      // Só vai no corpo para cliente com parceiro; ausente preserva o valor.
      preco_anual?: number | null
    },
  ) => {
    const resp = await $fetch<{ success: boolean }>('/api/admin/editar', { method: 'POST', body: { clienteId: id, ...dados }, headers: await getAuthHeaders() })
    if (!resp.success) throw new Error('Erro ao editar')
    const c = clientes.value.find(x => x.id === id)
    if (c) {
      const { preco_anual, ...demaisDados } = dados
      Object.assign(c, demaisDados)
      if (preco_anual !== undefined) c.subscription_price_anual = preco_anual
    }
  }

  const isVencido = (c: AdminCliente) => c.subscription_status === 'expired' || diasParaVencimento(c) < 0
  const formatDiasVencimento = (c: AdminCliente) => {
    const d = diasParaVencimento(c)
    if (!Number.isFinite(d)) return '—'
    if (d < 0) return 'Faça renovação'
    if (d === 0) return 'Vence hoje'
    if (d === 1) return 'Vence amanhã'
    return `${d} dias`
  }
  const formatDate = (s: string | null) => s ? new Date(s).toLocaleDateString('pt-BR') : '-'
  const getPlanLabel = (p: string) => ({ free: 'Gratuito', basic: 'Básico', pro: 'Pro', enterprise: 'Enterprise' }[p] || p)
  const getDataVencimento = (c: AdminCliente) =>
    (c.subscription_status === 'active' && c.subscription_renews_at) ? c.subscription_renews_at :
    (c.subscription_status === 'trial' && c.trial_ends_at) ? c.trial_ends_at :
    c.trial_ends_at || c.subscription_renews_at || null

  // Valor cadastrado da assinatura, na mesma regra do bloco "Cobrança" do
  // modal de uso: plano de 12 meses usa o valor anual; os demais, a
  // mensalidade (subscription_price). É o valor CADASTRADO, não o que entrou
  // no caixa. null = sem valor cadastrado.
  const valorAssinatura = (c: AdminCliente): { valor: number; anual: boolean } | null => {
    const positivo = (v: unknown) => (v != null && Number(v) > 0 ? Number(v) : null)
    const anual = c.subscription_period === '12months'
    const valor = anual ? positivo(c.subscription_price_anual) : positivo(c.subscription_price)
    return valor == null ? null : { valor, anual }
  }
  // Equivalente mensal do valor cadastrado (anual ÷ 12).
  const valorMensalEquivalente = (c: AdminCliente): number => {
    const v = valorAssinatura(c)
    if (!v) return 0
    return v.anual ? v.valor / 12 : v.valor
  }
  // Cliente de parceiro paga o PARCEIRO (o parceiro compra crédito da Agzap),
  // exceto quando o vínculo está marcado como "cobrado pela Agzap".
  const pagaParceiro = (c: AdminCliente) => !!c.parceiro_nome && !c.parceiro_cobranca_agzap
  const formatBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return {
    clientes,
    stats,
    loading,
    error,
    loadClientes,
    desativarCliente,
    reativarCliente,
    renovarAssinatura,
    excluirCliente,
    editarCliente,
    isVencido,
    diasParaVencimento,
    formatDiasVencimento,
    formatDate,
    getPlanLabel,
    getDataVencimento,
    valorAssinatura,
    valorMensalEquivalente,
    pagaParceiro,
    formatBRL,
  }
}
