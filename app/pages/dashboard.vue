<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

definePageMeta({
  middleware: ['auth', 'super-admin'],
  layout: 'dashboard',
})

const {
  clientes, stats, loading: clientesLoading, error: clientesError,
  loadClientes, diasParaVencimento, isVencido, valorMensalEquivalente, pagaParceiro,
} = useAdminClientes()

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

// Enquanto o dado não chegou (ou falhou), os cartões mostram "—", nunca zero.
const clientesPronto = computed(() => clientes.value.length > 0 || (!clientesLoading.value && !clientesError.value))
const stripePronto = computed(() => !!stripeData.value && !stripeError.value)
const avisoStripe = computed(() => (stripeError.value ? 'Stripe indisponível' : 'Carregando…'))
const avisoClientes = computed(() => (clientesError.value ? 'Clientes indisponíveis' : 'Carregando…'))

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

// Vencendo nos próximos 7 dias: ordena ANTES de cortar (antes cortava os 6
// primeiros da lista e só depois ordenava). O selo mostra o total real.
const vencendoBreveTodos = computed(() =>
  clientes.value
    .filter(c => {
      const d = diasParaVencimento(c)
      return d >= 0 && d <= 7
    })
    .sort((a, b) => diasParaVencimento(a) - diasParaVencimento(b)),
)
const clientesVencendoBreve = computed(() => vencendoBreveTodos.value.slice(0, 6))

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

function fmtPhone(phone: string | null) {
  return formatPhone(phone) ?? '-'
}

function getPlanBadge(plan: string) {
  const map: Record<string, { label: string; cls: string }> = {
    trial: { label: 'Trial', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' },
    free: { label: 'Gratuito', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
    basic: { label: 'Básico', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' },
    pro: { label: 'Pro', cls: 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300' },
    enterprise: { label: 'Enterprise', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
  }
  return map[plan] || { label: plan, cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' }
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
  if (status === 'scheduled') return 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300'
  if (status === 'pending') return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
  if (status === 'in_transit') return 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
  if (status === 'paid') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
  if (status === 'failed' || status === 'canceled') return 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
}

const allUpcomingPayouts = computed<StripePayout[]>(() => {
  if (!stripeData.value) return []
  const real = stripeData.value.upcomingPayouts
  // Exclui projeções que já têm um payout real correspondente (mesma janela de ±3 dias)
  const scheduled = (stripeData.value.scheduledPayouts || []).filter(s =>
    !real.some(r => Math.abs(r.arrivalDate - s.arrivalDate) <= 3 * 24 * 60 * 60)
  )
  return [...real, ...scheduled].sort((a, b) => a.arrivalDate - b.arrivalDate)
})

const now = new Date()
const mesAtual = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

// ─────────────── Cartões de resumo (redesenho 09/10/2026) ───────────────
// Mesmo estilo dos cartões da página Clientes (AdminResumoCard). Cada número
// é o mesmo que o Dashboard já mostrava, só reorganizado.

// Mensalidades cadastradas (veio da página Clientes, pedido do dono): o valor
// gravado em cada cliente (plano de 12 meses entra como anual ÷ 12), NÃO o que
// entrou no caixa. Separado por quem recebe: cliente de parceiro paga o
// PARCEIRO (que compra crédito da Agzap), salvo vínculo marcado como "cobrado
// pela Agzap", que entra em "Pagam a Agzap".
const mensalidades = computed(() => {
  const pagantes = clientes.value.filter(c =>
    !isVencido(c) && c.subscription_status === 'active' && c.ativo
    && c.role !== 'superAdmin' && valorMensalEquivalente(c) > 0)
  const pagamParceiro = pagantes.filter(c => pagaParceiro(c))
  const pagamAgzap = pagantes.filter(c => !pagaParceiro(c))
  const soma = (l: typeof pagantes) => l.reduce((s, c) => s + valorMensalEquivalente(c), 0)
  return {
    pagantes: pagantes.length,
    total: soma(pagantes),
    agzap: soma(pagamAgzap),
    agzapQtd: pagamAgzap.length,
    deParceiroCobradosAgzap: pagamAgzap.filter(c => !!c.parceiro_nome).length,
    parceiro: soma(pagamParceiro),
    parceiroQtd: pagamParceiro.length,
    anuais: pagantes.filter(c => c.subscription_period === '12months').length,
  }
})

const cardReceita = computed(() => {
  const s = stripeData.value
  return {
    principal: s ? displayBRL(s.revenueThisMonth) : '',
    principalDetalhe: s ? `${plural(s.paymentsCount, 'pagamento aprovado', 'pagamentos aprovados')} no Stripe` : '',
    tiles: [
      { label: 'Saldo pendente', icon: 'fa-hourglass-half', iconCls: 'text-amber-500', valor: s ? displayBRL(s.pendingBalance) : '', detalhe: 'ainda não liberado' },
      { label: 'Disponível', icon: 'fa-wallet', iconCls: 'text-emerald-500', valor: s ? displayBRL(s.availableBalance) : '', detalhe: 'liberado no Stripe' },
    ],
  }
})

const cardAssinaturas = computed(() => {
  const s = stripeData.value
  return {
    principal: s ? String(s.activeSubscriptions) : '',
    principalDetalhe: s ? plural(s.canceledSubscriptions, 'cancelada', 'canceladas') : '',
    tiles: [
      { label: 'Inadimplentes', icon: 'fa-clock-rotate-left', iconCls: 'text-rose-500', valor: s ? String(s.pastDueSubscriptions) : '', detalhe: 'em atraso' },
      { label: 'Em teste', icon: 'fa-flask', iconCls: 'text-amber-500', valor: s ? String(s.trialingSubscriptions) : '', detalhe: 'trial no Stripe' },
    ],
  }
})

const cardMensalidades = computed(() => {
  const m = mensalidades.value
  return {
    principalLabel: `Soma por mês · ${plural(m.pagantes, 'assinatura ativa', 'assinaturas ativas')}`,
    principal: maskValue(formatBRL(m.total)),
    principalDetalhe: m.anuais
      ? `${plural(m.anuais, 'plano anual entra', 'planos anuais entram')} como valor ÷ 12`
      : 'Valor cadastrado em cada cliente',
    tiles: [
      {
        label: 'Pagam a Agzap',
        icon: 'fa-building',
        iconCls: 'text-emerald-500',
        valor: maskValue(formatBRL(m.agzap)),
        detalhe: plural(m.agzapQtd, 'cliente', 'clientes')
          + (m.deParceiroCobradosAgzap ? ` · ${m.deParceiroCobradosAgzap} de parceiro` : ''),
      },
      {
        label: 'Pagam o parceiro',
        icon: 'fa-handshake',
        iconCls: 'text-purple-500',
        valor: maskValue(formatBRL(m.parceiro)),
        detalhe: plural(m.parceiroQtd, 'cliente', 'clientes'),
      },
    ],
  }
})

const cardClientes = computed(() => ({
  principal: String(stats.value.totalClientes),
  principalDetalhe: `${stats.value.clientesAtivos} com conta ativa`,
  tiles: [
    { label: 'Trial', icon: 'fa-circle', iconCls: 'text-amber-500', valor: String(stats.value.clientesTrial) },
    { label: 'Básico', icon: 'fa-circle', iconCls: 'text-blue-500', valor: String(stats.value.clientesBasic) },
    { label: 'Pro', icon: 'fa-circle', iconCls: 'text-purple-500', valor: String(stats.value.clientesPro) },
    { label: 'Enterprise', icon: 'fa-circle', iconCls: 'text-emerald-500', valor: String(stats.value.clientesEnterprise) },
  ],
}))

const cardNovos = computed(() => ({
  principal: String(novos30Dias.value),
  tiles: [
    { label: 'Hoje', icon: 'fa-user-plus', iconCls: 'text-emerald-500', valor: String(novosHoje.value), detalhe: 'cadastros hoje' },
    { label: 'Últimos 7 dias', icon: 'fa-chart-line', iconCls: 'text-blue-500', valor: String(novos7Dias.value), detalhe: 'novos na semana' },
  ],
}))

// Painéis (gráficos, listas e tabelas) no mesmo visual da página Clientes.
const painel = 'rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 shadow-sm'
const th = 'py-3 text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider'

// ─────────────────────────── CHARTS (ApexCharts) ───────────────────────────
const baseChartOpts = computed(() => ({
  chart: {
    background: 'transparent',
    foreColor: isDark.value ? '#a39dba' : '#645e7d',
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
          name: { color: isDark.value ? '#a39dba' : '#645e7d', fontSize: '12px', fontWeight: 500 },
          value: { color: isDark.value ? '#fff' : '#1b1827', fontSize: '22px', fontWeight: 600 },
          total: {
            show: true,
            label: 'Total',
            color: isDark.value ? '#a39dba' : '#645e7d',
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
  colors: ['#10b981', '#f59e0b', '#ef4444', '#645e7d'],
  stroke: { width: 0 },
  plotOptions: {
    pie: {
      donut: {
        size: '68%',
        labels: {
          show: true,
          name: { color: isDark.value ? '#a39dba' : '#645e7d', fontSize: '12px', fontWeight: 500 },
          value: { color: isDark.value ? '#fff' : '#1b1827', fontSize: '22px', fontWeight: 600 },
          total: {
            show: true,
            label: 'Total',
            color: isDark.value ? '#a39dba' : '#645e7d',
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
  colors: ['#8b5cf6'],
  plotOptions: { bar: { borderRadius: 4, columnWidth: '55%', distributed: false } },
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
    labels: { style: { fontSize: '10px' }, formatter: (v: number) => (hideValues.value ? 'R$ •••' : `R$ ${v.toFixed(0)}`) },
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
  <!-- Mesmo respiro de topo da página Clientes (09/10/2026). -->
  <div class="px-4 pt-3 pb-6 sm:px-6 md:px-10 md:pt-4 md:pb-8">
    <div class="max-w-[1400px] mx-auto w-full space-y-5">

      <!-- Cabeçalho -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 class="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white">Dashboard</h1>
          <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5 first-letter:uppercase">{{ mesAtual }} · visão geral do negócio</p>
        </div>
        <div class="flex items-center gap-2 w-full sm:w-auto">
          <!-- Olho: ocultar/mostrar valores -->
          <button
            @click="toggleHideValues"
            class="shrink-0 w-9 h-9 sm:w-auto sm:px-3 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
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
            class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 h-9 px-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            type="button"
          >
            <i class="fa-solid fa-arrows-rotate text-sm" :class="{ 'animate-spin': isRefreshing }" aria-hidden="true" />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      <!-- ─────────────── FINANCEIRO ─────────────── -->
      <section aria-labelledby="sec-financeiro" class="space-y-2">
        <h2 id="sec-financeiro" class="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <i class="fa-brands fa-stripe-s text-[#635BFF]" aria-hidden="true" />
          Financeiro
        </h2>
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <AdminResumoCard
            titulo="Receita do mês"
            icon="fa-arrow-trend-up"
            tom="ceu"
            principal-label="Receita este mês"
            :principal="cardReceita.principal"
            :principal-detalhe="cardReceita.principalDetalhe"
            :tiles="cardReceita.tiles"
            :pronto="stripePronto"
            :aviso="avisoStripe"
            nota="Pagamentos aprovados no Stripe desde o dia 1º."
          />
          <AdminResumoCard
            titulo="Assinaturas no Stripe"
            icon="fa-repeat"
            tom="lavanda"
            principal-label="Assinaturas ativas"
            :principal="cardAssinaturas.principal"
            :principal-detalhe="cardAssinaturas.principalDetalhe"
            :tiles="cardAssinaturas.tiles"
            :pronto="stripePronto"
            :aviso="avisoStripe"
          />
          <AdminResumoCard
            titulo="Mensalidades cadastradas"
            icon="fa-wallet"
            tom="menta"
            :principal-label="cardMensalidades.principalLabel"
            :principal="cardMensalidades.principal"
            :principal-detalhe="cardMensalidades.principalDetalhe"
            :tiles="cardMensalidades.tiles"
            :pronto="clientesPronto"
            :aviso="avisoClientes"
            nota="Valor cadastrado, não o que entrou no caixa. Cliente de parceiro paga o parceiro; a Agzap recebe do parceiro pela compra de créditos. Parceiro marcado como cobrança Agzap entra em “Pagam a Agzap”."
          />
        </div>
        <div v-if="stripeError" role="alert" class="rounded-xl bg-red-50 dark:bg-red-500/10 px-4 py-3 text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <span>Stripe: {{ stripeError }}</span>
        </div>
      </section>

      <!-- ─────────────── CLIENTES ─────────────── -->
      <section aria-labelledby="sec-clientes" class="space-y-2">
        <h2 id="sec-clientes" class="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <i class="fa-solid fa-users text-purple-500" aria-hidden="true" />
          Clientes
        </h2>
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <AdminResumoCard
            titulo="Base de clientes"
            icon="fa-database"
            tom="lavanda"
            empilhar-em="nunca"
            principal-label="Total"
            :principal="cardClientes.principal"
            :principal-detalhe="cardClientes.principalDetalhe"
            :tiles="cardClientes.tiles"
            :pronto="clientesPronto"
            :aviso="avisoClientes"
            nota="Trial conta quem está em teste; Básico, Pro e Enterprise contam o plano cadastrado."
          />
          <AdminResumoCard
            titulo="Novos cadastros"
            icon="fa-user-plus"
            tom="ambar"
            empilhar-em="nunca"
            principal-label="Últimos 30 dias"
            :principal="cardNovos.principal"
            principal-detalhe="novos no mês"
            :tiles="cardNovos.tiles"
            :pronto="clientesPronto"
            :aviso="avisoClientes"
          />
        </div>
        <div v-if="clientesError" role="alert" class="rounded-xl bg-red-50 dark:bg-red-500/10 px-4 py-3 text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <span>{{ clientesError }}</span>
        </div>
      </section>

      <!-- Vencidos -->
      <section v-if="!clientesLoading && stats.clientesVencidos > 0" aria-label="Clientes vencidos">
        <div class="rounded-2xl bg-red-50 dark:bg-red-500/10 p-4 sm:p-5 flex flex-wrap items-center gap-3 sm:gap-4">
          <span class="w-9 h-9 rounded-xl bg-white dark:bg-red-500/15 text-red-600 dark:text-red-300 flex items-center justify-center shrink-0 shadow-sm">
            <i class="fa-solid fa-triangle-exclamation text-sm" aria-hidden="true" />
          </span>
          <div class="flex-1 min-w-[12rem]">
            <p class="text-sm font-medium text-red-800 dark:text-red-200">
              <span class="tabular-nums">{{ stats.clientesVencidos }}</span> cliente{{ stats.clientesVencidos > 1 ? 's' : '' }} com assinatura vencida
            </p>
            <p class="text-xs text-red-700/80 dark:text-red-300/80 mt-0.5">Acesse a página de clientes para renovar ou gerenciar.</p>
          </div>
          <NuxtLink
            to="/admin?aba=vencidos"
            class="shrink-0 h-9 inline-flex items-center px-3 rounded-lg bg-white dark:bg-red-500/15 hover:bg-red-100 dark:hover:bg-red-500/25 text-red-700 dark:text-red-200 text-sm font-medium transition-colors"
          >
            Gerenciar
          </NuxtLink>
        </div>
      </section>

      <!-- ─────────────── PRÓXIMOS REPASSES ─────────────── -->
      <section v-if="stripeData" :class="['overflow-hidden', painel]" aria-labelledby="sec-repasses">
        <div class="px-4 sm:px-5 pt-4 pb-3 flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
              <i class="fa-solid fa-hourglass-half text-sm" aria-hidden="true" />
            </span>
            <div class="min-w-0">
              <h2 id="sec-repasses" class="text-[15px] font-medium text-slate-900 dark:text-white">Próximos repasses</h2>
              <p class="text-xs text-slate-500 dark:text-slate-400">Stripe</p>
            </div>
          </div>
          <span
            v-if="allUpcomingPayouts.length > 0"
            class="text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
          >{{ allUpcomingPayouts.length }}</span>
        </div>

        <div v-if="allUpcomingPayouts.length === 0" class="px-5 py-10 text-center border-t border-slate-100 dark:border-slate-800">
          <i class="fa-solid fa-money-check-dollar text-slate-300 dark:text-slate-700 text-2xl mb-2 block" aria-hidden="true" />
          <p class="text-slate-500 text-sm">Nenhum repasse programado no momento</p>
          <p class="text-slate-400 dark:text-slate-500 text-xs mt-1">Quando o Stripe agendar um repasse, ele aparece aqui.</p>
        </div>

        <div v-else class="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-100 dark:border-slate-800">
                <th :class="[th, 'hidden md:table-cell text-left pl-5 pr-3']">Iniciado em</th>
                <th :class="[th, 'hidden md:table-cell text-left px-3']">Método</th>
                <th :class="[th, 'text-right pl-4 md:pl-3 pr-3']">Valor</th>
                <th :class="[th, 'text-left px-3']">Chegar até</th>
                <th :class="[th, 'hidden sm:table-cell text-center pl-3 pr-5']">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              <tr v-for="payout in allUpcomingPayouts" :key="payout.id" class="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                <td class="hidden md:table-cell pl-5 pr-3 py-3.5">
                  <span class="text-slate-700 dark:text-slate-300 capitalize whitespace-nowrap">{{ formatArrivalDate(payout.created) }}</span>
                </td>
                <td class="hidden md:table-cell px-3 py-3.5">
                  <span class="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">{{ payout.method }}</span>
                </td>
                <td class="pl-4 md:pl-3 pr-3 py-3.5 text-right">
                  <span class="font-medium text-slate-900 dark:text-white tabular-nums whitespace-nowrap">{{ displayBRL(payout.amount) }}</span>
                </td>
                <td class="px-3 py-3.5">
                  <span class="inline-flex items-center gap-2 text-slate-800 dark:text-slate-200 capitalize whitespace-nowrap">
                    <i class="fa-solid fa-calendar-check text-amber-500 text-xs" aria-hidden="true" />
                    {{ formatArrivalDate(payout.arrivalDate) }}
                  </span>
                </td>
                <td class="hidden sm:table-cell pl-3 pr-5 py-3.5 text-center">
                  <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap" :class="getPayoutStatusCls(payout.status)">
                    <span class="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
                    {{ getPayoutStatusLabel(payout.status) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ─────────────── ANÁLISE VISUAL ─────────────── -->
      <section aria-labelledby="sec-graficos" class="space-y-2">
        <h2 id="sec-graficos" class="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <i class="fa-solid fa-chart-pie text-purple-500" aria-hidden="true" />
          Análise visual
        </h2>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <!-- Donut: Distribuição de Planos -->
          <div :class="['p-4 sm:p-5 min-w-0', painel]">
            <div class="flex items-center gap-2.5 mb-1">
              <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-300">
                <i class="fa-solid fa-layer-group text-sm" aria-hidden="true" />
              </span>
              <div class="min-w-0">
                <h3 class="text-[15px] font-medium text-slate-900 dark:text-white">Distribuição de planos</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400">Clientes por tipo de assinatura</p>
              </div>
            </div>
            <ClientOnly>
              <apexchart v-if="clientesPronto && clientes.length" type="donut" :options="plansChartOptions" :series="plansChartSeries" height="280" width="100%" />
              <div v-else class="h-[280px] flex items-center justify-center text-slate-400 text-xs">{{ avisoClientes }}</div>
              <template #fallback>
                <div class="h-[280px] flex items-center justify-center text-slate-400 text-xs animate-pulse">Carregando gráfico…</div>
              </template>
            </ClientOnly>
          </div>

          <!-- Donut: Status das Assinaturas Stripe -->
          <div :class="['p-4 sm:p-5 min-w-0', painel]">
            <div class="flex items-center gap-2.5 mb-1">
              <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                <i class="fa-solid fa-circle-nodes text-sm" aria-hidden="true" />
              </span>
              <div class="min-w-0">
                <h3 class="text-[15px] font-medium text-slate-900 dark:text-white">Status das assinaturas</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400">Dados em tempo real do Stripe</p>
              </div>
            </div>
            <ClientOnly>
              <apexchart v-if="stripeData" type="donut" :options="statusChartOptions" :series="statusChartSeries" height="280" width="100%" />
              <div v-else class="h-[280px] flex items-center justify-center text-slate-400 text-xs">{{ avisoStripe }}</div>
              <template #fallback>
                <div class="h-[280px] flex items-center justify-center text-slate-400 text-xs animate-pulse">Carregando gráfico…</div>
              </template>
            </ClientOnly>
          </div>

          <!-- Bar: Novos Cadastros (7 dias) -->
          <div :class="['p-4 sm:p-5 min-w-0', painel]">
            <div class="flex items-center gap-2.5 mb-1">
              <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                <i class="fa-solid fa-chart-column text-sm" aria-hidden="true" />
              </span>
              <div class="min-w-0">
                <h3 class="text-[15px] font-medium text-slate-900 dark:text-white">Novos cadastros</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400">Últimos 7 dias · <span class="tabular-nums">{{ clientesPronto ? novos7Dias : '—' }}</span> no total</p>
              </div>
            </div>
            <ClientOnly>
              <apexchart v-if="clientesPronto" type="bar" :options="signupsChartOptions" :series="signupsChartSeries" height="280" width="100%" />
              <div v-else class="h-[280px] flex items-center justify-center text-slate-400 text-xs">{{ avisoClientes }}</div>
              <template #fallback>
                <div class="h-[280px] flex items-center justify-center text-slate-400 text-xs animate-pulse">Carregando gráfico…</div>
              </template>
            </ClientOnly>
          </div>

          <!-- Area: Receita do Mês -->
          <div :class="['p-4 sm:p-5 min-w-0', painel]">
            <div class="flex items-center gap-2.5 mb-1">
              <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                <i class="fa-solid fa-chart-area text-sm" aria-hidden="true" />
              </span>
              <div class="min-w-0">
                <h3 class="text-[15px] font-medium text-slate-900 dark:text-white">Receita do mês</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400"><span class="tabular-nums">{{ stripeData ? displayBRL(stripeData.revenueThisMonth) : '—' }}</span> acumulado</p>
              </div>
            </div>
            <ClientOnly>
              <apexchart v-if="stripeData" type="area" :options="revenueChartOptions" :series="revenueChartSeries" height="280" width="100%" />
              <div v-else class="h-[280px] flex items-center justify-center text-slate-400 text-xs">{{ avisoStripe }}</div>
              <template #fallback>
                <div class="h-[280px] flex items-center justify-center text-slate-400 text-xs animate-pulse">Carregando gráfico…</div>
              </template>
            </ClientOnly>
          </div>
        </div>
      </section>

      <!-- ─────────────── LISTAS ─────────────── -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <!-- Cadastros Recentes -->
        <section :class="['overflow-hidden min-w-0', painel]" aria-labelledby="sec-recentes">
          <div class="px-4 sm:px-5 pt-4 pb-3 flex items-center justify-between gap-3">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-300">
                <i class="fa-solid fa-user-clock text-sm" aria-hidden="true" />
              </span>
              <h2 id="sec-recentes" class="text-[15px] font-medium text-slate-900 dark:text-white">Cadastros recentes</h2>
            </div>
            <NuxtLink to="/admin" class="shrink-0 text-xs text-slate-500 hover:text-purple-700 dark:hover:text-purple-400 transition-colors font-medium">
              Ver todos →
            </NuxtLink>
          </div>

          <div v-if="clientesLoading && !clientes.length" class="p-5 space-y-3 border-t border-slate-100 dark:border-slate-800">
            <div v-for="i in 5" :key="i" class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 animate-pulse shrink-0" />
              <div class="flex-1 space-y-1.5">
                <div class="h-3 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-2/3" />
                <div class="h-2.5 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-1/3" />
              </div>
            </div>
          </div>

          <ul v-else class="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
            <li
              v-for="c in cadastrosRecentes"
              :key="c.id"
              class="px-4 sm:px-5 py-3 flex items-center gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
            >
              <div class="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center shrink-0 text-white text-xs font-semibold" aria-hidden="true">
                {{ c.nome.charAt(0).toUpperCase() }}
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-slate-800 dark:text-white truncate">{{ c.nome }}</p>
                <div class="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  <span class="truncate">{{ fmtPhone(c.whatsapp) }}</span>
                  <a
                    v-if="whatsappLink(c.whatsapp)"
                    :href="whatsappLink(c.whatsapp)!"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center justify-center w-5 h-5 shrink-0 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500 hover:text-white transition-colors"
                    :title="`Abrir WhatsApp de ${c.nome}`"
                    aria-label="Abrir WhatsApp"
                  >
                    <i class="fa-brands fa-whatsapp text-[11px]" aria-hidden="true" />
                  </a>
                </div>
              </div>
              <div class="flex flex-col items-end gap-1 shrink-0">
                <span class="text-[11px] font-medium px-2 py-0.5 rounded-md" :class="getPlanBadge(c.subscription_plan).cls">{{ getPlanBadge(c.subscription_plan).label }}</span>
                <span class="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">{{ formatDateStr(c.created_at) }}</span>
              </div>
            </li>

            <li v-if="cadastrosRecentes.length === 0" class="px-5 py-10 text-center text-slate-500 text-sm">
              {{ clientesError ? 'Não foi possível carregar os clientes' : 'Nenhum cadastro encontrado' }}
            </li>
          </ul>
        </section>

        <!-- Vencendo em breve -->
        <section :class="['overflow-hidden min-w-0', painel]" aria-labelledby="sec-vencendo">
          <div class="px-4 sm:px-5 pt-4 pb-3 flex items-center justify-between gap-3">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
                <i class="fa-solid fa-bell text-sm" aria-hidden="true" />
              </span>
              <h2 id="sec-vencendo" class="text-[15px] font-medium text-slate-900 dark:text-white">Vencendo nos próximos 7 dias</h2>
            </div>
            <span
              v-if="vencendoBreveTodos.length > 0"
              class="shrink-0 text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
            >{{ vencendoBreveTodos.length }}</span>
          </div>

          <div v-if="clientesLoading && !clientes.length" class="p-5 space-y-3 border-t border-slate-100 dark:border-slate-800">
            <div v-for="i in 4" :key="i" class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 animate-pulse shrink-0" />
              <div class="flex-1 space-y-1.5">
                <div class="h-3 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-2/3" />
                <div class="h-2.5 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-1/2" />
              </div>
            </div>
          </div>

          <ul v-else class="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
            <li
              v-for="c in clientesVencendoBreve"
              :key="c.id"
              class="px-4 sm:px-5 py-3 flex items-center gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
            >
              <div class="relative shrink-0">
                <div class="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center text-amber-700 dark:text-amber-300 text-xs font-semibold" aria-hidden="true">
                  {{ c.nome.charAt(0).toUpperCase() }}
                </div>
                <div
                  class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900"
                  :class="getStatusDot(diasParaVencimento(c))"
                />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-slate-800 dark:text-white truncate">{{ c.nome }}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums flex items-center gap-1.5">
                  <span class="truncate">{{ fmtPhone(c.whatsapp) }}</span>
                  <a
                    v-if="whatsappLink(c.whatsapp)"
                    :href="whatsappLink(c.whatsapp)!"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center justify-center w-5 h-5 shrink-0 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500 hover:text-white transition-colors"
                    :title="`Abrir WhatsApp de ${c.nome}`"
                    aria-label="Abrir WhatsApp"
                  >
                    <i class="fa-brands fa-whatsapp text-[11px]" aria-hidden="true" />
                  </a>
                </p>
              </div>
              <div class="shrink-0 text-right">
                <span
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap"
                  :class="diasParaVencimento(c) === 0
                    ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
                    : diasParaVencimento(c) <= 3
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'"
                >
                  {{ diasParaVencimento(c) === 0 ? 'Vence hoje' : `${diasParaVencimento(c)}d` }}
                </span>
                <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{{ getPlanBadge(c.subscription_plan).label }}</p>
              </div>
            </li>

            <li v-if="vencendoBreveTodos.length > clientesVencendoBreve.length" class="px-5 py-2.5 text-center">
              <NuxtLink to="/admin" class="text-xs font-medium text-purple-700 dark:text-purple-400 hover:underline">
                +{{ vencendoBreveTodos.length - clientesVencendoBreve.length }} na página Clientes
              </NuxtLink>
            </li>

            <li v-if="clientesVencendoBreve.length === 0" class="px-5 py-10 text-center">
              <i class="fa-solid fa-circle-check text-emerald-500/50 text-2xl mb-2 block" aria-hidden="true" />
              <p class="text-slate-500 text-sm">{{ clientesError ? 'Não foi possível carregar os clientes' : 'Nenhum cliente vencendo em breve' }}</p>
            </li>
          </ul>
        </section>
      </div>

      <!-- ─────────────── REPASSES PAGOS ─────────────── -->
      <section v-if="stripeData && stripeData.paidPayouts.length > 0" :class="['overflow-hidden', painel]" aria-labelledby="sec-pagos">
        <div class="px-4 sm:px-5 pt-4 pb-3 flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
              <i class="fa-solid fa-circle-check text-sm" aria-hidden="true" />
            </span>
            <div class="min-w-0">
              <h2 id="sec-pagos" class="text-[15px] font-medium text-slate-900 dark:text-white">Repasses já pagos</h2>
              <p class="text-xs text-slate-500 dark:text-slate-400">Stripe</p>
            </div>
          </div>
          <span class="text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{{ stripeData.paidPayouts.length }}</span>
        </div>

        <div class="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-100 dark:border-slate-800">
                <th :class="[th, 'hidden md:table-cell text-left pl-5 pr-3']">Iniciado em</th>
                <th :class="[th, 'hidden lg:table-cell text-left px-3']">Método</th>
                <th :class="[th, 'text-right pl-4 md:pl-3 pr-3']">Valor</th>
                <th :class="[th, 'text-left px-3']">Chegar até</th>
                <th :class="[th, 'hidden sm:table-cell text-center pl-3 pr-5']">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              <tr v-for="payout in stripeData.paidPayouts" :key="payout.id" class="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                <td class="hidden md:table-cell pl-5 pr-3 py-3.5">
                  <span class="text-slate-700 dark:text-slate-300 capitalize whitespace-nowrap">{{ formatArrivalDate(payout.created) }}</span>
                </td>
                <td class="hidden lg:table-cell px-3 py-3.5">
                  <span class="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">{{ payout.method }}</span>
                </td>
                <td class="pl-4 md:pl-3 pr-3 py-3.5 text-right">
                  <span class="font-medium text-emerald-700 dark:text-emerald-400 tabular-nums whitespace-nowrap">{{ displayBRL(payout.amount) }}</span>
                </td>
                <td class="px-3 py-3.5">
                  <span class="inline-flex items-center gap-2 text-slate-800 dark:text-slate-200 capitalize whitespace-nowrap">
                    <i class="fa-solid fa-calendar-check text-emerald-500 text-xs" aria-hidden="true" />
                    {{ formatArrivalDate(payout.arrivalDate) }}
                  </span>
                </td>
                <td class="hidden sm:table-cell pl-3 pr-5 py-3.5 text-center">
                  <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap" :class="getPayoutStatusCls(payout.status)">
                    <span class="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
                    {{ getPayoutStatusLabel(payout.status) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ─────────────── PAGAMENTOS RECENTES ─────────────── -->
      <section v-if="stripeData && stripeData.recentPayments.length > 0" :class="['overflow-hidden', painel]" aria-labelledby="sec-pagamentos">
        <div class="px-4 sm:px-5 pt-4 pb-3 flex items-center gap-2.5">
          <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
            <i class="fa-solid fa-receipt text-sm" aria-hidden="true" />
          </span>
          <div class="min-w-0">
            <h2 id="sec-pagamentos" class="text-[15px] font-medium text-slate-900 dark:text-white">Pagamentos recentes</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">Stripe</p>
          </div>
        </div>

        <div class="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-100 dark:border-slate-800">
                <th :class="[th, 'hidden md:table-cell text-left pl-5 pr-3']">ID</th>
                <th :class="[th, 'text-left pl-4 md:pl-3 pr-3']">Data</th>
                <th :class="[th, 'text-right px-3']">Valor</th>
                <th :class="[th, 'hidden sm:table-cell text-center pl-3 pr-5']">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              <tr v-for="payment in stripeData.recentPayments" :key="payment.id" class="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                <td class="hidden md:table-cell pl-5 pr-3 py-3.5">
                  <span class="text-slate-500 dark:text-slate-400 font-mono text-xs">{{ payment.id.slice(0, 16) }}…</span>
                </td>
                <td class="pl-4 md:pl-3 pr-3 py-3.5 text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">{{ formatDate(payment.created) }}</td>
                <td class="px-3 py-3.5 text-right">
                  <span class="font-medium text-emerald-700 dark:text-emerald-400 tabular-nums whitespace-nowrap">{{ displayBRL(payment.amount) }}</span>
                </td>
                <td class="hidden sm:table-cell pl-3 pr-5 py-3.5 text-center">
                  <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <span class="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
                    Aprovado
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

    </div>
  </div>
</template>
