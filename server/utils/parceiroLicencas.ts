import type { H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { failPublic } from './apiError'

export const TIPOS_CREDITO = ['mensal_30d', 'anual_12m'] as const
export type TipoCredito = (typeof TIPOS_CREDITO)[number]

export function isTipoCredito(valor: unknown): valor is TipoCredito {
  return typeof valor === 'string' && (TIPOS_CREDITO as readonly string[]).includes(valor)
}

export const LABEL_CREDITO: Record<TipoCredito, string> = {
  mensal_30d: '30 dias',
  anual_12m: '12 meses',
}

/**
 * Códigos estáveis devolvidos pelas funções do banco → mensagem para o parceiro.
 * Nunca expõe detalhe interno nem dado de outro parceiro.
 */
const MENSAGENS: Record<string, string> = {
  PARTNER_NOT_ACTIVE: 'Sua conta de parceiro não está ativa. Fale com a Agzap.',
  PARTNER_MODEL_NOT_ALLOWED: 'Sua conta ainda não está no modelo de licenças pré-pagas.',
  PARTNER_NOT_FOUND: 'Parceiro não encontrado.',
  CUSTOMER_NOT_LINKED: 'Este cliente não está vinculado à sua conta.',
  CUSTOMER_NOT_RENEWABLE: 'Este cliente não pode ser renovado.',
  CUSTOMER_BILLED_BY_AGZAP: 'Este cliente é cobrado diretamente pela Agzap e não consome crédito.',
  INSUFFICIENT_CREDITS: 'Você não tem crédito suficiente para esta renovação.',
  INVALID_CREDIT_TYPE: 'Tipo de crédito inválido.',
  INVALID_QUANTITY: 'Quantidade inválida.',
  RENEWAL_ALREADY_PROCESSED: 'Esta renovação já foi processada.',
  FORBIDDEN_ACTION: 'Você não tem permissão para esta ação.',
  CONCURRENT_OPERATION: 'Outra operação está em andamento. Tente novamente em instantes.',
}

export function mensagemErro(codigo?: string | null) {
  if (!codigo) return 'Não foi possível concluir a operação. Tente novamente.'
  return MENSAGENS[codigo] ?? 'Não foi possível concluir a operação. Tente novamente.'
}

/**
 * A chave de idempotência vem do navegador, então precisa ser tratada como
 * entrada não confiável: só formato, e sempre prefixada com o dono da ação
 * para uma chave de um parceiro nunca colidir com a de outro.
 */
export function normalizarIdempotencyKey(bruta: unknown, escopo: string): string {
  const valor = String(bruta ?? '').trim()
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(valor)) {
    throw createError({ statusCode: 400, statusMessage: 'Requisição inválida' })
  }
  return `${escopo}:${valor}`
}

/**
 * Limitador simples em memória. Em serverless vale por instância, então é uma
 * contenção de rajada — a garantia real contra consumo duplicado é a
 * idempotency_key única + a transação no banco.
 */
const janelas = new Map<string, number[]>()

export function aplicarRateLimit(chave: string, maximo: number, janelaMs: number) {
  const agora = Date.now()
  const anteriores = (janelas.get(chave) ?? []).filter(t => agora - t < janelaMs)
  if (anteriores.length >= maximo) {
    throw createError({ statusCode: 429, statusMessage: 'Muitas tentativas seguidas. Aguarde alguns segundos.' })
  }
  anteriores.push(agora)
  janelas.set(chave, anteriores)
  if (janelas.size > 5000) janelas.clear()
}

export interface EntradaAuditoria {
  parceiro_id?: string | null
  empresa_id?: string | null
  ator_user_id: string
  ator_papel: 'admin' | 'parceiro' | 'sistema'
  acao: string
  estado_anterior?: unknown
  estado_novo?: unknown
  motivo?: string | null
  idempotency_key?: string | null
  origem: string
}

/** Auditoria é best-effort: nunca derruba a operação principal. */
export async function registrarAuditoria(
  supabase: SupabaseClient,
  event: H3Event,
  entrada: EntradaAuditoria,
) {
  try {
    await supabase.from('parceiro_auditoria').insert({
      ...entrada,
      estado_anterior: entrada.estado_anterior ?? null,
      estado_novo: entrada.estado_novo ?? null,
      ip: getRequestIP(event, { xForwardedFor: true }) ?? null,
    })
  }
  catch (erro) {
    console.error('[parceiroLicencas:auditoria]', erro)
  }
}

// ───────── Rede do parceiro e desconto de indicação ─────────
// Quando quem indicou é cliente de um parceiro, é o PARCEIRO que paga o
// desconto (aplica na cobrança dele) e cuida disso no portal. As rotas de
// /api/parceiro/rede, descontos e cliente-detalhe usam as funções abaixo.

export type SituacaoCliente = 'ativo' | 'vencido' | 'bloqueado_parceiro' | 'bloqueado_admin'

export interface EmpresaDatasAcesso {
  ativo?: boolean | null
  subscription_renews_at?: string | null
  trial_ends_at?: string | null
}

/**
 * Mesma regra do carteira.get.ts: bloqueio vale mais que vencimento, e o
 * vencimento é a renovação ou, sem ela, o fim do teste.
 */
export function situacaoDoCliente(
  bloqueioOrigem: string | null | undefined,
  empresa: EmpresaDatasAcesso,
  agora = Date.now(),
): { situacao: SituacaoCliente; vencimento: string | null } {
  const vencimento = empresa.subscription_renews_at ?? empresa.trial_ends_at ?? null
  const ms = vencimento ? new Date(vencimento).getTime() : null
  let situacao: SituacaoCliente
  if (bloqueioOrigem === 'parceiro') situacao = 'bloqueado_parceiro'
  else if (bloqueioOrigem === 'admin' || empresa.ativo === false) situacao = 'bloqueado_admin'
  else if (ms !== null && ms < agora) situacao = 'vencido'
  else situacao = 'ativo'
  return { situacao, vencimento }
}

/**
 * Em teste ou sem data de vencimento: ainda não virou cliente pagante.
 * Só o status diz se está em teste — há empresa ativa com o período ainda
 * gravado como "trial…" (mesma ressalva do AdminUsoEmpresaModal).
 */
export function aguardandoAtivacao(empresa: {
  subscription_status?: string | null
  subscription_renews_at?: string | null
  trial_ends_at?: string | null
}) {
  const status = String(empresa.subscription_status ?? '').toLowerCase()
  return status === 'trial' || status === 'trialing'
    || !(empresa.subscription_renews_at ?? empresa.trial_ends_at)
}

type RespostaLote<T> = PromiseLike<{ data: T[] | null; error: unknown }>

/**
 * .in() com centenas de ids estoura a URL do PostgREST, e cada resposta vem
 * cortada em 1000 linhas. Busca em lotes de ids e pagina cada lote. A consulta
 * precisa de ORDER BY estável, senão a paginação pula ou repete linha.
 */
export async function buscarEmLotes<T>(
  ids: string[],
  consulta: (lote: string[], de: number, ate: number) => RespostaLote<T>,
  tamanhoLote = 100,
): Promise<{ data: T[]; error: unknown }> {
  const PAGINA = 1000
  const unicos = [...new Set(ids.filter(Boolean))]
  const lotes: string[][] = []
  for (let i = 0; i < unicos.length; i += tamanhoLote) lotes.push(unicos.slice(i, i + tamanhoLote))

  const resultados = await Promise.all(lotes.map(async (lote) => {
    const linhas: T[] = []
    for (let de = 0; ; de += PAGINA) {
      const { data, error } = await consulta(lote, de, de + PAGINA - 1)
      if (error) return { linhas, error }
      const pagina = data ?? []
      linhas.push(...pagina)
      if (pagina.length < PAGINA) break
    }
    return { linhas, error: null as unknown }
  }))

  const erro = resultados.find(r => r.error)?.error ?? null
  return { data: resultados.flatMap(r => r.linhas), error: erro }
}

/**
 * Clientes do parceiro = parceiro_empresas ativos com a empresa embutida.
 * Nunca sai de empresas direto: o parceiro também pode ser cliente da Agzap.
 * Paginado para a rede grande não sumir no corte de 1000 linhas.
 */
export async function vinculosDoParceiro(
  supabase: SupabaseClient,
  parceiroId: string,
  colunasEmpresa: string,
): Promise<{ data: any[]; error: unknown }> {
  const PAGINA = 1000
  const vistos = new Set<string>()
  const saida: any[] = []
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from('parceiro_empresas')
      .select(`id, empresa_id, bloqueio_origem, cobranca_agzap, created_at, empresas ( ${colunasEmpresa} )`)
      .eq('parceiro_id', parceiroId)
      .eq('ativo', true)
      .order('id', { ascending: true })
      .range(de, de + PAGINA - 1)
    if (error) return { data: saida, error }
    const pagina = (data ?? []) as any[]
    for (const v of pagina) {
      if (!v.empresas || vistos.has(v.empresa_id)) continue
      vistos.add(v.empresa_id)
      saida.push(v)
    }
    if (pagina.length < PAGINA) break
  }
  return { data: saida, error: null }
}

/** Vínculo revalidado a cada ação: o id que veio da tela nunca basta. */
export function vinculoAtivoDoParceiro(supabase: SupabaseClient, parceiroId: string, empresaId: string) {
  return supabase
    .from('parceiro_empresas')
    .select('id, bloqueio_origem, cobranca_agzap, created_at')
    .eq('empresa_id', empresaId)
    .eq('parceiro_id', parceiroId)
    .eq('ativo', true)
    .limit(1)
    .maybeSingle()
}

export const COLUNAS_COMISSAO_PARCEIRO = 'id, empresa_indicadora_id, empresa_indicada_id, tipo, percentual_aplicado, valor_base, valor_credito, status, liberar_em, liberado_em, utilizado_em, utilizado_descricao, motivo_estorno, estornado_em, parcela, parcelas_total, created_at, referencia_pagamento, indicada:empresas!indicacoes_comissoes_empresa_indicada_id_fkey ( nome )'

export interface ComissaoParceiro {
  id: string
  empresa_indicadora_id: string
  empresa_indicada_id: string
  indicada_nome: string | null
  tipo: 'primeira' | 'recorrente'
  percentual_aplicado: number
  valor_base: number
  valor_credito: number
  status: string
  /** Meses 2..N de um plano pago adiantado: saem na data, não é carência. */
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

export function centavos(v: number) {
  return Math.round((Number(v) || 0) * 100) / 100
}

export function mapearComissao(l: any): ComissaoParceiro {
  return {
    id: l.id,
    empresa_indicadora_id: l.empresa_indicadora_id,
    empresa_indicada_id: l.empresa_indicada_id,
    indicada_nome: l.indicada?.nome ?? null,
    tipo: l.tipo,
    percentual_aplicado: Number(l.percentual_aplicado) || 0,
    valor_base: Number(l.valor_base) || 0,
    valor_credito: Number(l.valor_credito) || 0,
    status: l.status,
    programado: l.status === 'pendente_liberacao' && Number(l.parcela || 1) > 1,
    liberar_em: l.liberar_em ?? null,
    liberado_em: l.liberado_em ?? null,
    utilizado_em: l.utilizado_em ?? null,
    utilizado_descricao: l.utilizado_descricao ?? null,
    motivo_estorno: l.motivo_estorno ?? null,
    estornado_em: l.estornado_em ?? null,
    parcela: l.parcela ?? null,
    parcelas_total: l.parcelas_total ?? null,
    created_at: l.created_at,
    referencia_pagamento: l.referencia_pagamento ?? null,
  }
}

/** Retido = carência de 7 dias; programado = meses futuros do plano adiantado. */
export function somarComissoes(linhas: ComissaoParceiro[]) {
  const soma = (filtro: (l: ComissaoParceiro) => boolean) =>
    centavos(linhas.filter(filtro).reduce((a, l) => a + l.valor_credito, 0))
  return {
    retido: soma(l => l.status === 'pendente_liberacao' && !l.programado),
    programado: soma(l => l.programado),
    liberado: soma(l => l.status === 'liberado'),
    // 'creditado' é da regra antiga (foi para o saldo do Stripe): já foi usado.
    utilizado: soma(l => l.status === 'utilizado' || l.status === 'creditado'),
  }
}

export type EfeitoProximaCobranca = {
  tipo: 'nenhum' | 'parcial' | 'gratis'
  valor: number
  sobra: number
  /** % da mensalidade que o desconto cobre. Nulo quando a mensalidade não está definida. */
  percentual: number | null
}

/** O que o saldo liberado faz na próxima mensalidade de quem indicou. */
export function efeitoProximaCobranca(liberado: number, mensalidade: number | null): EfeitoProximaCobranca {
  const saldo = centavos(liberado)
  if (!(saldo > 0)) return { tipo: 'nenhum', valor: 0, sobra: 0, percentual: null }
  if (!mensalidade || mensalidade <= 0) return { tipo: 'parcial', valor: saldo, sobra: 0, percentual: null }
  if (saldo + 0.001 >= mensalidade) {
    return { tipo: 'gratis', valor: centavos(mensalidade), sobra: centavos(saldo - mensalidade), percentual: 100 }
  }
  return { tipo: 'parcial', valor: saldo, sobra: 0, percentual: Math.round((saldo / mensalidade) * 100) }
}

// ───────── Remover parceria (09/10/2026) ─────────

/** Nota que a remoção deixa em observacoes (o backfill de removido_em procura por ela). */
export const NOTA_PARCERIA_REMOVIDA = 'Parceria removida pelo admin'

export const COLUNAS_REMOCAO_PARCEIRO = 'id, nome, ativo, observacoes, removido_em'

export interface ParceiroParaRemocao {
  id: string
  nome: string
  ativo: boolean
  observacoes: string | null
  removido_em?: string | null
}

/**
 * Regra única de "Remover parceria", usada pela rota remover-parceria e pela
 * troca automática de papel do tornar-afiliado. Não apaga nada — ao contrário
 * do "Excluir" da tela Parceiros:
 *  - os clientes da carteira são desvinculados e voltam para a Agzap, com
 *    registro em parceiro_vinculos_historico;
 *  - os créditos que sobraram ficam congelados no extrato;
 *  - o cadastro fica ativo = false + removido_em (REMOVIDO, não suspenso: some
 *    da tela Parceiros e o login ignora o papel).
 * `previa` só conta o que vai acontecer. Parceria já removida: recusa.
 */
export async function removerParceriaDoParceiro(
  supabase: SupabaseClient,
  event: H3Event,
  parceiro: ParceiroParaRemocao,
  opcoes: { adminUserId: string; previa?: boolean; nota?: string },
): Promise<
  | { success: true; data: { previa?: true; nome: string; ativo?: boolean; clientes: number; creditos: number } }
  | { success: false; error: string }
> {
  const contexto = 'admin/remover-parceria'
  if (parceiro.removido_em) return { success: false, error: 'A parceria desta pessoa já foi removida.' }

  const { data: vinculos, error: vincErr } = await supabase
    .from('parceiro_empresas')
    .select('empresa_id, bloqueio_origem, cobranca_agzap, empresas ( nome )')
    .eq('parceiro_id', parceiro.id)
    .eq('ativo', true)
  if (vincErr) return failPublic(vincErr, contexto, 'Não foi possível remover a parceria.')

  const motivo = opcoes.nota || NOTA_PARCERIA_REMOVIDA
  const lista = (vinculos || []) as any[]

  const { data: saldos } = await supabase.from('parceiro_creditos_saldo').select('saldo').eq('parceiro_id', parceiro.id)
  const creditos = (saldos || []).reduce((t: number, s: any) => t + Number(s.saldo || 0), 0)

  if (opcoes.previa) {
    return { success: true, data: { previa: true, nome: parceiro.nome, ativo: parceiro.ativo, clientes: lista.length, creditos } }
  }

  // Histórico antes do delete: depois a linha não existe mais para consultar.
  if (lista.length) {
    const { error: histErr } = await supabase.from('parceiro_vinculos_historico').insert(lista.map(v => ({
      empresa_id: v.empresa_id,
      empresa_nome: v.empresas?.nome ?? null,
      parceiro_anterior_id: parceiro.id,
      parceiro_novo_id: null,
      acao: 'desvinculo',
      motivo,
      executado_por: opcoes.adminUserId,
    })))
    if (histErr) return failPublic(histErr, contexto, 'Não foi possível registrar o histórico. Nada foi alterado.')

    const { error: delErr } = await supabase
      .from('parceiro_empresas')
      .delete()
      .eq('parceiro_id', parceiro.id)
      .eq('ativo', true)
    if (delErr) return failPublic(delErr, contexto, 'Não foi possível desvincular os clientes.')
  }

  const agora = new Date().toISOString()
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const observacoes = [parceiro.observacoes?.trim(), `${motivo} em ${hoje}.`].filter(Boolean).join('\n')
  const { error: upErr } = await supabase
    .from('parceiros')
    .update({ ativo: false, removido_em: agora, observacoes, updated_at: agora })
    .eq('id', parceiro.id)
  if (upErr) return failPublic(upErr, contexto, 'Os clientes foram desvinculados, mas a parceria não foi removida. Tente de novo.')

  await registrarAuditoria(supabase, event, {
    parceiro_id: parceiro.id,
    empresa_id: null,
    ator_user_id: opcoes.adminUserId,
    ator_papel: 'admin',
    acao: 'parceria_removida',
    estado_anterior: { ativo: parceiro.ativo, clientes: lista.length, creditos },
    estado_novo: { ativo: false, removido: true, clientes: 0 },
    motivo,
    origem: 'painel_admin',
  })

  return { success: true, data: { nome: parceiro.nome, clientes: lista.length, creditos } }
}
