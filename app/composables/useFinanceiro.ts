import { ref, computed } from 'vue'

export interface FinanceiroLancamento {
  id: string
  tipo: 'entrada' | 'saida'
  descricao: string
  categoria: string | null
  valor: number
  data_vencimento: string | null
  data_pagamento: string | null
  observacao: string | null
  created_at: string
  updated_at: string
}

export type FinanceiroStatus = 'pago' | 'em_dia' | 'proximo' | 'vence_hoje' | 'vencido'

export interface FinanceiroFormPayload {
  id?: string
  tipo: 'entrada' | 'saida'
  descricao: string
  categoria?: string | null
  valor: number
  data_vencimento?: string | null
  data_pagamento?: string | null
  observacao?: string | null
}

const PROXIMO_DIAS = 7

function toDateBR(s: string | null): Date | null {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function diasAteVencimento(venc: string | null): number | null {
  const v = toDateBR(venc)
  if (!v) return null
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  v.setHours(0, 0, 0, 0)
  return Math.round((v.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
}

export function statusDoLancamento(l: FinanceiroLancamento): FinanceiroStatus {
  if (l.data_pagamento) return 'pago'
  if (l.tipo === 'entrada') return 'em_dia'
  const d = diasAteVencimento(l.data_vencimento)
  if (d === null) return 'em_dia'
  if (d < 0) return 'vencido'
  if (d === 0) return 'vence_hoje'
  if (d <= PROXIMO_DIAS) return 'proximo'
  return 'em_dia'
}

export function statusLabel(s: FinanceiroStatus, tipo?: 'entrada' | 'saida'): string {
  if (tipo === 'entrada') {
    return s === 'pago' ? 'Recebido' : 'A receber'
  }
  return {
    pago: 'Pago',
    em_dia: 'Em dia',
    proximo: 'Vence em breve',
    vence_hoje: 'Vence hoje',
    vencido: 'Vencido',
  }[s]
}

export function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatDateBR(s: string | null): string {
  const d = toDateBR(s)
  if (!d) return '—'
  return d.toLocaleDateString('pt-BR')
}

export function useFinanceiro() {
  const lancamentos = ref<FinanceiroLancamento[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const headers = async () => useAdminAuthHeaders()

  async function carregar() {
    loading.value = true
    error.value = null
    try {
      const resp = await $fetch<{ success: boolean; data?: FinanceiroLancamento[]; error?: string }>('/api/admin/financeiro/list', { headers: await headers() })
      if (!resp.success) throw new Error(resp.error || 'Erro')
      lancamentos.value = (resp.data || []).map(l => ({ ...l, valor: Number(l.valor) }))
    } catch (err: any) {
      error.value = err?.message || 'Erro ao carregar lançamentos'
    } finally {
      loading.value = false
    }
  }

  async function salvar(payload: FinanceiroFormPayload) {
    const resp = await $fetch<{ success: boolean; data?: FinanceiroLancamento; error?: string }>('/api/admin/financeiro/salvar', {
      method: 'POST',
      body: payload,
      headers: await headers(),
    })
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Falha ao salvar')
    const novo = { ...resp.data, valor: Number(resp.data.valor) }
    const idx = lancamentos.value.findIndex(l => l.id === novo.id)
    if (idx >= 0) lancamentos.value[idx] = novo
    else lancamentos.value.unshift(novo)
    return novo
  }

  async function togglePago(id: string, pago: boolean) {
    const resp = await $fetch<{ success: boolean; data_pagamento?: string | null; error?: string }>('/api/admin/financeiro/pagar', {
      method: 'POST',
      body: { id, pago },
      headers: await headers(),
    })
    if (!resp.success) throw new Error(resp.error || 'Falha ao atualizar pagamento')
    const l = lancamentos.value.find(x => x.id === id)
    if (l) l.data_pagamento = resp.data_pagamento ?? null
  }

  async function excluir(id: string) {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/financeiro/excluir', {
      method: 'POST',
      body: { id },
      headers: await headers(),
    })
    if (!resp.success) throw new Error(resp.error || 'Falha ao excluir')
    lancamentos.value = lancamentos.value.filter(l => l.id !== id)
  }

  const hoje = new Date()
  const mesAtualKey = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`

  function chaveMes(l: FinanceiroLancamento): string {
    const ref = l.data_vencimento || l.created_at?.slice(0, 10) || ''
    return ref.slice(0, 7)
  }

  const stats = computed(() => {
    const doMes = lancamentos.value.filter(l => chaveMes(l) === mesAtualKey)
    const receitaMes = doMes.filter(l => l.tipo === 'entrada').reduce((acc, l) => acc + Number(l.valor || 0), 0)
    const despesaMes = doMes.filter(l => l.tipo === 'saida').reduce((acc, l) => acc + Number(l.valor || 0), 0)
    const aReceber = lancamentos.value
      .filter(l => l.tipo === 'entrada' && !l.data_pagamento)
      .reduce((acc, l) => acc + Number(l.valor || 0), 0)
    const aPagar = lancamentos.value
      .filter(l => l.tipo === 'saida' && !l.data_pagamento)
      .reduce((acc, l) => acc + Number(l.valor || 0), 0)
    const vencidosCount = lancamentos.value.filter(l => statusDoLancamento(l) === 'vencido').length
    return { receitaMes, despesaMes, saldoMes: receitaMes - despesaMes, aReceber, aPagar, vencidosCount }
  })

  return {
    lancamentos,
    loading,
    error,
    stats,
    carregar,
    salvar,
    togglePago,
    excluir,
  }
}
