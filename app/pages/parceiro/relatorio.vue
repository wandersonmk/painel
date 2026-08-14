<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

/**
 * Relatório de lucro do parceiro: quanto ele fatura com os clientes, quanto
 * gasta de crédito com a Agzap e o que sobra, no período escolhido.
 */
definePageMeta({
  middleware: ['auth', 'parceiro'],
  layout: 'parceiro',
})

const { parceiro, checkParceiro } = useParceiro()

type Periodo = 'hoje' | '7d' | '30d' | 'custom'
const periodo = ref<Periodo>('30d')
const dataInicio = ref('')
const dataFim = ref('')

const loading = ref(true)
const erro = ref<string | null>(null)
const resumo = ref<any>(null)
const porCliente = ref<any[]>([])
const renovacoes = ref<any[]>([])

const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Intervalo em horário local: o parceiro pensa em dia de calendário, não UTC. */
function intervalo(): { de: Date; ate: Date } {
  const fim = new Date()
  fim.setHours(23, 59, 59, 999)

  if (periodo.value === 'custom' && dataInicio.value && dataFim.value) {
    const [ay, am, ad] = dataInicio.value.split('-').map(Number)
    const [by, bm, bd] = dataFim.value.split('-').map(Number)
    return {
      de: new Date(ay!, (am ?? 1) - 1, ad ?? 1, 0, 0, 0, 0),
      ate: new Date(by!, (bm ?? 1) - 1, bd ?? 1, 23, 59, 59, 999),
    }
  }

  const inicio = new Date()
  inicio.setHours(0, 0, 0, 0)
  if (periodo.value === '7d') inicio.setDate(inicio.getDate() - 6)
  if (periodo.value === '30d') inicio.setDate(inicio.getDate() - 29)
  return { de: inicio, ate: fim }
}

async function carregar() {
  loading.value = true
  erro.value = null
  try {
    const { de, ate } = intervalo()
    const resp = await $fetch<{ success: boolean; data?: any; error?: string }>(
      '/api/parceiro/relatorio',
      { query: { de: de.toISOString(), ate: ate.toISOString() }, headers: await useAdminAuthHeaders() },
    )
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Erro')
    resumo.value = resp.data.resumo
    porCliente.value = resp.data.porCliente
    renovacoes.value = resp.data.renovacoes
  } catch (e: any) {
    erro.value = e?.data?.statusMessage || e?.message || 'Não foi possível montar o relatório'
  } finally {
    loading.value = false
  }
}

function trocarPeriodo(p: Periodo) {
  periodo.value = p
  if (p === 'custom') {
    if (!dataInicio.value) {
      const d = new Date()
      d.setDate(d.getDate() - 29)
      dataInicio.value = isoDia(d)
    }
    if (!dataFim.value) dataFim.value = isoDia(new Date())
  }
  carregar()
}

onMounted(async () => {
  await Promise.all([checkParceiro(), carregar()])
})

const fmtBRL = (v: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v ?? 0))
const fmtData = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'
const fmtDataHora = (s: string | null) =>
  s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

const LABEL_TIPO: Record<string, string> = { mensal_30d: '30 dias', anual_12m: '12 meses' }

const rotuloPeriodo = computed(() => {
  const { de, ate } = intervalo()
  if (periodo.value === 'hoje') return 'hoje'
  return `${de.toLocaleDateString('pt-BR')} a ${ate.toLocaleDateString('pt-BR')}`
})

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
const th = 'text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider'
const td = 'px-4 py-2.5 text-sm'
</script>

<template>
  <div class="p-4 sm:p-6 md:p-8 space-y-5 max-w-[1400px] mx-auto w-full">

    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Relatório</h1>
        <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
          Quanto você faturou, quanto gastou de crédito e o que sobrou · <span class="capitalize">{{ rotuloPeriodo }}</span>
        </p>
      </div>
      <button
        @click="carregar"
        :disabled="loading"
        type="button"
        class="inline-flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-sm font-semibold transition-all duration-150 shadow-lg shadow-purple-600/30 dark:shadow-purple-600/20"
      >
        <i class="fa-solid fa-arrows-rotate text-sm" :class="{ 'animate-spin': loading }" aria-hidden="true" />
        <span class="hidden sm:inline">Atualizar</span>
      </button>
    </div>

    <!-- Período -->
    <div :class="['p-3 sm:p-4 flex flex-wrap items-center gap-2', cardBase]">
      <button
        v-for="p in ([
          { id: 'hoje' as const, label: 'Hoje' },
          { id: '7d' as const, label: '7 dias' },
          { id: '30d' as const, label: '30 dias' },
          { id: 'custom' as const, label: 'Personalizado' },
        ])"
        :key="p.id"
        type="button"
        @click="trocarPeriodo(p.id)"
        class="px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors"
        :class="periodo === p.id
          ? 'border-purple-400 bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400'
          : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-slate-300'"
      >{{ p.label }}</button>

      <div v-if="periodo === 'custom'" class="flex items-center gap-2 ml-auto">
        <input
          v-model="dataInicio"
          type="date"
          aria-label="Data inicial"
          class="px-2.5 py-1.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded text-xs text-slate-900 dark:text-white"
        />
        <span class="text-slate-400 text-xs">até</span>
        <input
          v-model="dataFim"
          type="date"
          aria-label="Data final"
          class="px-2.5 py-1.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded text-xs text-slate-900 dark:text-white"
        />
        <button
          type="button"
          @click="carregar"
          class="px-3 py-1.5 rounded text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors"
        >Aplicar</button>
      </div>
    </div>

    <div v-if="erro" class="p-4 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
      <span>{{ erro }}</span>
    </div>

    <div v-else-if="loading && !resumo" class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div v-for="i in 3" :key="i" class="h-24 rounded-md bg-slate-100 dark:bg-white/5 animate-pulse" />
    </div>

    <template v-else-if="resumo">
      <!-- Os três números -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div :class="['p-4', cardBase]">
          <p class="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <i class="fa-solid fa-arrow-trend-up text-[10px]" aria-hidden="true" />
            Lucro bruto
          </p>
          <p class="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">{{ fmtBRL(resumo.lucro_bruto) }}</p>
          <p class="text-[11px] text-slate-400 mt-0.5">
            {{ resumo.meses_vendidos }} {{ resumo.meses_vendidos === 1 ? 'mês vendido' : 'meses vendidos' }} para {{ resumo.clientes_atendidos }} cliente{{ resumo.clientes_atendidos === 1 ? '' : 's' }}
          </p>
        </div>

        <div :class="['p-4', cardBase]">
          <p class="text-[11px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1.5">
            <i class="fa-solid fa-coins text-[10px]" aria-hidden="true" />
            Gasto com créditos
          </p>
          <p class="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">{{ fmtBRL(resumo.custo_creditos) }}</p>
          <p class="text-[11px] text-slate-400 mt-0.5">
            {{ resumo.renovacoes }} renovaç{{ resumo.renovacoes === 1 ? 'ão' : 'ões' }} · {{ fmtBRL(resumo.custo_medio_mensal) }} por crédito de 30 dias
          </p>
        </div>

        <div :class="['p-4', cardBase, resumo.lucro_liquido < 0 ? 'ring-1 ring-red-300 dark:ring-red-500/40' : '']">
          <p class="text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
            <i class="fa-solid fa-sack-dollar text-[10px]" aria-hidden="true" />
            Lucro líquido
          </p>
          <p class="text-2xl font-bold tabular-nums mt-1" :class="resumo.lucro_liquido >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'">
            {{ fmtBRL(resumo.lucro_liquido) }}
          </p>
          <p class="text-[11px] text-slate-400 mt-0.5">margem de {{ resumo.margem.toFixed(1).replace('.', ',') }}%</p>
        </div>
      </div>

      <!-- Avisos que mudam a leitura dos números -->
      <div class="flex flex-wrap gap-2">
        <span
          v-if="resumo.compras_valor > 0"
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300"
          title="Saída de caixa do período — não é o custo das renovações acima"
        >
          <i class="fa-solid fa-cart-shopping text-[10px]" aria-hidden="true" />
          Você comprou {{ resumo.compras_creditos }} créditos neste período · {{ fmtBRL(resumo.compras_valor) }}
        </span>
        <span
          v-if="resumo.clientes_sem_preco > 0"
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400"
        >
          <i class="fa-solid fa-triangle-exclamation text-[10px]" aria-hidden="true" />
          {{ resumo.clientes_sem_preco }} cliente(s) sem valor cadastrado entram como R$ 0,00
        </span>
      </div>

      <!-- Por cliente -->
      <section>
        <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Por cliente</p>
        <div :class="['overflow-hidden', cardBase]">
          <div v-if="!porCliente.length" class="px-5 py-10 text-center">
            <i class="fa-solid fa-chart-simple text-slate-300 dark:text-slate-700 text-2xl mb-2 block" aria-hidden="true" />
            <p class="text-slate-500 text-sm">Nenhuma renovação neste período</p>
          </div>
          <div v-else class="overflow-auto max-h-[26rem]">
            <table class="w-full">
              <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
                <tr class="border-b border-slate-200 dark:border-white/5">
                  <th :class="th">Cliente</th>
                  <th :class="[th, 'text-right']">Valor/mês</th>
                  <th :class="[th, 'text-center']">Renovações</th>
                  <th :class="[th, 'text-center']">Meses</th>
                  <th :class="[th, 'text-right']">Receita</th>
                  <th :class="[th, 'text-right']">Custo</th>
                  <th :class="[th, 'text-right']">Lucro</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-white/5">
                <tr v-for="c in porCliente" :key="c.empresa_id" class="hover:bg-slate-50/80 dark:hover:bg-white/[0.03]">
                  <td :class="[td, 'font-medium text-slate-800 dark:text-white']">{{ c.empresa_nome }}</td>
                  <td :class="[td, 'text-right tabular-nums', c.preco_mensal > 0 ? 'text-slate-600 dark:text-slate-400' : 'text-amber-600 dark:text-amber-400']">
                    {{ c.preco_mensal > 0 ? fmtBRL(c.preco_mensal) : 'sem valor' }}
                  </td>
                  <td :class="[td, 'text-center tabular-nums text-slate-600 dark:text-slate-400']">{{ c.renovacoes }}</td>
                  <td :class="[td, 'text-center tabular-nums text-slate-600 dark:text-slate-400']">{{ c.meses }}</td>
                  <td :class="[td, 'text-right tabular-nums text-slate-700 dark:text-slate-200']">{{ fmtBRL(c.receita) }}</td>
                  <td :class="[td, 'text-right tabular-nums text-red-600 dark:text-red-400']">{{ fmtBRL(c.custo) }}</td>
                  <td :class="[td, 'text-right tabular-nums font-bold', c.lucro >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400']">
                    {{ fmtBRL(c.lucro) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- Renovação a renovação -->
      <section v-if="renovacoes.length">
        <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Renovações do período</p>
        <div :class="['overflow-hidden', cardBase]">
          <div class="overflow-auto max-h-[26rem]">
            <table class="w-full">
              <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
                <tr class="border-b border-slate-200 dark:border-white/5">
                  <th :class="th">Data</th>
                  <th :class="th">Cliente</th>
                  <th :class="th">Crédito</th>
                  <th :class="[th, 'text-right']">Receita</th>
                  <th :class="[th, 'text-right']">Custo</th>
                  <th :class="[th, 'text-right']">Válido até</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-white/5">
                <tr v-for="r in renovacoes" :key="r.id" class="hover:bg-slate-50/80 dark:hover:bg-white/[0.03]">
                  <td :class="[td, 'text-xs text-slate-500 tabular-nums whitespace-nowrap']">{{ fmtDataHora(r.data) }}</td>
                  <td :class="[td, 'text-slate-800 dark:text-white']">{{ r.empresa_nome }}</td>
                  <td :class="[td, 'text-xs text-slate-500']">
                    {{ LABEL_TIPO[r.tipo_credito] ?? '—' }}
                    <span v-if="!r.consumiu_credito" class="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">Agzap</span>
                  </td>
                  <td :class="[td, 'text-right tabular-nums text-slate-700 dark:text-slate-200']">{{ fmtBRL(r.receita) }}</td>
                  <td :class="[td, 'text-right tabular-nums text-red-600 dark:text-red-400']">{{ fmtBRL(r.custo) }}</td>
                  <td :class="[td, 'text-right tabular-nums text-xs text-slate-500']">{{ fmtData(r.vencimento_novo) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <p class="text-[11px] text-slate-400 dark:text-slate-500 flex items-start gap-1.5">
        <i class="fa-solid fa-circle-info text-[10px] mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          A receita usa o <strong>valor atual</strong> cadastrado de cada cliente, multiplicado pelos meses
          da renovação (12 no crédito anual). O custo é o <strong>preço médio</strong> que você pagou por
          crédito; crédito de cortesia entra como zero, e renovação feita pela Agzap não tem custo para você.
        </span>
      </p>
    </template>
  </div>
</template>
