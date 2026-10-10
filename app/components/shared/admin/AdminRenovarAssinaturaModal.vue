<script setup lang="ts">
import { ref, watch, computed } from 'vue'

type Ancora = 'vencimento' | 'hoje'

const props = defineProps<{
  show: boolean
  clienteNome: string
  clienteId?: string | null
  precoMensal?: number | null
  precoAnual?: number | null
  // Situação atual da assinatura (o cliente da lista). Dá o vencimento atual,
  // na mesma regra da coluna "Vencimento" (getDataVencimento).
  assinatura?: { subscription_status?: string | null; subscription_renews_at?: string | null; trial_ends_at?: string | null } | null
}>()
const emit = defineEmits<{
  close: []
  // abater = quanto do saldo de indicação foi usado nesta renovação (0 = nada)
  // ancora = de onde o novo período conta: vencimento atual ou hoje
  confirm: [plan: string, period: string, abater: number, ancora: Ancora]
}>()

const periodPlanMap: Record<string, { plan: string; label: string }> = {
  trial1d: { plan: 'free', label: 'Gratuito (1 dia)' },
  trial2d: { plan: 'free', label: 'Gratuito (2 dias)' },
  trial3d: { plan: 'free', label: 'Gratuito (3 dias)' },
  trial5d: { plan: 'free', label: 'Gratuito (5 dias)' },
  trial: { plan: 'free', label: 'Gratuito (7 dias)' },
  '1month': { plan: 'basic', label: 'Básico (1 mês)' },
  '6months': { plan: 'pro', label: 'Pro (6 meses)' },
  '12months': { plan: 'enterprise', label: 'Enterprise (12 meses)' },
}
const testes = [
  { key: 'trial1d', label: '1 dia', dias: 1 },
  { key: 'trial2d', label: '2 dias', dias: 2 },
  { key: 'trial3d', label: '3 dias', dias: 3 },
  { key: 'trial5d', label: '5 dias', dias: 5 },
  { key: 'trial', label: '7 dias', dias: 7 },
]
const planos = [
  { key: '1month', nome: 'Básico', periodo: '1 mês', meses: 1 },
  { key: '6months', nome: 'Pro', periodo: '6 meses', meses: 6 },
  { key: '12months', nome: 'Enterprise', periodo: '12 meses', meses: 12 },
]

const selected = ref<string>('1month')

// ── Datas no relógio de São Paulo ──────────────────────────────────────────
// A mesma conta está em server/api/admin/renovar-assinatura.post.ts (quem
// grava de verdade); aqui é só a prévia.
const TZ = 'America/Sao_Paulo'
const fmtPartesSP = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})
const fmtData = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
function paredeSP(t: number): number {
  const p: Record<string, number> = {}
  for (const x of fmtPartesSP.formatToParts(new Date(t))) if (x.type !== 'literal') p[x.type] = Number(x.value)
  return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour! % 24, p.minute!, p.second!) + (((t % 1000) + 1000) % 1000)
}
function deParedeSP(parede: number): number {
  let t = parede + 3 * 3_600_000
  t += parede - paredeSP(t)
  return t
}
// Meses de calendário (31/01 + 1 mês = último dia de fevereiro) + dias.
function somarPeriodoSP(base: Date, meses: number, dias: number): Date {
  const w = new Date(paredeSP(base.getTime()))
  const ano = w.getUTCFullYear()
  const mesAlvo = w.getUTCMonth() + meses
  const ultimoDia = new Date(Date.UTC(ano, mesAlvo + 1, 0)).getUTCDate()
  const novo = Date.UTC(ano, mesAlvo, Math.min(w.getUTCDate(), ultimoDia),
    w.getUTCHours(), w.getUTCMinutes(), w.getUTCSeconds(), w.getUTCMilliseconds()) + dias * 86_400_000
  return new Date(deParedeSP(novo))
}
const diaSP = (d: Date) => Math.floor(paredeSP(d.getTime()) / 86_400_000)
const fmt = (d: Date | null) => (d ? fmtData.format(d) : '—')

const agora = ref(new Date())
const ancora = ref<Ancora>('hoje')

const vencimentoAtual = computed<Date | null>(() => {
  const a = props.assinatura
  if (!a) return null
  const s = (a.subscription_status === 'active' && a.subscription_renews_at) ? a.subscription_renews_at
    : (a.subscription_status === 'trial' && a.trial_ends_at) ? a.trial_ends_at
    : a.trial_ends_at || a.subscription_renews_at || null
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
})
const diasAteVencimento = computed(() => (vencimentoAtual.value ? diaSP(vencimentoAtual.value) - diaSP(agora.value) : null))
const situacaoVencimento = computed(() => {
  const d = diasAteVencimento.value
  if (d === null) return 'Sem vencimento'
  if (d < -1) return `Venceu há ${-d} dias`
  if (d === -1) return 'Venceu ontem'
  if (d === 0) return 'Vence hoje'
  if (d === 1) return 'Vence amanhã'
  return `Vence em ${d} dias`
})

const passo = computed(() => {
  const t = testes.find(x => x.key === selected.value)
  if (t) return { meses: 0, dias: t.dias }
  return { meses: planos.find(x => x.key === selected.value)?.meses ?? 1, dias: 0 }
})
const novoPorVencimento = computed(() => (vencimentoAtual.value ? somarPeriodoSP(vencimentoAtual.value, passo.value.meses, passo.value.dias) : null))
const novoPorHoje = computed(() => somarPeriodoSP(agora.value, passo.value.meses, passo.value.dias))
// Motivo de "Vencimento atual" estar indisponível (null = disponível).
const vencimentoBloqueado = computed<string | null>(() => {
  if (!vencimentoAtual.value) return 'Sem vencimento cadastrado: conta a partir de hoje.'
  if (!novoPorVencimento.value || diaSP(novoPorVencimento.value) <= diaSP(agora.value)) {
    return 'O vencimento atual ficou para trás: contando dele, a nova data já teria passado.'
  }
  return null
})
const novoVencimento = computed(() => (ancora.value === 'vencimento' ? novoPorVencimento.value : novoPorHoje.value))

// Ao abrir: vencimento atual quando ele é hoje ou no futuro; senão, hoje.
watch(() => [props.show, props.clienteId], ([s]) => {
  if (!s) return
  agora.value = new Date()
  const d = diasAteVencimento.value
  ancora.value = d !== null && d >= 0 && !vencimentoBloqueado.value ? 'vencimento' : 'hoje'
}, { immediate: true })
watch(vencimentoBloqueado, (b) => { if (b && ancora.value === 'vencimento') ancora.value = 'hoje' })

// Saldo de indicação disponível (cliente de Pix): dá pra abater aqui na
// renovação — o painel registra o uso e você cobra só a diferença.
const saldoDisponivel = ref(0)
const usarSaldo = ref(false)
const valorAbater = ref<number | null>(null)
watch(() => [props.show, props.clienteId], async ([s]) => {
  saldoDisponivel.value = 0
  usarSaldo.value = false
  if (!s || !props.clienteId) return
  try {
    const r = await $fetch<{ disponivel: number }>('/api/admin/indicacao-saldo', { query: { empresaId: props.clienteId }, headers: await useAdminAuthHeaders() })
    saldoDisponivel.value = r.disponivel || 0
    usarSaldo.value = saldoDisponivel.value > 0
  } catch { saldoDisponivel.value = 0 }
}, { immediate: true })
const precoPeriodo = computed(() => {
  if (selected.value === '1month') return Number(props.precoMensal || 0)
  if (selected.value === '6months' || selected.value === '12months') return Number(props.precoAnual || 0)
  return 0
})
watch([saldoDisponivel, () => selected.value], () => {
  valorAbater.value = precoPeriodo.value > 0 ? Math.min(saldoDisponivel.value, precoPeriodo.value) : saldoDisponivel.value
})
function brl(v: number) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
// Preço curto no card do plano (sem centavos quando é valor redondo).
function brlCurto(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })
}
function precoPlano(key: string): string | null {
  const mensal = Number(props.precoMensal || 0)
  const anual = Number(props.precoAnual || 0)
  if (key === '1month' && mensal > 0) return `${brlCurto(mensal)}/mês`
  if (key === '12months' && anual > 0) return brlCurto(anual)
  return null
}

function handleSubmit() {
  const { plan } = periodPlanMap[selected.value] || { plan: 'basic' }
  const abater = !selected.value.startsWith('trial') && usarSaldo.value && valorAbater.value
    ? Math.min(Math.round(Number(valorAbater.value) * 100) / 100, saldoDisponivel.value)
    : 0
  const a: Ancora = ancora.value === 'vencimento' && !vencimentoBloqueado.value ? 'vencimento' : 'hoje'
  emit('confirm', plan, selected.value, abater > 0 ? abater : 0, a)
}
</script>

<template>
  <BaseModal :show="show" title="Renovar assinatura" max-width="max-w-lg" @close="$emit('close')">
    <form class="space-y-5" @submit.prevent="handleSubmit">
      <p class="-mt-1 text-sm text-slate-600 dark:text-slate-400">
        Renovando para <span class="font-medium text-slate-900 dark:text-white break-words">{{ clienteNome }}</span>
      </p>

      <!-- Teste grátis -->
      <div>
        <p id="renovar-testes" class="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Teste grátis</p>
        <div class="grid grid-cols-5 gap-1.5" role="radiogroup" aria-labelledby="renovar-testes">
          <button
            v-for="t in testes"
            :key="t.key"
            type="button"
            role="radio"
            :aria-checked="selected === t.key"
            class="h-9 rounded-lg border text-sm whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
            :class="selected === t.key
              ? 'border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300'
              : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'"
            @click="selected = t.key"
          >
            {{ t.label }}
          </button>
        </div>
      </div>

      <!-- Planos -->
      <div>
        <p id="renovar-planos" class="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Planos</p>
        <div class="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="renovar-planos">
          <button
            v-for="p in planos"
            :key="p.key"
            type="button"
            role="radio"
            :aria-checked="selected === p.key"
            class="flex min-w-0 flex-col items-start rounded-xl border px-2.5 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60 sm:px-3"
            :class="selected === p.key
              ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500 dark:bg-purple-500/15'
              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60'"
            @click="selected = p.key"
          >
            <span class="text-sm font-medium text-slate-900 dark:text-white">{{ p.nome }}</span>
            <span class="text-xs text-slate-500 dark:text-slate-400">{{ p.periodo }}</span>
            <span v-if="precoPlano(p.key)" class="mt-1 max-w-full truncate text-xs tabular-nums text-slate-700 dark:text-slate-300">{{ precoPlano(p.key) }}</span>
          </button>
        </div>
      </div>

      <!-- Contar a partir de -->
      <div>
        <p id="renovar-ancora" class="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Contar a partir de</p>
        <div class="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/70" role="radiogroup" aria-labelledby="renovar-ancora">
          <button
            type="button"
            role="radio"
            :aria-checked="ancora === 'vencimento'"
            :disabled="!!vencimentoBloqueado"
            class="flex flex-col items-center rounded-lg px-2 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60 disabled:cursor-not-allowed disabled:opacity-50"
            :class="ancora === 'vencimento'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
              : 'text-slate-600 dark:text-slate-400 enabled:hover:text-slate-900 dark:enabled:hover:text-white'"
            @click="ancora = 'vencimento'"
          >
            <span class="font-medium">Vencimento atual</span>
            <span class="text-xs tabular-nums text-slate-500 dark:text-slate-400">{{ vencimentoAtual ? fmt(vencimentoAtual) : 'sem data' }}</span>
          </button>
          <button
            type="button"
            role="radio"
            :aria-checked="ancora === 'hoje'"
            class="flex flex-col items-center rounded-lg px-2 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
            :class="ancora === 'hoje'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'"
            @click="ancora = 'hoje'"
          >
            <span class="font-medium">Hoje</span>
            <span class="text-xs tabular-nums text-slate-500 dark:text-slate-400">{{ fmt(agora) }}</span>
          </button>
        </div>
        <p v-if="vencimentoBloqueado" class="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{{ vencimentoBloqueado }}</p>

        <!-- Prévia -->
        <div class="mt-3 flex items-center justify-between gap-3 rounded-xl border border-purple-200 bg-purple-50/60 px-4 py-2.5 dark:border-purple-500/30 dark:bg-purple-500/10">
          <div class="min-w-0">
            <p class="text-xs" :class="diasAteVencimento !== null && diasAteVencimento < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'">{{ situacaoVencimento }}</p>
            <p class="text-sm tabular-nums text-slate-700 dark:text-slate-300">{{ fmt(vencimentoAtual) }}</p>
          </div>
          <i class="fa-solid fa-arrow-right shrink-0 text-sm text-purple-500 dark:text-purple-400" aria-hidden="true" />
          <div class="min-w-0 text-right">
            <p class="text-xs text-slate-500 dark:text-slate-400">Novo vencimento</p>
            <p class="text-base font-semibold tabular-nums text-purple-700 dark:text-purple-300">{{ fmt(novoVencimento) }}</p>
          </div>
        </div>
        <p v-if="ancora === 'vencimento' && diasAteVencimento !== null && diasAteVencimento < 0" class="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          Os dias desde o vencimento contam dentro do novo período.
        </p>
      </div>

      <div v-if="saldoDisponivel > 0 && !selected.startsWith('trial')" class="rounded-xl border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 space-y-2">
        <label class="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">
          <input v-model="usarSaldo" type="checkbox" class="text-emerald-600" />
          Abater o saldo de indicação ({{ brl(saldoDisponivel) }} disponível)
        </label>
        <div v-if="usarSaldo" class="flex flex-wrap items-center gap-2 text-sm">
          <span class="text-emerald-800 dark:text-emerald-300">Abater</span>
          <input v-model.number="valorAbater" type="number" min="0.01" step="0.01" :max="saldoDisponivel" class="w-28 px-2 py-1.5 rounded-md border border-emerald-300 dark:border-emerald-500/40 bg-white dark:bg-slate-900 text-sm" />
          <span v-if="precoPeriodo > 0" class="text-xs text-emerald-800 dark:text-emerald-300">→ cobrar {{ brl(Math.max(0, precoPeriodo - (valorAbater || 0))) }} de {{ brl(precoPeriodo) }}</span>
        </div>
      </div>

      <div class="flex gap-2">
        <button type="button" class="flex-1 px-4 py-2.5 rounded-lg font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800" @click="$emit('close')">
          Cancelar
        </button>
        <button type="submit" class="flex-1 px-4 py-2.5 rounded-lg font-medium bg-purple-600 hover:bg-purple-700 text-white">
          Renovar
        </button>
      </div>
    </form>
  </BaseModal>
</template>
