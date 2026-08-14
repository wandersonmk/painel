import { ref } from 'vue'

export type TipoCredito = 'mensal_30d' | 'anual_12m'
export type SituacaoAcesso = 'ativo' | 'vencido' | 'bloqueado_parceiro' | 'bloqueado_admin'

export interface ClienteCarteira {
  vinculo_id: string
  empresa_id: string
  empresa_nome: string
  responsavel: string | null
  email: string | null
  telefone: string | null
  plano: string | null
  status_assinatura: string | null
  vinculado_em: string
  empresa_cadastro: string
  vencimento: string | null
  dias_restantes: number | null
  situacao: SituacaoAcesso
  /** Valor que o cliente vê na tela de assinatura — definido pelo parceiro. */
  preco: number | null
  /** Preço fechado do plano de 12 meses, para o relatório do parceiro. */
  preco_anual: number | null
  bloqueado_em: string | null
  cobranca_agzap: boolean
  instancias: number
  max_instancias: number
  assistentes: number
  max_assistentes: number
  ultima_renovacao: { em: string; tipo_credito: TipoCredito | null; origem: string } | null
}

export interface SaldosCredito { mensal_30d: number; anual_12m: number }

export interface IndicadoresCarteira {
  total: number
  ativos: number
  vencendo_7d: number
  vencidos: number
  bloqueados_pelo_parceiro: number
  creditos_consumidos_mes: number
  renovacoes_mes: number
}

export interface MovimentacaoCredito {
  id: string
  tipo_credito: TipoCredito
  quantidade: number
  operacao: 'compra' | 'concessao_admin' | 'consumo' | 'correcao' | 'migracao'
  empresa_id: string | null
  empresa_nome: string | null
  descricao: string | null
  valor_pago: number | null
  nova_validade: string | null
  created_at: string
}

export interface PrecoLicenca {
  tipo_credito: TipoCredito
  quantidade_min: number
  preco_unitario: number
  preco_sugerido_revenda: number | null
}

export const LABEL_CREDITO: Record<TipoCredito, string> = {
  mensal_30d: '30 dias',
  anual_12m: '12 meses',
}

/** Chave única por tentativa: evita que um duplo clique consuma dois créditos. */
function novaIdempotencyKey() {
  const aleatorio = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return aleatorio.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60)
}

export const useParceiroLicencas = () => {
  const clientes = ref<ClienteCarteira[]>([])
  const saldos = ref<SaldosCredito>({ mensal_30d: 0, anual_12m: 0 })
  const indicadores = ref<IndicadoresCarteira | null>(null)
  const movimentacoes = ref<MovimentacaoCredito[]>([])
  const precos = ref<PrecoLicenca[]>([])
  const loading = ref(false)
  const loadingCreditos = ref(false)
  const error = ref<string | null>(null)

  const loadCarteira = async () => {
    loading.value = true
    error.value = null
    try {
      const resp = await $fetch<{ success: boolean; data?: any; error?: string }>(
        '/api/parceiro/carteira',
        { headers: await useAdminAuthHeaders() },
      )
      if (!resp.success || !resp.data) throw new Error(resp.error || 'Erro ao carregar carteira')
      clientes.value = resp.data.clientes
      saldos.value = resp.data.saldos
      indicadores.value = resp.data.indicadores
    } catch (err: any) {
      error.value = String(err?.data?.statusMessage || err?.message || err)
    } finally {
      loading.value = false
    }
  }

  const loadCreditos = async () => {
    loadingCreditos.value = true
    try {
      const resp = await $fetch<{ success: boolean; data?: any; error?: string }>(
        '/api/parceiro/creditos',
        { headers: await useAdminAuthHeaders() },
      )
      if (!resp.success || !resp.data) throw new Error(resp.error || 'Erro ao carregar créditos')
      saldos.value = resp.data.saldos
      movimentacoes.value = resp.data.movimentacoes
      precos.value = resp.data.precos
    } catch (err: any) {
      error.value = String(err?.data?.statusMessage || err?.message || err)
    } finally {
      loadingCreditos.value = false
    }
  }

  /**
   * Consome 1 crédito e renova o cliente. A chave de idempotência é gerada
   * uma vez por tentativa — reenviar a MESMA chave nunca cobra duas vezes.
   */
  const renovar = async (empresaId: string, tipoCredito: TipoCredito, idempotencyKey: string) => {
    const resp = await $fetch<{
      success: boolean
      codigo?: string | null
      error?: string
      data?: { vencimento_novo: string; saldo_restante: number; repetida?: boolean }
    }>('/api/parceiro/renovar', {
      method: 'POST',
      body: { empresaId, tipoCredito, idempotencyKey },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Não foi possível renovar')
    return resp.data!
  }

  const bloquear = async (empresaId: string, bloquear: boolean, motivo?: string) => {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/parceiro/bloquear', {
      method: 'POST',
      body: { empresaId, bloquear, motivo },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Não foi possível concluir a operação')
  }

  /**
   * Mensal é o que o cliente vê no app; anual é o preço fechado do plano de
   * 12 meses, usado no relatório do parceiro.
   */
  const salvarValorAssinatura = async (empresaId: string, valor: number | null, valorAnual: number | null = null) => {
    const resp = await $fetch<{
      success: boolean
      error?: string
      data?: { valor: number | null; valorAnual: number | null }
    }>('/api/parceiro/valor-assinatura', {
      method: 'POST',
      body: { empresaId, valor, valorAnual },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Não foi possível salvar o valor')
    const c = clientes.value.find(x => x.empresa_id === empresaId)
    if (c) {
      c.preco = resp.data?.valor ?? null
      c.preco_anual = resp.data?.valorAnual ?? null
    }
    return resp.data ?? null
  }

  return {
    clientes, saldos, indicadores, movimentacoes, precos,
    loading, loadingCreditos, error,
    loadCarteira, loadCreditos, renovar, bloquear, salvarValorAssinatura, novaIdempotencyKey,
  }
}
