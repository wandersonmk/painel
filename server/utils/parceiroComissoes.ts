import Stripe from 'stripe'
import { getServiceClient } from './requireSuperAdmin'

/**
 * Retenção: cada pagamento segura 30 dias (janela de estorno/chargeback) antes
 * de virar saldo liberado. Vale para Stripe e pagamentos manuais. O +1 dia útil
 * de processamento acontece depois, na solicitação do saque.
 */
export const RETENCAO_DIAS = 30

/**
 * Data de liberação: meia-noite (horário de Brasília) do 31º dia.
 * Ex.: pagou 15/05 a qualquer hora → libera 14/06 às 00:00 BRT.
 */
export function calcularLiberarEm(pagoEm: Date): Date {
  const brt = new Date(pagoEm.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  // 00:00 em Brasília = 03:00 UTC (BRT é UTC-3 fixo)
  return new Date(Date.UTC(brt.getFullYear(), brt.getMonth(), brt.getDate() + RETENCAO_DIAS, 3, 0, 0))
}

export interface ComissaoLancamento {
  id: string
  parceiro_id: string
  empresa_id: string
  origem: 'manual' | 'stripe'
  valor_base: number
  comissao_percentual: number
  valor_comissao: number
  pago_em: string
  liberar_em: string
  status: 'retido' | 'estornado' | 'repassado'
  repassado_em: string | null
}

export type StatusExibicao = 'a_liberar' | 'liberado' | 'estornado' | 'repassado'

export function statusExibicao(l: ComissaoLancamento, agora = new Date()): StatusExibicao {
  if (l.status === 'estornado') return 'estornado'
  if (l.status === 'repassado') return 'repassado'
  return new Date(l.liberar_em) > agora ? 'a_liberar' : 'liberado'
}

export function computeSaldos(lancamentos: ComissaoLancamento[], agora = new Date()) {
  const saldos = { aLiberar: 0, liberado: 0, repassado: 0, estornado: 0 }
  for (const l of lancamentos) {
    const v = Number(l.valor_comissao) || 0
    const st = statusExibicao(l, agora)
    if (st === 'a_liberar') saldos.aLiberar += v
    else if (st === 'liberado') saldos.liberado += v
    else if (st === 'repassado') saldos.repassado += v
    else saldos.estornado += v
  }
  return {
    aLiberar: Math.round(saldos.aLiberar * 100) / 100,
    liberado: Math.round(saldos.liberado * 100) / 100,
    repassado: Math.round(saldos.repassado * 100) / 100,
    estornado: Math.round(saldos.estornado * 100) / 100,
  }
}

function round2(v: number) {
  return Math.round(v * 100) / 100
}

// Evita bater no Stripe a cada request — sincroniza no máximo 1x a cada 5 min por escopo
const ultimaSync = new Map<string, number>()
const SYNC_INTERVAL_MS = 5 * 60 * 1000

/**
 * Sincroniza cobranças do Stripe com o extrato de comissões.
 * - Cada charge paga de um cliente vinculado vira um lançamento (retido por 30 dias).
 * - Charges com reembolso/chargeback marcam o lançamento como estornado.
 * Best-effort: falhas são silenciosas para nunca derrubar a página.
 */
export async function syncStripeComissoes(parceiroId?: string) {
  const escopo = parceiroId || '__todos__'
  const ultima = ultimaSync.get(escopo) || 0
  if (Date.now() - ultima < SYNC_INTERVAL_MS) return
  ultimaSync.set(escopo, Date.now())

  const key = useRuntimeConfig().stripeSecretKey as string | undefined
  if (!key) return

  try {
    const stripe = new Stripe(key)
    const supabase = getServiceClient()

    let query = supabase
      .from('parceiro_empresas')
      .select('parceiro_id, empresa_id, comissao_percentual, valor_base_override, empresas ( customer_id )')
      .eq('ativo', true)
    if (parceiroId) query = query.eq('parceiro_id', parceiroId)
    const { data: vinculos } = await query

    for (const v of (vinculos || []) as any[]) {
      const customerId: string | null = v.empresas?.customer_id ?? null
      if (!customerId) continue

      try {
        const charges = await stripe.charges.list({ customer: customerId, limit: 36 })

        const { data: existentes } = await supabase
          .from('parceiro_comissao_pagamentos')
          .select('id, payment_ref, status')
          .eq('empresa_id', v.empresa_id)
          .eq('origem', 'stripe')
        const refsExistentes = new Set((existentes || []).map((e: any) => e.payment_ref))

        const inserts: Record<string, unknown>[] = []
        const refsEstornadas: string[] = []

        for (const ch of charges.data) {
          const estornada = ch.refunded || (ch.amount_refunded ?? 0) > 0 || ch.disputed
          if (estornada) refsEstornadas.push(ch.id)

          if (!ch.paid || ch.status !== 'succeeded' || !ch.amount) continue
          if (refsExistentes.has(ch.id)) continue

          const pagoEm = new Date(ch.created * 1000)
          const base = v.valor_base_override != null ? Number(v.valor_base_override) : ch.amount / 100
          const pct = Number(v.comissao_percentual) || 0
          inserts.push({
            parceiro_id: v.parceiro_id,
            empresa_id: v.empresa_id,
            origem: 'stripe',
            payment_ref: ch.id,
            valor_base: round2(base),
            comissao_percentual: pct,
            valor_comissao: round2((base * pct) / 100),
            pago_em: pagoEm.toISOString(),
            liberar_em: calcularLiberarEm(pagoEm).toISOString(),
            status: estornada ? 'estornado' : 'retido',
          })
        }

        if (inserts.length > 0) {
          await supabase.from('parceiro_comissao_pagamentos').insert(inserts)
        }

        if (refsEstornadas.length > 0) {
          await supabase
            .from('parceiro_comissao_pagamentos')
            .update({ status: 'estornado', updated_at: new Date().toISOString() })
            .eq('empresa_id', v.empresa_id)
            .eq('status', 'retido')
            .in('payment_ref', refsEstornadas)
        }
      } catch {
        // empresa com erro no Stripe não bloqueia as demais
      }
    }
  } catch {
    // sync é best-effort
  }
}
