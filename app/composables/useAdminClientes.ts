import { ref, computed } from 'vue'

export interface AdminCliente {
  id: string
  nome: string
  email: string
  whatsapp: string | null
  subscription_status: 'trial' | 'active' | 'canceled' | 'expired'
  subscription_plan: 'free' | 'basic' | 'pro' | 'enterprise'
  subscription_period: 'trial' | 'trial1d' | 'trial2d' | 'trial3d' | 'trial5d' | '1month' | '6months' | '12months'
  trial_ends_at: string | null
  subscription_renews_at: string | null
  subscription_price: number | null
  ativo: boolean
  created_at: string
  role?: 'user' | 'admin' | 'manager' | 'superAdmin'
  max_instancias?: number
  max_agentes?: number
  max_webhooks_entrada?: number
  cancel_at_period_end?: boolean
  parceiro_nome?: string | null
  parceiro_comissao?: number | null
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

    const hoje = new Date()
    const hojeBR = new Date(hoje.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
    hojeBR.setHours(0, 0, 0, 0)
    const vencBR = new Date(dataVenc.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
    vencBR.setHours(0, 0, 0, 0)
    return Math.round((vencBR.getTime() - hojeBR.getTime()) / (1000 * 60 * 60 * 24))
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

  const renovarAssinatura = async (
    id: string,
    plan: 'free' | 'basic' | 'pro' | 'enterprise',
    period: AdminCliente['subscription_period']
  ) => {
    const resp = await $fetch<{ success: boolean }>('/api/admin/renovar-assinatura', { method: 'POST', body: { clienteId: id, plan, period }, headers: await getAuthHeaders() })
    if (!resp.success) throw new Error('Erro ao renovar assinatura')

    const days: Record<string, number> = { trial1d: 1, trial2d: 2, trial3d: 3, trial5d: 5, trial: 7, '1month': 30, '6months': 180, '12months': 365 }
    const renewDate = new Date()
    renewDate.setDate(renewDate.getDate() + (days[period] ?? 30))

    const c = clientes.value.find(x => x.id === id)
    if (c) {
      c.subscription_plan = plan
      c.subscription_period = period
      c.subscription_status = 'active'
      c.ativo = true
      if (period.startsWith('trial')) {
        c.trial_ends_at = renewDate.toISOString()
        c.subscription_renews_at = null
      } else {
        c.subscription_renews_at = renewDate.toISOString()
        c.trial_ends_at = null
      }
    }
  }

  const excluirCliente = async (id: string) => {
    const resp = await $fetch<{ success: boolean }>('/api/admin/excluir', { method: 'POST', body: { clienteId: id }, headers: await getAuthHeaders() })
    if (!resp.success) throw new Error('Erro ao excluir')
    const idx = clientes.value.findIndex(x => x.id === id)
    if (idx !== -1) clientes.value.splice(idx, 1)
  }

  const editarCliente = async (id: string, dados: { nome: string; email: string; whatsapp: string | null; subscription_price: number | null }) => {
    const resp = await $fetch<{ success: boolean }>('/api/admin/editar', { method: 'POST', body: { clienteId: id, ...dados }, headers: await getAuthHeaders() })
    if (!resp.success) throw new Error('Erro ao editar')
    const c = clientes.value.find(x => x.id === id)
    if (c) Object.assign(c, dados)
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
  }
}
