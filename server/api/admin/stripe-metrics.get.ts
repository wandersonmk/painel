import Stripe from 'stripe'
import { requireSuperAdmin } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const config = useRuntimeConfig()
  const key = config.stripeSecretKey as string | undefined

  if (!key) {
    return {
      success: false,
      error: 'STRIPE_SECRET_KEY não configurada no servidor.',
    }
  }

  try {
    const stripe = new Stripe(key)

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfMonthTs = Math.floor(startOfMonth.getTime() / 1000)

    const [allPayments, subscriptions, balance, payouts, pendingTxns] = await Promise.all([
      stripe.paymentIntents.list({ created: { gte: startOfMonthTs }, limit: 100 }),
      stripe.subscriptions.list({ limit: 100, status: 'all' }),
      stripe.balance.retrieve(),
      stripe.payouts.list({ limit: 30 }),
      // "Em breve" = transações pendentes ainda não liberadas pelo Stripe
      stripe.balanceTransactions.list({ limit: 100, payout: undefined as any }),
    ])

    const succeeded = allPayments.data.filter(p => p.status === 'succeeded')
    const revenueThisMonth = succeeded.reduce((sum, p) => sum + p.amount, 0) / 100

    const activeCount = subscriptions.data.filter(s => s.status === 'active').length
    const pastDueCount = subscriptions.data.filter(s => s.status === 'past_due').length
    const trialingCount = subscriptions.data.filter(s => s.status === 'trialing').length
    const canceledCount = subscriptions.data.filter(s => s.status === 'canceled').length

    const pendingBalance = balance.pending.reduce((sum, b) => sum + b.amount, 0) / 100
    const availableBalance = balance.available.reduce((sum, b) => sum + b.amount, 0) / 100

    const recentPayments = succeeded.slice(0, 8).map(p => ({
      id: p.id,
      amount: p.amount / 100,
      currency: (p.currency || 'brl').toUpperCase(),
      created: p.created,
      customerId: typeof p.customer === 'string' ? p.customer : null,
    }))

    // todos pagamentos aprovados do mês — usado pelo gráfico de receita diária
    const monthlyPayments = succeeded.map(p => ({
      amount: p.amount / 100,
      created: p.created,
    }))

    const mapPayout = (p: Stripe.Payout) => ({
      id: p.id,
      amount: p.amount / 100,
      currency: (p.currency || 'brl').toUpperCase(),
      created: p.created,
      arrivalDate: p.arrival_date,
      status: p.status,
      method: p.method,
    })

    // Próximos repasses: ainda não chegaram na conta bancária
    const upcomingPayouts = payouts.data
      .filter(p => p.status === 'pending' || p.status === 'in_transit')
      .sort((a, b) => a.arrival_date - b.arrival_date)
      .map(mapPayout)

    // Repasses já pagos (chegaram na conta) — últimos 10
    const paidPayouts = payouts.data
      .filter(p => p.status === 'paid')
      .sort((a, b) => b.arrival_date - a.arrival_date)
      .slice(0, 10)
      .map(mapPayout)

    // "Em breve" — agrupa balance transactions pendentes (sem payout) por available_on.
    // Cada bucket é um repasse projetado que aparecerá quando o Stripe criar o Payout.
    const scheduledMap = new Map<number, number>()
    for (const t of pendingTxns.data) {
      if (t.status !== 'pending') continue
      if (t.type === 'payout' || t.type === 'payout_cancel' || t.type === 'payout_failure') continue
      // payout-related transactions are excluded; we want charges/refunds/fees that compose the future payout
      const key = t.available_on
      scheduledMap.set(key, (scheduledMap.get(key) || 0) + (t.net ?? (t.amount - (t.fee || 0))))
    }
    const scheduledPayouts = Array.from(scheduledMap.entries())
      .filter(([, net]) => net > 0)
      .sort(([a], [b]) => a - b)
      .map(([availableOn, netAmount], idx) => ({
        id: `scheduled-${availableOn}-${idx}`,
        amount: netAmount / 100,
        currency: 'BRL',
        created: availableOn,
        arrivalDate: availableOn,
        status: 'scheduled' as const,
        method: 'standard',
      }))

    return {
      success: true,
      data: {
        revenueThisMonth,
        paymentsCount: succeeded.length,
        activeSubscriptions: activeCount,
        pastDueSubscriptions: pastDueCount,
        trialingSubscriptions: trialingCount,
        canceledSubscriptions: canceledCount,
        pendingBalance,
        availableBalance,
        recentPayments,
        monthlyPayments,
        upcomingPayouts,
        scheduledPayouts,
        paidPayouts,
      },
    }
  } catch (err: any) {
    console.error('[stripe-metrics] error:', err)
    return {
      success: false,
      error: err?.message || 'Erro ao consultar Stripe',
    }
  }
})
