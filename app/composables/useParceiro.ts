import { ref } from 'vue'

export interface ParceiroInfo {
  id: string
  nome: string
  ativo: boolean
}

export interface ParceiroComissao {
  vinculo_id: string
  parceiro_id: string
  parceiro_nome: string
  empresa_id: string
  empresa_nome: string
  empresa_telefone: string | null
  empresa_cadastro: string
  status_assinatura: string | null
  proximo_vencimento: string | null
  valor_assinatura: number
  comissao_percentual: number
  valor_comissao: number
  considerada_ativa: boolean
}

export interface ParceiroSaldo {
  empresas_ativas: number
  empresas_total: number
  saldo_comissao: number
}

export interface ParceiroLancamento {
  id: string
  empresa_id: string | null
  empresa_nome: string
  origem: 'manual' | 'stripe' | 'ajuste'
  valor_base: number
  comissao_percentual: number
  valor_comissao: number
  pago_em: string
  liberar_em: string
  repassado_em: string | null
  status: 'a_liberar' | 'liberado' | 'estornado' | 'repassado'
}

export interface ParceiroPixConfig {
  tipo: string
  chave: string
  titular_nome: string
  titular_documento: string | null
}

export interface ParceiroResumo {
  lancamentos: ParceiroLancamento[]
  saldos: { aLiberar: number; liberado: number; repassado: number; estornado: number }
  config: ParceiroPixConfig | null
  parceiro: { nome: string; email: string | null; telefone: string | null }
}

export const useParceiro = () => {
  const parceiro = ref<ParceiroInfo | null>(null)
  const clientes = ref<ParceiroComissao[]>([])
  const saldo = ref<ParceiroSaldo | null>(null)
  const resumo = ref<ParceiroResumo | null>(null)
  const loadingResumo = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** Retorna o registro do parceiro vinculado ao usuário logado (ou null). */
  const checkParceiro = async (): Promise<ParceiroInfo | null> => {
    try {
      const supabase = useSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        parceiro.value = null
        return null
      }

      const { data, error: err } = await supabase
        .from('parceiros')
        .select('id, nome, ativo')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (err || !data) {
        parceiro.value = null
        return null
      }

      parceiro.value = data as ParceiroInfo
      return parceiro.value
    } catch {
      parceiro.value = null
      return null
    }
  }

  /** Carrega clientes e saldo das views (RLS filtra pelo parceiro logado). */
  const loadDados = async () => {
    loading.value = true
    error.value = null
    try {
      const supabase = useSupabaseClient()
      const [comissoesRes, saldoRes] = await Promise.all([
        supabase.from('vw_parceiro_comissoes').select('*').order('empresa_nome'),
        supabase.from('vw_parceiro_saldo').select('*').maybeSingle(),
      ])

      if (comissoesRes.error) throw comissoesRes.error
      clientes.value = (comissoesRes.data || []) as ParceiroComissao[]

      // Fallback de vencimento: empresas renovadas como trial não têm
      // subscription_renews_at — a data fica em trial_ends_at, que a view não
      // expõe. O RLS permite o parceiro ler as empresas atribuídas a ele.
      const semVencimento = clientes.value.filter(c => !c.proximo_vencimento).map(c => c.empresa_id)
      if (semVencimento.length > 0) {
        const { data: empresas } = await supabase
          .from('empresas')
          .select('id, trial_ends_at')
          .in('id', semVencimento)
        const trialPorEmpresa = new Map(
          ((empresas || []) as Array<{ id: string; trial_ends_at: string | null }>).map(e => [e.id, e.trial_ends_at]),
        )
        clientes.value = clientes.value.map(c =>
          c.proximo_vencimento ? c : { ...c, proximo_vencimento: trialPorEmpresa.get(c.empresa_id) ?? null },
        )
      }

      // Parceiro sem empresas atribuídas não tem linha na view de saldo
      saldo.value = (saldoRes.data as ParceiroSaldo | null) ?? {
        empresas_ativas: 0,
        empresas_total: 0,
        saldo_comissao: 0,
      }
    } catch (err: any) {
      error.value = String(err?.message || err)
    } finally {
      loading.value = false
    }
  }

  /** Carrega extrato de comissões, saldos (a liberar/liberado) e config PIX. */
  const loadResumo = async () => {
    loadingResumo.value = true
    try {
      const resp = await $fetch<{ success: boolean; data?: ParceiroResumo; error?: string }>(
        '/api/parceiro/resumo',
        { headers: await useAdminAuthHeaders() },
      )
      if (!resp.success || !resp.data) throw new Error(resp.error || 'Erro ao carregar resumo')
      resumo.value = resp.data
    } catch (err: any) {
      error.value = String(err?.data?.statusMessage || err?.message || err)
    } finally {
      loadingResumo.value = false
    }
  }

  /** Salva a configuração de PIX do parceiro logado. */
  const salvarConfig = async (config: {
    pixTipo: string
    pixChave: string
    titularNome: string
    titularDocumento?: string
  }) => {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/parceiro/config', {
      method: 'POST',
      body: config,
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro ao salvar configuração')
  }

  return {
    parceiro, clientes, saldo, resumo, loading, loadingResumo, error,
    checkParceiro, loadDados, loadResumo, salvarConfig,
  }
}
