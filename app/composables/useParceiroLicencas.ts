import { ref } from 'vue'

// mensal_30d é o Start e anual_12m é o PRO: os nomes vêm de quando só existiam
// esses dois, e o saldo antigo continua valendo.
export const TIPOS_CREDITO = [
  'mensal_30d', 'pro_30d', 'enterprise_30d', 'delivery_ate500_30d', 'delivery_acima500_30d',
  'start_12m', 'anual_12m', 'enterprise_12m', 'delivery_ate500_12m', 'delivery_acima500_12m',
] as const
export type TipoCredito = (typeof TIPOS_CREDITO)[number]
export type PlanoCodigo = 'start' | 'pro' | 'enterprise' | 'delivery_ate500' | 'delivery_acima500'
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
  /** Plano liberado. Nulo em conta antiga e em quem ainda não renovou. */
  plano_codigo: PlanoCodigo | null
  /** Pagava antes dos planos: renova sem plano e sem limite novo. */
  legado: boolean
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

const PLANOS: Record<string, string> = {
  free: 'Gratuito', basic: 'Básico', pro: 'Pro', enterprise: 'Enterprise',
  start: 'Start', delivery_ate500: 'Delivery até 500', delivery_acima500: 'Delivery acima de 500',
}
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
  return Object.fromEntries(TIPOS_CREDITO.map(t => [t, 0])) as SaldosCredito
}

/** Nível: Start 1, PRO 2, Enterprise 3. Delivery fica em 0 e só renova Delivery. */
export const CREDITOS: Record<TipoCredito, { plano: PlanoCodigo; meses: 1 | 12; nivel: number }> = {
  mensal_30d: { plano: 'start', meses: 1, nivel: 1 },
  pro_30d: { plano: 'pro', meses: 1, nivel: 2 },
  enterprise_30d: { plano: 'enterprise', meses: 1, nivel: 3 },
  delivery_ate500_30d: { plano: 'delivery_ate500', meses: 1, nivel: 0 },
  delivery_acima500_30d: { plano: 'delivery_acima500', meses: 1, nivel: 0 },
  start_12m: { plano: 'start', meses: 12, nivel: 1 },
  anual_12m: { plano: 'pro', meses: 12, nivel: 2 },
  enterprise_12m: { plano: 'enterprise', meses: 12, nivel: 3 },
  delivery_ate500_12m: { plano: 'delivery_ate500', meses: 12, nivel: 0 },
  delivery_acima500_12m: { plano: 'delivery_acima500', meses: 12, nivel: 0 },
}

export const PLANOS_PARCEIRO: { codigo: PlanoCodigo; nome: string; alcance: string }[] = [
  { codigo: 'start', nome: 'Start', alcance: 'Renova o plano Start' },
  { codigo: 'pro', nome: 'PRO', alcance: 'Renova os planos PRO e Start' },
  { codigo: 'enterprise', nome: 'Enterprise', alcance: 'Renova os planos Enterprise, PRO e Start' },
  { codigo: 'delivery_ate500', nome: 'Delivery até 500', alcance: 'Renova o Delivery de até 500 pedidos' },
  { codigo: 'delivery_acima500', nome: 'Delivery acima de 500', alcance: 'Renova as duas faixas do Delivery' },
]

export function nomeDoPlano(codigo: PlanoCodigo) {
  return PLANOS_PARCEIRO.find(p => p.codigo === codigo)?.nome ?? codigo
}

export function ehCreditoDelivery(tipo: TipoCredito) {
  return CREDITOS[tipo].nivel === 0
}

/** Mesma regra da função do banco, que confere de novo ao renovar. */
export function creditoServeParaPlano(tipo: TipoCredito, plano: PlanoCodigo) {
  const credito = CREDITOS[tipo]
  if (plano === 'delivery_ate500') return credito.nivel === 0
  if (plano === 'delivery_acima500') return credito.plano === 'delivery_acima500'
  const nivelDoPlano = { start: 1, pro: 2, enterprise: 3 }[plano]
  return credito.nivel >= nivelDoPlano
}

export function creditoDoPlano(plano: PlanoCodigo, meses: 1 | 12) {
  return TIPOS_CREDITO.find(t => CREDITOS[t].plano === plano && CREDITOS[t].meses === meses)!
}

export type GrupoSaldo = '30d' | '12m' | 'delivery_ate500' | 'delivery_acima500'

/** Resumo para os lugares sem espaço para os 10 tipos. */
export function somaSaldos(saldos: Partial<SaldosCredito> | null | undefined, grupo: GrupoSaldo) {
  return TIPOS_CREDITO.reduce((soma, t) => {
    const c = CREDITOS[t]
    const doTipo = c.nivel === 0 ? c.plano : c.meses === 12 ? '12m' : '30d'
    return doTipo === grupo ? soma + Number(saldos?.[t] ?? 0) : soma
  }, 0)
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
  mensal_30d: 'Start 30 dias',
  pro_30d: 'PRO 30 dias',
  enterprise_30d: 'Enterprise 30 dias',
  delivery_ate500_30d: 'Delivery até 500 · 30 dias',
  delivery_acima500_30d: 'Delivery acima de 500 · 30 dias',
  start_12m: 'Start 12 meses',
  anual_12m: 'PRO 12 meses',
  enterprise_12m: 'Enterprise 12 meses',
  delivery_ate500_12m: 'Delivery até 500 · 12 meses',
  delivery_acima500_12m: 'Delivery acima de 500 · 12 meses',
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
  const renovar = async (
    empresaId: string,
    tipoCredito: TipoCredito,
    idempotencyKey: string,
    confirmouAvisoUso = false,
    plano: PlanoCodigo | null = null,
  ) => {
    const resp = await $fetch<{
      success: boolean
      codigo?: string | null
      error?: string
      data?: { vencimento_novo: string; saldo_restante: number; repetida?: boolean }
    }>('/api/parceiro/renovar', {
      method: 'POST',
      body: { empresaId, tipoCredito, plano, idempotencyKey, confirmouAvisoUso },
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
