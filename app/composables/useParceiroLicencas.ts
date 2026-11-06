import { ref } from 'vue'

export type TipoCredito = 'mensal_30d' | 'anual_12m' | 'delivery_ate500_30d' | 'delivery_acima500_30d'
export type SituacaoAcesso = 'ativo' | 'vencido' | 'bloqueado_parceiro' | 'bloqueado_admin'

/** Regra de uso do crédito de Delivery. Quem decide é a função do banco. */
export interface UsoDelivery {
  situacao: 'livre' | 'ok' | 'aviso' | 'bloqueado'
  movimento_30d: boolean
  renovacoes_delivery: number
  primeira_renovacao: string | null
  pedidos_30d: number
  clientes_30d: number
  pedidos_30_60d: number
  clientes_30_60d: number
  ultimo_pedido: string | null
}

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
  delivery_ativo: boolean
  /** Teto de pedidos. 0 = sem limite. */
  cota_pedidos: number
  /** Pedidos que contam na cota. Nulo sem Delivery ou quando a consulta falha. */
  pedidos_ciclo: number | null
  /** Cota mais os pedidos extras comprados. 0 = sem limite. */
  limite_pedidos: number
  /** Pedidos extras que ainda sobram: passam para o próximo ciclo. */
  extras_pedidos: number
  /** Extras disponíveis no ciclo, antes de descontar o que foi usado. */
  extras_total: number
  uso_delivery: UsoDelivery | null
  ultima_renovacao: { em: string; tipo_credito: TipoCredito | null; origem: string } | null
  /** Quem indicou este cliente (nome da empresa), mesmo que não seja da sua carteira. */
  indicado_por_nome?: string | null
  /** Desconto de indicação liberado que você deve aplicar na cobrança dele. */
  saldo_indicacao?: number
}

// ───────── Rede e desconto de indicação ─────────

export interface ClienteRede {
  empresa_id: string
  nome: string
  responsavel: string | null
  /** Só preenchido quando quem indicou também é seu cliente. */
  indicado_por_empresa_id: string | null
  /** Nome de quem indicou, mesmo de fora da sua rede. */
  indicado_por_nome: string | null
  situacao: SituacaoAcesso
  plano: string | null
  periodo: string | null
  status_assinatura: string | null
  vencimento: string | null
  aguardando_ativacao: boolean
  created_at: string
  vinculado_em: string
  preco: number | null
  diretos: number
}

export type StatusComissao = 'pendente_liberacao' | 'liberado' | 'creditado' | 'utilizado' | 'cancelado' | 'estornado'

export interface ComissaoIndicacao {
  id: string
  empresa_indicadora_id: string
  empresa_indicada_id: string
  indicada_nome: string | null
  tipo: 'primeira' | 'recorrente'
  percentual_aplicado: number
  valor_base: number
  valor_credito: number
  status: StatusComissao
  programado: boolean
  liberar_em: string | null
  liberado_em: string | null
  utilizado_em: string | null
  utilizado_descricao: string | null
  motivo_estorno: string | null
  estornado_em: string | null
  parcela: number | null
  parcelas_total: number | null
  created_at: string
  referencia_pagamento: string | null
}

export interface EfeitoProximaCobranca {
  tipo: 'nenhum' | 'parcial' | 'gratis'
  valor: number
  sobra: number
  percentual: number | null
}

export interface SomasIndicacao {
  retido: number
  programado: number
  liberado: number
  utilizado: number
}

export interface IndicadoraDesconto extends SomasIndicacao {
  empresa_id: string
  nome: string
  responsavel: string | null
  mensalidade: number | null
  indicados: { empresa_id: string; nome: string; responsavel: string | null; situacao: SituacaoAcesso | null }[]
  efeito_proxima_cobranca: EfeitoProximaCobranca
}

export interface DescontosParceiro {
  parceiro: { nome: string; telefone: string | null }
  totais: SomasIndicacao & { indicadoras: number; gratis_proxima: number; desconto_proxima: number }
  indicadoras: IndicadoraDesconto[]
  comissoes: ComissaoIndicacao[]
}

export interface ClienteDetalhe {
  dados: {
    empresa_id: string
    nome: string
    responsavel: string | null
    email: string | null
    whatsapp: string | null
    created_at: string
    vinculado_em: string
    plano: string | null
    periodo: string | null
    status_assinatura: string | null
    vencimento: string | null
    situacao: SituacaoAcesso
    preco: number | null
    preco_anual: number | null
    cobranca_agzap: boolean
    indicado_por_nome: string | null
  }
  indicados: {
    empresa_id: string
    nome: string
    responsavel: string | null
    situacao: SituacaoAcesso
    plano: string | null
    periodo: string | null
    vencimento: string | null
    created_at: string
    gera: { tipo: 'primeira' | 'recorrente'; percentual: number; valor: number; previsto: boolean } | null
  }[]
  ganhos: SomasIndicacao & { rows: ComissaoIndicacao[] }
  percentuais: { primeira: number; recorrente: number }
}

const PLANOS: Record<string, string> = { free: 'Gratuito', basic: 'Básico', pro: 'Pro', enterprise: 'Enterprise' }
const PERIODOS: Record<string, string> = { '1month': '1 mês', '6months': '6 meses', '12months': '12 meses' }

/**
 * "Pro · 1 mês", "Em teste"… Só o status diz se está em teste: há empresa
 * ativa com o período ainda gravado como "trial…".
 */
export function rotuloPlanoCliente(plano: string | null, periodo: string | null, status?: string | null) {
  if (status === 'trial' || status === 'trialing') return 'Em teste'
  const p = plano ? (PLANOS[plano] ?? plano) : null
  const d = periodo
    ? (PERIODOS[periodo] ?? (periodo.startsWith('trial') ? null : periodo))
    : null
  return [p, d].filter(Boolean).join(' · ') || '—'
}

export type SaldosCredito = Record<TipoCredito, number>

export function saldosVazios(): SaldosCredito {
  return { mensal_30d: 0, anual_12m: 0, delivery_ate500_30d: 0, delivery_acima500_30d: 0 }
}

export function ehCreditoDelivery(tipo: TipoCredito) {
  return tipo === 'delivery_ate500_30d' || tipo === 'delivery_acima500_30d'
}

/** Faixa do cliente pela cota: 0 = sem limite, definido só pela Agzap. */
export function rotuloDelivery(cota: number) {
  if (cota > 500) return 'Delivery acima de 500'
  return cota > 0 ? 'Delivery até 500' : 'Delivery'
}

export const WHATSAPP_AGZAP = '5511914600243'

export function linkSuporteAgzap(texto: string) {
  return `https://wa.me/${WHATSAPP_AGZAP}?text=${encodeURIComponent(texto)}`
}

const fmtQuantidade = new Intl.NumberFormat('pt-BR')
export const fmtPedidos = (n: number) => fmtQuantidade.format(n)

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
  delivery_ate500_30d: 'Delivery até 500',
  delivery_acima500_30d: 'Delivery acima de 500',
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
  const saldos = ref<SaldosCredito>(saldosVazios())
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
  const renovar = async (empresaId: string, tipoCredito: TipoCredito, idempotencyKey: string, confirmouAvisoUso = false) => {
    const resp = await $fetch<{
      success: boolean
      codigo?: string | null
      error?: string
      data?: { vencimento_novo: string; saldo_restante: number; repetida?: boolean }
    }>('/api/parceiro/renovar', {
      method: 'POST',
      body: { empresaId, tipoCredito, idempotencyKey, confirmouAvisoUso },
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

  const alterarDelivery = async (empresaId: string, acao: 'liberar' | 'remover', confirmado: boolean) => {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/parceiro/delivery-modulo', {
      method: 'POST',
      body: { empresaId, acao, confirmado },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Não foi possível concluir a operação')
  }

  /** Só registro para a Agzap: nunca atrapalha quem está na tela. */
  const registrarTentativaDelivery = async (empresaId: string, tipoCredito: TipoCredito) => {
    try {
      await $fetch('/api/parceiro/delivery-tentativa', {
        method: 'POST',
        body: { empresaId, tipoCredito },
        headers: await useAdminAuthHeaders(),
      })
    } catch (erro) {
      console.warn('[parceiro:delivery-tentativa]', erro)
    }
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

  // ───────── Rede e desconto de indicação (sem estado: quem chama guarda) ─────────

  const erroDe = (err: any, padrao: string) =>
    String(err?.data?.statusMessage || err?.statusMessage || err?.message || padrao)

  const loadRede = async () => {
    try {
      const resp = await $fetch<{
        success: boolean
        error?: string
        data?: { parceiro: { nome: string; telefone: string | null }; clientes: ClienteRede[] }
      }>('/api/parceiro/rede', { headers: await useAdminAuthHeaders() })
      if (!resp.success || !resp.data) throw new Error(resp.error || 'Não foi possível carregar sua rede.')
      return resp.data
    } catch (err: any) {
      throw new Error(erroDe(err, 'Não foi possível carregar sua rede.'))
    }
  }

  const loadDescontos = async () => {
    try {
      const resp = await $fetch<{ success: boolean; error?: string; data?: DescontosParceiro }>(
        '/api/parceiro/descontos',
        { headers: await useAdminAuthHeaders() },
      )
      if (!resp.success || !resp.data) throw new Error(resp.error || 'Não foi possível carregar os descontos.')
      return resp.data
    } catch (err: any) {
      throw new Error(erroDe(err, 'Não foi possível carregar os descontos.'))
    }
  }

  const loadClienteDetalhe = async (empresaId: string) => {
    try {
      const resp = await $fetch<{ success: boolean; error?: string; data?: ClienteDetalhe }>(
        '/api/parceiro/cliente-detalhe',
        { query: { empresaId }, headers: await useAdminAuthHeaders() },
      )
      if (!resp.success || !resp.data) throw new Error(resp.error || 'Não foi possível carregar o cliente.')
      return resp.data
    } catch (err: any) {
      throw new Error(erroDe(err, 'Não foi possível carregar o cliente.'))
    }
  }

  /** Dar baixa (utilizar) ou estornar (cancelar) um mês de ganho de indicação. */
  const acaoDesconto = async (comissaoId: string, acao: 'utilizar' | 'cancelar', descricao: string) => {
    try {
      const resp = await $fetch<{ success: boolean; error?: string; data?: { status: StatusComissao; valor: number } }>(
        '/api/parceiro/desconto-acao',
        { method: 'POST', body: { comissaoId, acao, descricao }, headers: await useAdminAuthHeaders() },
      )
      if (!resp.success || !resp.data) throw new Error(resp.error || 'Não foi possível salvar.')
      return resp.data
    } catch (err: any) {
      throw new Error(erroDe(err, 'Não foi possível salvar.'))
    }
  }

  /** Baixa por valor no saldo liberado (do mês mais antigo para o mais novo). */
  const usarSaldoDesconto = async (empresaId: string, valor: number, descricao: string) => {
    try {
      const resp = await $fetch<{ success: boolean; error?: string; data?: { usado: number; restante: number; parcial: boolean } }>(
        '/api/parceiro/desconto-usar-saldo',
        { method: 'POST', body: { empresaId, valor, descricao }, headers: await useAdminAuthHeaders() },
      )
      if (!resp.success || !resp.data) throw new Error(resp.error || 'Não foi possível registrar a baixa.')
      return resp.data
    } catch (err: any) {
      throw new Error(erroDe(err, 'Não foi possível registrar a baixa.'))
    }
  }

  return {
    clientes, saldos, indicadores, movimentacoes, precos,
    loading, loadingCreditos, error,
    loadCarteira, loadCreditos, renovar, bloquear, alterarDelivery, registrarTentativaDelivery,
    salvarValorAssinatura, novaIdempotencyKey,
    loadRede, loadDescontos, loadClienteDetalhe, acaoDesconto, usarSaldoDesconto,
  }
}
