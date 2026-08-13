import type { H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'

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
