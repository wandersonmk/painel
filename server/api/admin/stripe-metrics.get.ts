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

    const nowTs = Math.floor(Date.now() / 1000)

    const [allPayments, subscriptions, balance, payouts, pendingTxns] = await Promise.all([
      stripe.paymentIntents.list({ created: { gte: startOfMonthTs }, limit: 100 }),
      stripe.subscriptions.list({ limit: 100, status: 'all' }),
      stripe.balance.retrieve(),
      stripe.payouts.list({ limit: 50 }),
      // Apenas transações cujo available_on é futuro (ainda não liberadas em saldo)
      stripe.balanceTransactions.list({ limit: 100, available_on: { gte: nowTs } }),
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

    // Projeções de repasses: agrupa balance transactions pendentes por available_on.
    // Filtramos available_on >= now, então só vêm transações ainda não liberadas.
    const scheduledMap = new Map<number, number>()
    for (const t of pendingTxns.data) {
      if (['payout', 'payout_cancel', 'payout_failure'].includes(t.type)) continue
      scheduledMap.set(t.available_on, (scheduledMap.get(t.available_on) || 0) + t.net)
    }

    // O saldo disponível (pode ser negativo por estorno/disputa) é abatido do
    // primeiro repasse projetado, exatamente como o Stripe exibe no dashboard.
    const sortedAvailableOn = Array.from(scheduledMap.keys()).sort((a, b) => a - b)
    const availableAmountCents = balance.available.reduce((sum, b) => sum + b.amount, 0)
    if (sortedAvailableOn.length > 0 && availableAmountCents !== 0) {
      const firstKey = sortedAvailableOn[0]
      scheduledMap.set(firstKey, (scheduledMap.get(firstKey) || 0) + availableAmountCents)
    }

    // Repasse chega no banco no próprio dia do available_on se for dia útil.
    // Se cair num sábado → próxima segunda (+2 dias). Domingo → segunda (+1 dia).
    const nextBusinessDay = (ts: number): number => {
      const d = new Date(ts * 1000)
      const dow = d.getUTCDay() // 0=Dom, 6=Sáb
      if (dow === 6) return ts + 2 * 24 * 60 * 60
      if (dow === 0) return ts + 1 * 24 * 60 * 60
      return ts
    }

    const scheduledPayouts = sortedAvailableOn
      .map((availableOn, idx) => ({
        id: `scheduled-${availableOn}-${idx}`,
        amount: (scheduledMap.get(availableOn) || 0) / 100,
        currency: 'BRL',
        created: availableOn,
        arrivalDate: nextBusinessDay(availableOn),
        status: 'scheduled' as const,
        method: 'standard',
      }))
      .filter(p => p.amount > 0)

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
