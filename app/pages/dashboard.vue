<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

definePageMeta({
  middleware: ['auth', 'super-admin'],
  layout: 'dashboard',
})

const { clientes, stats, loading: clientesLoading, loadClientes, diasParaVencimento } = useAdminClientes()

interface StripePayment {
  id: string
  amount: number
  currency: string
  created: number
  customerId: string | null
}
interface StripePayout {
  id: string
  amount: number
  currency: string
  created: number
  arrivalDate: number
  status: string
  method: string
}
interface StripeData {
  revenueThisMonth: number
  paymentsCount: number
  activeSubscriptions: number
  pastDueSubscriptions: number
  trialingSubscriptions: number
  canceledSubscriptions: number
  pendingBalance: number
  availableBalance: number
  recentPayments: StripePayment[]
  monthlyPayments: Array<{ amount: number; created: number }>
  upcomingPayouts: StripePayout[]
  scheduledPayouts: StripePayout[]
  paidPayouts: StripePayout[]
}

const { isDark } = useTheme()
const { hideValues, init: initHideValues, toggle: toggleHideValues, mask: maskValue } = useHideValues()

const stripeData = ref<StripeData | null>(null)
const stripeLoading = ref(false)
const stripeError = ref<string | null>(null)
const isRefreshing = ref(false)

async function loadStripeMetrics() {
  stripeLoading.value = true
  stripeError.value = null
  try {
    const headers = await useAdminAuthHeaders()
    const resp = await $fetch<{ success: boolean; data?: StripeData; error?: string }>(
      '/api/admin/stripe-metrics',
      { headers },
    )
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Erro ao carregar métricas Stripe')
    stripeData.value = resp.data
  } catch (err: any) {
    stripeError.value = err?.data?.error || err?.message || 'Erro ao carregar dados do Stripe'
  } finally {
    stripeLoading.value = false
  }
}

async function refreshAll() {
  isRefreshing.value = true
  await Promise.all([loadClientes(), loadStripeMetrics()])
  isRefreshing.value = false
}

onMounted(async () => {
  initHideValues()
  await Promise.all([loadClientes(), loadStripeMetrics()])
})

const novosHoje = computed(() => {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return clientes.value.filter(c => new Date(c.created_at) >= hoje).length
})

const novos7Dias = computed(() => {
  const limite = new Date()
  limite.setDate(limite.getDate() - 7)
  return clientes.value.filter(c => new Date(c.created_at) >= limite).length
})

const novos30Dias = computed(() => {
  const limite = new Date()
  limite.setDate(limite.getDate() - 30)
  return clientes.value.filter(c => new Date(c.created_at) >= limite).length
})

const clientesVencendoBreve = computed(() =>
  clientes.value
    .filter(c => {
      const d = diasParaVencimento(c)
      return d >= 0 && d <= 7
    })
    .slice(0, 6)
    .sort((a, b) => diasParaVencimento(a) - diasParaVencimento(b)),
)

const cadastrosRecentes = computed(() =>
  clientes.value
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8),
)

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function displayBRL(value: number) {
  return maskValue(formatBRL(value))
}

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function formatDateStr(s: string) {
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function formatArrivalDate(ts: number) {
  // Stripe arrival_date é uma data UTC; formatar em UTC para não voltar 1 dia em BR (UTC-3)
  return new Date(ts * 1000).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  })
}

function formatPhone(phone: string | null) {
  if (!phone) return '-'
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 13) return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  return phone
}

function getPlanBadge(plan: string) {
  const map: Record<string, { label: string; cls: string }> = {
    trial: { label: 'Trial', cls: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20' },
    free: { label: 'Gratuito', cls: 'bg-slate-100 dark:bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-500/20' },
    basic: { label: 'Básico', cls: 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20' },
    pro: { label: 'Pro', cls: 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-500/20' },
    enterprise: { label: 'Enterprise', cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' },
  }
  return map[plan] || { label: plan, cls: 'bg-slate-100 dark:bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-500/20' }
}

function getStatusDot(dias: number) {
  if (dias === 0) return 'bg-red-500'
  if (dias <= 3) return 'bg-purple-500'
  return 'bg-amber-500'
}

function getPayoutStatusLabel(status: string) {
  const m: Record<string, string> = {
    scheduled: 'Em breve',
    pending: 'Aguardando',
    in_transit: 'Em trânsito',
    paid: 'Pago',
    canceled: 'Cancelado',
    failed: 'Falhou',
  }
  return m[status] || status
}

function getPayoutStatusCls(status: string) {
  if (status === 'scheduled') return 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-500/20'
  if (status === 'pending') return 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
  if (status === 'in_transit') return 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20'
  if (status === 'paid') return 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
  if (status === 'failed' || status === 'canceled') return 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20'
  return 'bg-slate-100 dark:bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-500/20'
}

// Próximos repasses = oficiais (pending/in_transit) + projetados (scheduled).
const allUpcomingPayouts = computed<StripePayout[]>(() => {
  if (!stripeData.value) return []
  return [
    ...stripeData.value.upcomingPayouts,
    ...stripeData.value.scheduledPayouts,
  ].sort((a, b) => a.arrivalDate - b.arrivalDate)
})

const now = new Date()
const mesAtual = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

// reusable classes
const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
const cardHover = 'hover:bg-slate-50 dark:hover:bg-white/[0.07] transition-colors'

// ─────────────────────────── CHARTS (ApexCharts) ───────────────────────────
const baseChartOpts = computed(() => ({
  chart: {
    background: 'transparent',
    foreColor: isDark.value ? '#94a3b8' : '#64748b',
    toolbar: { show: false },
    fontFamily: 'inherit',
    animations: { enabled: true, easing: 'easeinout', speed: 400 },
  },
  theme: { mode: isDark.value ? 'dark' : 'light' as 'dark' | 'light' },
  grid: {
    borderColor: isDark.value ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    strokeDashArray: 4,
    padding: { left: 10, right: 10 },
  },
  tooltip: { theme: isDark.value ? 'dark' : 'light' },
  dataLabels: { enabled: false },
  legend: {
    position: 'bottom',
    fontSize: '12px',
    fontWeight: 500,
    labels: { colors: isDark.value ? '#cbd5e1' : '#475569' },
    markers: { width: 10, height: 10, radius: 3 },
    itemMargin: { horizontal: 8, vertical: 4 },
  },
}))

// Donut: distribuição de planos
const plansChartSeries = computed(() => [
  stats.value.clientesTrial,
  stats.value.clientesBasic,
  stats.value.clientesPro,
  stats.value.clientesEnterprise,
])
const plansChartOptions = computed(() => ({
  ...baseChartOpts.value,
  chart: { ...baseChartOpts.value.chart, type: 'donut' },
  labels: ['Trial', 'Básico', 'Pro', 'Enterprise'],
  colors: ['#f59e0b', '#3b82f6', '#9333ea', '#10b981'],
  stroke: { width: 0 },
  plotOptions: {
    pie: {
      donut: {
        size: '68%',
        labels: {
          show: true,
          name: { color: isDark.value ? '#94a3b8' : '#64748b', fontSize: '12px', fontWeight: 500 },
          value: { color: isDark.value ? '#fff' : '#0f172a', fontSize: '22px', fontWeight: 700 },
          total: {
            show: true,
            label: 'Total',
            color: isDark.value ? '#94a3b8' : '#64748b',
            formatter: () => String(stats.value.totalClientes),
          },
        },
      },
    },
  },
}))

// Donut: status das assinaturas Stripe
const statusChartSeries = computed(() => {
  if (!stripeData.value) return [0, 0, 0, 0]
  return [
    stripeData.value.activeSubscriptions,
    stripeData.value.trialingSubscriptions,
    stripeData.value.pastDueSubscriptions,
    stripeData.value.canceledSubscriptions,
  ]
})
const statusChartOptions = computed(() => ({
  ...baseChartOpts.value,
  chart: { ...baseChartOpts.value.chart, type: 'donut' },
  labels: ['Ativas', 'Trial', 'Inadimplentes', 'Canceladas'],
  colors: ['#10b981', '#f59e0b', '#ef4444', '#64748b'],
  stroke: { width: 0 },
  plotOptions: {
    pie: {
      donut: {
        size: '68%',
        labels: {
          show: true,
          name: { color: isDark.value ? '#94a3b8' : '#64748b', fontSize: '12px', fontWeight: 500 },
          value: { color: isDark.value ? '#fff' : '#0f172a', fontSize: '22px', fontWeight: 700 },
          total: {
            show: true,
            label: 'Total',
            color: isDark.value ? '#94a3b8' : '#64748b',
            formatter: () => {
              const arr = statusChartSeries.value
              return String(arr.reduce((s, v) => s + v, 0))
            },
          },
        },
      },
    },
  },
}))

// Bar: novos cadastros últimos 7 dias
const last7DaysSignups = computed(() => {
  const buckets: Array<{ label: string; count: number }> = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    const next = new Date(d.getTime() + 24 * 60 * 60 * 1000)
    const count = clientes.value.filter(c => {
      const created = new Date(c.created_at)
      return created >= d && created < next
    }).length
    buckets.push({
      label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      count,
    })
  }
  return buckets
})
const signupsChartSeries = computed(() => [
  { name: 'Novos clientes', data: last7DaysSignups.value.map(d => d.count) },
])
const signupsChartOptions = computed(() => ({
  ...baseChartOpts.value,
  chart: { ...baseChartOpts.value.chart, type: 'bar' },
  colors: ['#9333ea'],
  plotOptions: { bar: { borderRadius: 2, columnWidth: '55%', distributed: false } },
  xaxis: {
    categories: last7DaysSignups.value.map(d => d.label),
    labels: { style: { fontSize: '10px' } },
    axisBorder: { show: false },
    axisTicks: { show: false },
  },
  yaxis: {
    labels: { style: { fontSize: '10px' }, formatter: (v: number) => String(Math.floor(v)) },
    forceNiceScale: true,
  },
  fill: { type: 'gradient', gradient: { shade: 'light', type: 'vertical', gradientToColors: ['#a855f7'], opacityFrom: 1, opacityTo: 1 } },
  legend: { show: false },
}))

// Area: receita diária do mês
const monthDailyRevenue = computed(() => {
  if (!stripeData.value) return []
  const map = new Map<string, number>()
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  for (const d = new Date(firstOfMonth); d <= today; d.setDate(d.getDate() + 1)) {
    map.set(d.toISOString().slice(0, 10), 0)
  }
  for (const p of stripeData.value.monthlyPayments) {
    const d = new Date(p.created * 1000)
    d.setHours(0, 0, 0, 0)
    const key = d.toISOString().slice(0, 10)
    if (map.has(key)) map.set(key, (map.get(key) || 0) + p.amount)
  }
  return Array.from(map.entries()).map(([date, amount]) => ({
    label: new Date(date).toLocaleDateString('pt-BR', { day: '2-digit' }),
    amount,
  }))
})
const revenueChartSeries = computed(() => [
  { name: 'Receita', data: monthDailyRevenue.value.map(d => Number(d.amount.toFixed(2))) },
])
const revenueChartOptions = computed(() => ({
  ...baseChartOpts.value,
  chart: { ...baseChartOpts.value.chart, type: 'area' },
  stroke: { curve: 'smooth' as const, width: 2 },
  colors: ['#10b981'],
  fill: {
    type: 'gradient',
    gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 90, 100] },
  },
  xaxis: {
    categories: monthDailyRevenue.value.map(d => d.label),
    labels: { style: { fontSize: '10px' }, rotate: 0 },
    axisBorder: { show: false },
    axisTicks: { show: false },
    tickAmount: Math.min(10, monthDailyRevenue.value.length),
  },
  yaxis: {
    labels: { style: { fontSize: '10px' }, formatter: (v: number) => `R$ ${v.toFixed(0)}` },
  },
  tooltip: {
    theme: isDark.value ? 'dark' : 'light',
    y: { formatter: (v: number) => maskValue(formatBRL(v)) },
  },
  legend: { show: false },
  markers: { size: 0, hover: { size: 5 } },
}))
</script>

<template>
  <div class="p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8 max-w-[1400px] mx-auto w-full">

    <!-- Page Header -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
      <div>
        <h1 class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Dashboard</h1>
        <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5 capitalize">{{ mesAtual }} · visão geral do negócio</p>
      </div>
      <div class="flex items-center gap-2 w-full sm:w-auto">
        <!-- Olho: ocultar/mostrar valores -->
        <button
          @click="toggleHideValues"
          class="shrink-0 w-10 h-10 sm:w-auto sm:px-3 sm:h-10 inline-flex items-center justify-center gap-2 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.08] transition-colors"
          :title="hideValues ? 'Mostrar valores' : 'Ocultar valores'"
          :aria-label="hideValues ? 'Mostrar valores' : 'Ocultar valores'"
          type="button"
        >
          <i class="fa-solid text-sm" :class="hideValues ? 'fa-eye-slash' : 'fa-eye'" aria-hidden="true" />
          <span class="hidden sm:inline text-xs font-medium">{{ hideValues ? 'Mostrar' : 'Ocultar' }}</span>
        </button>
        <button
          @click="refreshAll"
          :disabled="isRefreshing || clientesLoading || stripeLoading"
          class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm font-semibold transition-all duration-150 shadow-lg shadow-purple-600/30 dark:shadow-purple-600/20"
          type="button"
        >
          <i class="fa-solid fa-arrows-rotate text-sm" :class="{ 'animate-spin': isRefreshing }" aria-hidden="true" />
          <span>Atualizar</span>
        </button>
      </div>
    </div>

    <!-- ────────────────────────────── STRIPE METRICS ────────────────────────────── -->
    <section>
      <div class="flex items-center gap-2 mb-4">
        <div class="w-4 h-4 rounded flex items-center justify-center bg-[#635BFF]/20">
          <i class="fa-brands fa-stripe-s text-[#635BFF] text-xs" aria-hidden="true" />
        </div>
        <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Stripe · Financeiro</h2>
      </div>

      <div v-if="stripeLoading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div v-for="i in 4" :key="i" class="h-24 rounded-xl bg-slate-100 dark:bg-white/5 animate-pulse border border-slate-200 dark:border-white/5" />
      </div>

      <div v-else-if="stripeError" class="p-4 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
        <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
        <span>{{ stripeError }}</span>
      </div>

      <div v-else-if="stripeData" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Receita este mês"
          :unit="`${stripeData.paymentsCount} aprovados`"
          icon="fa-solid fa-arrow-trend-up"
          color="emerald"
        >
          {{ displayBRL(stripeData.revenueThisMonth) }}
        </KpiCard>

        <KpiCard
          label="Assinaturas ativas"
          :value="stripeData.activeSubscriptions"
          :unit="stripeData.trialingSubscriptions
            ? `${stripeData.trialingSubscriptions} trial · ${stripeData.canceledSubscriptions} canc.`
            : `${stripeData.canceledSubscriptions} canceladas`"
          icon="fa-solid fa-repeat"
          color="purple"
        />

        <KpiCard
          label="Inadimplentes"
          :value="stripeData.pastDueSubscriptions"
          unit="em atraso"
          icon="fa-solid fa-clock-rotate-left"
          color="rose"
        />

        <KpiCard
          label="Saldo pendente"
          :unit="`${displayBRL(stripeData.availableBalance)} disponível`"
          icon="fa-solid fa-wallet"
          color="amber"
        >
          {{ displayBRL(stripeData.pendingBalance) }}
        </KpiCard>
      </div>
    </section>

    <!-- ────────────────────────────── PRÓXIMOS REPASSES ────────────────────────────── -->
    <section v-if="stripeData">
      <div class="flex items-center gap-2 mb-4">
        <div class="w-4 h-4 rounded flex items-center justify-center bg-amber-500/20">
          <i class="fa-solid fa-hourglass-half text-amber-600 dark:text-amber-400 text-xs" aria-hidden="true" />
        </div>
        <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Próximos Repasses · Stripe</h2>
        <span
          v-if="allUpcomingPayouts.length > 0"
          class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20"
        >{{ allUpcomingPayouts.length }}</span>
      </div>

      <div :class="['overflow-hidden', cardBase]">
        <div v-if="allUpcomingPayouts.length === 0" class="px-5 py-10 text-center">
          <i class="fa-solid fa-money-check-dollar text-slate-300 dark:text-slate-700 text-2xl mb-2 block" aria-hidden="true" />
          <p class="text-slate-500 text-sm">Nenhum repasse programado no momento</p>
          <p class="text-slate-400 dark:text-slate-600 text-xs mt-1">Quando o Stripe agendar um repasse, ele aparece aqui.</p>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200 dark:border-white/5 bg-slate-50/60 dark:bg-white/[0.02]">
                <th class="text-left px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Data prevista</th>
                <th class="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Método</th>
                <th class="text-right px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Valor</th>
                <th class="text-center px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-white/5">
              <tr
                v-for="payout in allUpcomingPayouts"
                :key="payout.id"
                class="hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors"
              >
                <td class="px-3 sm:px-5 py-3">
                  <div class="flex items-center gap-2">
                    <i class="fa-solid fa-calendar-day text-amber-500 text-xs shrink-0" aria-hidden="true" />
                    <span class="text-slate-800 dark:text-slate-200 font-medium capitalize text-xs sm:text-sm whitespace-nowrap">{{ formatArrivalDate(payout.arrivalDate) }}</span>
                  </div>
                </td>
                <td class="hidden md:table-cell px-5 py-3">
                  <span class="text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wider">{{ payout.method }}</span>
                </td>
                <td class="px-3 sm:px-5 py-3 text-right">
                  <span class="font-semibold text-slate-900 dark:text-white tabular-nums text-xs sm:text-sm whitespace-nowrap">{{ displayBRL(payout.amount) }}</span>
                </td>
                <td class="px-3 sm:px-5 py-3 text-center">
                  <span
                    class="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium border whitespace-nowrap"
                    :class="getPayoutStatusCls(payout.status)"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
                    {{ getPayoutStatusLabel(payout.status) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ────────────────────────────── REPASSES PAGOS ────────────────────────────── -->
    <section v-if="stripeData && stripeData.paidPayouts.length > 0">
      <div class="flex items-center gap-2 mb-4">
        <div class="w-4 h-4 rounded flex items-center justify-center bg-emerald-500/20">
          <i class="fa-solid fa-circle-check text-emerald-600 dark:text-emerald-400 text-xs" aria-hidden="true" />
        </div>
        <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Repasses Já Pagos · Stripe</h2>
        <span
          class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20"
        >{{ stripeData.paidPayouts.length }}</span>
      </div>

      <div :class="['overflow-hidden', cardBase]">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200 dark:border-white/5 bg-slate-50/60 dark:bg-white/[0.02]">
                <th class="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Iniciado em</th>
                <th class="hidden lg:table-cell text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Método</th>
                <th class="text-right px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Valor</th>
                <th class="text-left px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Chegar até</th>
                <th class="hidden sm:table-cell text-center px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-white/5">
              <tr
                v-for="payout in stripeData.paidPayouts"
                :key="payout.id"
                class="hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors"
              >
                <td class="hidden md:table-cell px-5 py-3">
                  <div class="flex items-center gap-2">
                    <i class="fa-solid fa-calendar-day text-slate-400 text-xs" aria-hidden="true" />
                    <span class="text-slate-700 dark:text-slate-300 capitalize">{{ formatArrivalDate(payout.created) }}</span>
                  </div>
                </td>
                <td class="hidden lg:table-cell px-5 py-3">
                  <span class="text-slate-600 dark:text-slate-400 text-xs uppercase tracking-wider">{{ payout.method }}</span>
                </td>
                <td class="px-3 sm:px-5 py-3 text-right">
                  <span class="font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums text-xs sm:text-sm whitespace-nowrap">{{ displayBRL(payout.amount) }}</span>
                </td>
                <td class="px-3 sm:px-5 py-3">
                  <div class="flex items-center gap-2">
                    <i class="fa-solid fa-calendar-check text-emerald-500 text-xs shrink-0" aria-hidden="true" />
                    <span class="text-slate-800 dark:text-slate-200 font-medium capitalize text-xs sm:text-sm whitespace-nowrap">{{ formatArrivalDate(payout.arrivalDate) }}</span>
                  </div>
                </td>
                <td class="hidden sm:table-cell px-5 py-3 text-center">
                  <span
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap"
                    :class="getPayoutStatusCls(payout.status)"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
                    {{ getPayoutStatusLabel(payout.status) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ────────────────────────────── CLIENT METRICS ────────────────────────────── -->
    <section>
      <div class="flex items-center gap-2 mb-4">
        <div class="w-4 h-4 rounded flex items-center justify-center bg-blue-500/20">
          <i class="fa-solid fa-users text-blue-600 dark:text-blue-400 text-xs" aria-hidden="true" />
        </div>
        <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Clientes · Métricas</h2>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total"
          :value="stats.totalClientes"
          :unit="`${stats.clientesAtivos} ativos`"
          icon="fa-solid fa-database"
          color="indigo"
          :loading="clientesLoading"
          loading-width="w-12"
        />

        <KpiCard
          label="Novos hoje"
          :value="novosHoje"
          unit="cadastros hoje"
          icon="fa-solid fa-user-plus"
          color="emerald"
          :loading="clientesLoading"
          loading-width="w-8"
        />

        <KpiCard
          label="Últimos 7 dias"
          :value="novos7Dias"
          unit="novos na semana"
          icon="fa-solid fa-chart-line"
          color="blue"
          :loading="clientesLoading"
          loading-width="w-8"
        />

        <KpiCard
          label="Últimos 30 dias"
          :value="novos30Dias"
          unit="novos no mês"
          icon="fa-solid fa-calendar-check"
          color="violet"
          :loading="clientesLoading"
          loading-width="w-8"
        />
      </div>

      <!-- Plans breakdown -->
      <div class="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div
          v-for="item in [
            { label: 'Trial', value: stats.clientesTrial, cls: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/15' },
            { label: 'Básico', value: stats.clientesBasic, cls: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/15' },
            { label: 'Pro', value: stats.clientesPro, cls: 'text-purple-700 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/15' },
            { label: 'Enterprise', value: stats.clientesEnterprise, cls: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/15' },
          ]"
          :key="item.label"
          class="rounded border px-4 py-3 flex items-center justify-between"
          :class="item.bg"
        >
          <span class="text-sm font-medium text-slate-700 dark:text-slate-300">{{ item.label }}</span>
          <span class="text-lg font-bold tabular-nums" :class="item.cls">
            <span v-if="clientesLoading" class="inline-block w-6 h-5 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
            <span v-else>{{ item.value }}</span>
          </span>
        </div>
      </div>
    </section>

    <!-- ────────────────────────────── CHARTS ────────────────────────────── -->
    <section>
      <div class="flex items-center gap-2 mb-4">
        <div class="w-4 h-4 rounded flex items-center justify-center bg-purple-600/20">
          <i class="fa-solid fa-chart-pie text-purple-700 dark:text-purple-400 text-xs" aria-hidden="true" />
        </div>
        <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Análise Visual</h2>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Donut: Distribuição de Planos -->
        <div :class="['p-5', cardBase]">
          <div class="flex items-center justify-between mb-1">
            <div>
              <h3 class="text-sm font-semibold text-slate-800 dark:text-white">Distribuição de Planos</h3>
              <p class="text-xs text-slate-500 mt-0.5">Clientes por tipo de assinatura</p>
            </div>
            <div class="w-8 h-8 rounded bg-purple-100 dark:bg-purple-500/15 flex items-center justify-center">
              <i class="fa-solid fa-layer-group text-purple-700 dark:text-purple-400 text-sm" aria-hidden="true" />
            </div>
          </div>
          <ClientOnly>
            <apexchart
              type="donut"
              :options="plansChartOptions"
              :series="plansChartSeries"
              height="290"
              width="100%"
            />
            <template #fallback>
              <div class="h-[290px] flex items-center justify-center text-slate-400 text-xs animate-pulse">Carregando gráfico…</div>
            </template>
          </ClientOnly>
        </div>

        <!-- Donut: Status das Assinaturas Stripe -->
        <div :class="['p-5', cardBase]">
          <div class="flex items-center justify-between mb-1">
            <div>
              <h3 class="text-sm font-semibold text-slate-800 dark:text-white">Status das Assinaturas</h3>
              <p class="text-xs text-slate-500 mt-0.5">Dados em tempo real do Stripe</p>
            </div>
            <div class="w-8 h-8 rounded bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center">
              <i class="fa-solid fa-circle-nodes text-emerald-600 dark:text-emerald-400 text-sm" aria-hidden="true" />
            </div>
          </div>
          <ClientOnly>
            <apexchart
              v-if="stripeData"
              type="donut"
              :options="statusChartOptions"
              :series="statusChartSeries"
              height="290"
              width="100%"
            />
            <div v-else class="h-[290px] flex items-center justify-center text-slate-400 text-xs">
              {{ stripeError ? 'Stripe indisponível' : 'Carregando…' }}
            </div>
            <template #fallback>
              <div class="h-[290px] flex items-center justify-center text-slate-400 text-xs animate-pulse">Carregando gráfico…</div>
            </template>
          </ClientOnly>
        </div>

        <!-- Bar: Novos Cadastros (7 dias) -->
        <div :class="['p-5', cardBase]">
          <div class="flex items-center justify-between mb-1">
            <div>
              <h3 class="text-sm font-semibold text-slate-800 dark:text-white">Novos Cadastros</h3>
              <p class="text-xs text-slate-500 mt-0.5">Últimos 7 dias · {{ novos7Dias }} no total</p>
            </div>
            <div class="w-8 h-8 rounded bg-blue-100 dark:bg-blue-500/15 flex items-center justify-center">
              <i class="fa-solid fa-chart-column text-blue-600 dark:text-blue-400 text-sm" aria-hidden="true" />
            </div>
          </div>
          <ClientOnly>
            <apexchart
              type="bar"
              :options="signupsChartOptions"
              :series="signupsChartSeries"
              height="290"
              width="100%"
            />
            <template #fallback>
              <div class="h-[290px] flex items-center justify-center text-slate-400 text-xs animate-pulse">Carregando gráfico…</div>
            </template>
          </ClientOnly>
        </div>

        <!-- Area: Receita do Mês -->
        <div :class="['p-5', cardBase]">
          <div class="flex items-center justify-between mb-1">
            <div>
              <h3 class="text-sm font-semibold text-slate-800 dark:text-white">Receita do Mês</h3>
              <p class="text-xs text-slate-500 mt-0.5">{{ stripeData ? displayBRL(stripeData.revenueThisMonth) : 'Carregando…' }} acumulado</p>
            </div>
            <div class="w-8 h-8 rounded bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center">
              <i class="fa-solid fa-chart-area text-emerald-600 dark:text-emerald-400 text-sm" aria-hidden="true" />
            </div>
          </div>
          <ClientOnly>
            <apexchart
              v-if="stripeData"
              type="area"
              :options="revenueChartOptions"
              :series="revenueChartSeries"
              height="290"
              width="100%"
            />
            <div v-else class="h-[290px] flex items-center justify-center text-slate-400 text-xs">
              {{ stripeError ? 'Stripe indisponível' : 'Carregando…' }}
            </div>
            <template #fallback>
              <div class="h-[290px] flex items-center justify-center text-slate-400 text-xs animate-pulse">Carregando gráfico…</div>
            </template>
          </ClientOnly>
        </div>
      </div>
    </section>

    <!-- ────────────────────────────── BENTO GRID ────────────────────────────── -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

      <!-- Cadastros Recentes -->
      <section :class="['overflow-hidden', cardBase]">
        <div class="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-user-clock text-purple-700 dark:text-purple-400 text-sm" aria-hidden="true" />
            <h3 class="text-sm font-semibold text-slate-800 dark:text-white">Cadastros Recentes</h3>
          </div>
          <NuxtLink to="/admin" class="text-xs text-slate-500 hover:text-purple-700 dark:hover:text-purple-400 transition-colors font-medium">
            Ver todos →
          </NuxtLink>
        </div>

        <div v-if="clientesLoading" class="p-5 space-y-3">
          <div v-for="i in 5" :key="i" class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 animate-pulse shrink-0" />
            <div class="flex-1 space-y-1.5">
              <div class="h-3 bg-slate-100 dark:bg-white/5 rounded animate-pulse w-2/3" />
              <div class="h-2.5 bg-slate-100 dark:bg-white/5 rounded animate-pulse w-1/3" />
            </div>
          </div>
        </div>

        <div v-else class="divide-y divide-slate-100 dark:divide-white/5">
          <div
            v-for="c in cadastrosRecentes"
            :key="c.id"
            class="px-4 sm:px-5 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
          >
            <div class="w-8 h-8 rounded bg-purple-100 dark:bg-purple-500/15 border border-purple-200 dark:border-purple-500/20 flex items-center justify-center shrink-0">
              <span class="text-purple-700 dark:text-purple-400 text-xs font-bold">{{ c.nome.charAt(0).toUpperCase() }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-slate-800 dark:text-white truncate">{{ c.nome }}</p>
              <div class="flex items-center gap-2 mt-0.5">
                <i class="fa-solid fa-phone text-slate-400 dark:text-slate-600 text-[10px]" aria-hidden="true" />
                <span class="text-xs text-slate-500 font-mono">{{ formatPhone(c.whatsapp) }}</span>
              </div>
            </div>
            <div class="flex flex-col items-end gap-1 shrink-0">
              <span
                class="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                :class="getPlanBadge(c.subscription_plan).cls"
              >{{ getPlanBadge(c.subscription_plan).label }}</span>
              <span class="text-[10px] text-slate-400 dark:text-slate-600">{{ formatDateStr(c.created_at) }}</span>
            </div>
          </div>

          <div v-if="cadastrosRecentes.length === 0" class="px-5 py-10 text-center text-slate-500 dark:text-slate-600 text-sm">
            Nenhum cadastro encontrado
          </div>
        </div>
      </section>

      <!-- Vencendo em breve -->
      <section :class="['overflow-hidden', cardBase]">
        <div class="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-bell text-amber-600 dark:text-amber-400 text-sm" aria-hidden="true" />
            <h3 class="text-sm font-semibold text-slate-800 dark:text-white">Vencendo nos próximos 7 dias</h3>
          </div>
          <span
            v-if="clientesVencendoBreve.length > 0"
            class="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20"
          >{{ clientesVencendoBreve.length }}</span>
        </div>

        <div v-if="clientesLoading" class="p-5 space-y-3">
          <div v-for="i in 4" :key="i" class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 animate-pulse shrink-0" />
            <div class="flex-1 space-y-1.5">
              <div class="h-3 bg-slate-100 dark:bg-white/5 rounded animate-pulse w-2/3" />
              <div class="h-2.5 bg-slate-100 dark:bg-white/5 rounded animate-pulse w-1/2" />
            </div>
          </div>
        </div>

        <div v-else class="divide-y divide-slate-100 dark:divide-white/5">
          <div
            v-for="c in clientesVencendoBreve"
            :key="c.id"
            class="px-4 sm:px-5 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
          >
            <div class="relative shrink-0">
              <div class="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 flex items-center justify-center">
                <span class="text-amber-700 dark:text-amber-400 text-xs font-bold">{{ c.nome.charAt(0).toUpperCase() }}</span>
              </div>
              <div
                class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-950"
                :class="getStatusDot(diasParaVencimento(c))"
              />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-slate-800 dark:text-white truncate">{{ c.nome }}</p>
              <p class="text-xs text-slate-500 mt-0.5 font-mono">{{ formatPhone(c.whatsapp) }}</p>
            </div>
            <div class="shrink-0 text-right">
              <span
                class="text-xs font-bold"
                :class="diasParaVencimento(c) === 0 ? 'text-red-600 dark:text-red-400' : diasParaVencimento(c) <= 3 ? 'text-purple-700 dark:text-purple-400' : 'text-amber-600 dark:text-amber-400'"
              >
                {{ diasParaVencimento(c) === 0 ? 'Vence hoje' : `${diasParaVencimento(c)}d` }}
              </span>
              <p class="text-[10px] text-slate-400 dark:text-slate-600 mt-0.5">{{ c.subscription_plan }}</p>
            </div>
          </div>

          <div v-if="clientesVencendoBreve.length === 0" class="px-5 py-10 text-center">
            <i class="fa-solid fa-circle-check text-emerald-500/50 text-2xl mb-2 block" aria-hidden="true" />
            <p class="text-slate-500 dark:text-slate-600 text-sm">Nenhum cliente vencendo em breve</p>
          </div>
        </div>
      </section>
    </div>

    <!-- ────────────────────────────── RECENT PAYMENTS ────────────────────────────── -->
    <section v-if="stripeData && stripeData.recentPayments.length > 0">
      <div class="flex items-center gap-2 mb-4">
        <div class="w-4 h-4 rounded flex items-center justify-center bg-emerald-500/20">
          <i class="fa-solid fa-receipt text-emerald-600 dark:text-emerald-400 text-xs" aria-hidden="true" />
        </div>
        <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pagamentos Recentes · Stripe</h2>
      </div>

      <div :class="['overflow-hidden', cardBase]">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200 dark:border-white/5 bg-slate-50/60 dark:bg-white/[0.02]">
                <th class="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">ID</th>
                <th class="text-left px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Data</th>
                <th class="text-right px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Valor</th>
                <th class="hidden sm:table-cell text-center px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-white/5">
              <tr
                v-for="payment in stripeData.recentPayments"
                :key="payment.id"
                class="hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors"
              >
                <td class="hidden md:table-cell px-5 py-3">
                  <span class="text-slate-500 dark:text-slate-500 font-mono text-xs">{{ payment.id.slice(0, 16) }}…</span>
                </td>
                <td class="px-3 sm:px-5 py-3 text-slate-600 dark:text-slate-400 text-xs sm:text-sm whitespace-nowrap">{{ formatDate(payment.created) }}</td>
                <td class="px-3 sm:px-5 py-3 text-right">
                  <span class="font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums text-xs sm:text-sm whitespace-nowrap">{{ displayBRL(payment.amount) }}</span>
                </td>
                <td class="hidden sm:table-cell px-5 py-3 text-center">
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" aria-hidden="true" />
                    Aprovado
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Vencidos alert -->
    <section v-if="!clientesLoading && stats.clientesVencidos > 0">
      <div class="rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-5 flex items-center gap-4">
        <div class="w-10 h-10 rounded bg-red-100 dark:bg-red-500/20 flex items-center justify-center shrink-0">
          <i class="fa-solid fa-triangle-exclamation text-red-600 dark:text-red-400" aria-hidden="true" />
        </div>
        <div class="flex-1">
          <p class="text-sm font-semibold text-red-700 dark:text-red-300">{{ stats.clientesVencidos }} cliente{{ stats.clientesVencidos > 1 ? 's' : '' }} com assinatura vencida</p>
          <p class="text-xs text-red-600 dark:text-red-500 mt-0.5">Acesse a página de clientes para renovar ou gerenciar.</p>
        </div>
        <NuxtLink
          to="/admin"
          class="shrink-0 px-3 py-1.5 bg-red-100 dark:bg-red-500/20 hover:bg-red-200 dark:hover:bg-red-500/30 text-red-700 dark:text-red-300 text-sm font-medium rounded transition-colors"
        >
          Gerenciar
        </NuxtLink>
      </div>
    </section>

  </div>
</template>
