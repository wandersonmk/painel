<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  useFinanceiro,
  formatBRL,
  statusDoLancamento,
  type FinanceiroLancamento,
  type FinanceiroFormPayload,
  type FinanceiroStatus,
} from '~/composables/useFinanceiro'

definePageMeta({
  middleware: ['auth', 'super-admin'],
  layout: 'dashboard',
})

const { lancamentos, loading, error, stats, carregar, salvar, togglePago, excluir } = useFinanceiro()

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null
onMounted(async () => {
  toast = await useToastSafe()
  await carregar()
})

const isRefreshing = ref(false)
async function refresh() {
  isRefreshing.value = true
  await carregar()
  isRefreshing.value = false
}

// ---------- Modal de cadastro/edição ----------
const showLancModal = ref(false)
const tipoInicialModal = ref<'entrada' | 'saida'>('saida')
const lancamentoEditando = ref<FinanceiroLancamento | null>(null)
const salvando = ref(false)

function novoLancamento(tipo: 'entrada' | 'saida') {
  lancamentoEditando.value = null
  tipoInicialModal.value = tipo
  showLancModal.value = true
}
function editarLancamento(l: FinanceiroLancamento) {
  lancamentoEditando.value = l
  tipoInicialModal.value = l.tipo
  showLancModal.value = true
}
async function handleSubmitLancamento(payload: FinanceiroFormPayload) {
  salvando.value = true
  try {
    await salvar(payload)
    toast?.success(payload.id ? 'Lançamento atualizado' : 'Lançamento criado')
    showLancModal.value = false
    lancamentoEditando.value = null
  } catch (err: any) {
    toast?.error(err?.message || 'Erro ao salvar')
  } finally {
    salvando.value = false
  }
}

// ---------- Excluir ----------
const lancamentoParaExcluir = ref<FinanceiroLancamento | null>(null)
const excluindo = ref(false)
function pedirExcluir(l: FinanceiroLancamento) {
  lancamentoParaExcluir.value = l
}
async function confirmarExcluir() {
  if (!lancamentoParaExcluir.value) return
  excluindo.value = true
  try {
    await excluir(lancamentoParaExcluir.value.id)
    toast?.success('Lançamento excluído')
    lancamentoParaExcluir.value = null
  } catch (err: any) {
    toast?.error(err?.message || 'Erro ao excluir')
  } finally {
    excluindo.value = false
  }
}

// ---------- Toggle pago ----------
async function handleTogglePago(l: FinanceiroLancamento) {
  try {
    await togglePago(l.id, !l.data_pagamento)
    toast?.success(l.data_pagamento ? 'Marcado como em aberto' : 'Marcado como pago')
  } catch (err: any) {
    toast?.error(err?.message || 'Erro ao atualizar pagamento')
  }
}

// ---------- Filtros ----------
const busca = ref('')
const filterTipo = ref<'all' | 'entrada' | 'saida'>('all')
const filterStatus = ref<'all' | FinanceiroStatus>('all')
const filterCategoria = ref('')
const valorMin = ref<number | null>(null)
const valorMax = ref<number | null>(null)

const categoriasDisponiveis = computed(() => {
  const set = new Set<string>()
  for (const l of lancamentos.value) if (l.categoria) set.add(l.categoria)
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
})

const filtrados = computed(() => {
  return lancamentos.value.filter((l) => {
    if (filterTipo.value !== 'all' && l.tipo !== filterTipo.value) return false
    if (filterStatus.value !== 'all' && statusDoLancamento(l) !== filterStatus.value) return false
    if (filterCategoria.value && l.categoria !== filterCategoria.value) return false
    if (valorMin.value !== null && l.valor < valorMin.value) return false
    if (valorMax.value !== null && l.valor > valorMax.value) return false
    if (busca.value) {
      const q = busca.value.toLowerCase()
      const hay = `${l.descricao} ${l.categoria || ''} ${l.observacao || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
})

function limparFiltros() {
  busca.value = ''
  filterTipo.value = 'all'
  filterStatus.value = 'all'
  filterCategoria.value = ''
  valorMin.value = null
  valorMax.value = null
}

const totaisFiltrados = computed(() => {
  const receitas = filtrados.value.filter(l => l.tipo === 'entrada').reduce((acc, l) => acc + Number(l.valor || 0), 0)
  const despesas = filtrados.value.filter(l => l.tipo === 'saida').reduce((acc, l) => acc + Number(l.valor || 0), 0)
  return { receitas, despesas, saldo: receitas - despesas }
})

const dizimoMes = computed(() => stats.value.receitaMes * 0.10)

const filtrosAtivos = computed(() => {
  let n = 0
  if (busca.value) n++
  if (filterTipo.value !== 'all') n++
  if (filterStatus.value !== 'all') n++
  if (filterCategoria.value) n++
  if (valorMin.value !== null) n++
  if (valorMax.value !== null) n++
  return n
})

const mesAtualLabel = computed(() => {
  const d = new Date()
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
})
</script>

<template>
  <div class="p-3 sm:p-6 md:p-10">
    <div class="max-w-[1400px] mx-auto space-y-4 sm:space-y-8">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div class="space-y-1 min-w-0">
          <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Financeiro</h1>
          <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm">
            Controle de receitas e despesas · <span class="capitalize">{{ mesAtualLabel }}</span>
          </p>
        </div>
        <div class="flex items-center gap-2 w-full sm:w-auto">
          <button
            @click="refresh"
            :disabled="isRefreshing"
            class="inline-flex items-center justify-center gap-2 w-10 h-10 sm:w-auto sm:h-auto sm:px-3.5 sm:py-2.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-semibold transition-colors shrink-0"
            type="button"
            aria-label="Atualizar"
          >
            <i class="fa-solid fa-arrows-rotate" :class="{ 'animate-spin': isRefreshing }" aria-hidden="true" />
            <span class="hidden sm:inline">Atualizar</span>
          </button>
          <button
            @click="novoLancamento('entrada')"
            class="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-3 sm:px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm shadow-emerald-600/30"
            type="button"
          >
            <i class="fa-solid fa-plus" aria-hidden="true" />
            <span class="sm:hidden">Receita</span>
            <span class="hidden sm:inline">Nova receita</span>
          </button>
          <button
            @click="novoLancamento('saida')"
            class="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-3 sm:px-3.5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm shadow-red-600/30"
            type="button"
          >
            <i class="fa-solid fa-plus" aria-hidden="true" />
            <span class="sm:hidden">Despesa</span>
            <span class="hidden sm:inline">Nova despesa</span>
          </button>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
        <AdminStatsCard
          title="Receita do mês"
          :value="formatBRL(stats.receitaMes)"
          icon="fa-arrow-trend-up"
          color="emerald"
        />
        <AdminStatsCard
          title="Despesa do mês"
          :value="formatBRL(stats.despesaMes)"
          icon="fa-arrow-trend-down"
          color="red"
        />
        <AdminStatsCard
          title="Saldo do mês"
          :value="formatBRL(stats.saldoMes)"
          icon="fa-scale-balanced"
          :color="stats.saldoMes >= 0 ? 'indigo' : 'orange'"
          :highlighted="stats.saldoMes < 0"
        />
        <AdminStatsCard
          title="Dízimo"
          :value="formatBRL(dizimoMes)"
          icon="fa-hand-holding-heart"
          color="purple"
        />
        <AdminStatsCard
          title="Vencidos"
          :value="stats.vencidosCount"
          icon="fa-triangle-exclamation"
          color="red"
          :highlighted="stats.vencidosCount > 0"
        />
      </div>

      <!-- Filtros -->
      <section class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:p-5 space-y-3 sm:space-y-4">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-filter text-slate-400" aria-hidden="true" />
            <h2 class="text-sm font-semibold text-slate-700 dark:text-slate-300">Filtros</h2>
            <span
              v-if="filtrosAtivos > 0"
              class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300"
            >{{ filtrosAtivos }}</span>
          </div>
          <button
            v-if="filtrosAtivos > 0"
            @click="limparFiltros"
            type="button"
            class="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 flex items-center gap-1.5"
          >
            <i class="fa-solid fa-xmark" aria-hidden="true" />
            Limpar
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div class="lg:col-span-2">
            <label for="fin-busca" class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Buscar</label>
            <div class="relative">
              <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" aria-hidden="true" />
              <input
                id="fin-busca"
                v-model="busca"
                type="search"
                placeholder="Descrição, categoria, observação…"
                class="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label for="fin-tipo" class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Tipo</label>
            <select id="fin-tipo" v-model="filterTipo" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white">
              <option value="all">Todos</option>
              <option value="entrada">Receitas</option>
              <option value="saida">Despesas</option>
            </select>
          </div>

          <div>
            <label for="fin-status" class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Status</label>
            <select id="fin-status" v-model="filterStatus" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white">
              <option value="all">Todos</option>
              <option value="em_dia">Em dia</option>
              <option value="proximo">Vence em breve</option>
              <option value="vence_hoje">Vence hoje</option>
              <option value="vencido">Vencido</option>
              <option value="pago">Pago</option>
            </select>
          </div>

          <div>
            <label for="fin-categoria" class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Categoria</label>
            <select id="fin-categoria" v-model="filterCategoria" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white">
              <option value="">Todas</option>
              <option v-for="c in categoriasDisponiveis" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label for="fin-min" class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Valor mín.</label>
              <input id="fin-min" v-model.number="valorMin" type="number" min="0" step="0.01" placeholder="R$ 0" class="w-full px-2 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white tabular-nums" />
            </div>
            <div>
              <label for="fin-max" class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Valor máx.</label>
              <input id="fin-max" v-model.number="valorMax" type="number" min="0" step="0.01" placeholder="R$ ∞" class="w-full px-2 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white tabular-nums" />
            </div>
          </div>
        </div>
      </section>

      <!-- Erro -->
      <div v-if="error" role="alert" class="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-4 text-red-700 dark:text-red-400 text-sm">
        {{ error }}
      </div>

      <!-- Resultado + totais do filtro -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm">
        <span class="text-slate-500 dark:text-slate-400">
          Mostrando <span class="font-semibold text-slate-900 dark:text-white tabular-nums">{{ filtrados.length }}</span>
          de <span class="font-semibold text-slate-900 dark:text-white tabular-nums">{{ lancamentos.length }}</span>
          lançamento{{ filtrados.length === 1 ? '' : 's' }}
        </span>
        <div v-if="filtrados.length > 0" class="flex items-center gap-2 flex-wrap text-xs">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">
            <i class="fa-solid fa-arrow-trend-up text-[10px]" aria-hidden="true" />
            Receitas: {{ formatBRL(totaisFiltrados.receitas) }}
          </span>
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 font-semibold tabular-nums">
            <i class="fa-solid fa-arrow-trend-down text-[10px]" aria-hidden="true" />
            Despesas: {{ formatBRL(totaisFiltrados.despesas) }}
          </span>
          <span
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold tabular-nums"
            :class="totaisFiltrados.saldo >= 0
              ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400'
              : 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400'"
          >
            <i class="fa-solid fa-scale-balanced text-[10px]" aria-hidden="true" />
            Saldo: {{ formatBRL(totaisFiltrados.saldo) }}
          </span>
          <span
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold tabular-nums bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400"
            title="10% das receitas do mês"
          >
            <i class="fa-solid fa-hand-holding-heart text-[10px]" aria-hidden="true" />
            Dízimo: {{ formatBRL(dizimoMes) }}
          </span>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading && lancamentos.length === 0" class="py-16 flex items-center justify-center gap-3 text-slate-400">
        <i class="fa-solid fa-circle-notch animate-spin" aria-hidden="true" />
        <span class="text-sm">Carregando lançamentos…</span>
      </div>

      <!-- Vazio -->
      <div v-else-if="filtrados.length === 0" class="py-16 text-center">
        <div class="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
          <i class="fa-solid fa-receipt text-2xl text-slate-400 dark:text-slate-600" aria-hidden="true" />
        </div>
        <p class="text-base font-semibold text-slate-700 dark:text-slate-300 mb-1">
          {{ lancamentos.length === 0 ? 'Nenhum lançamento ainda' : 'Nada encontrado com esses filtros' }}
        </p>
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-5">
          {{ lancamentos.length === 0
            ? 'Comece cadastrando sua primeira receita ou despesa'
            : 'Tente ajustar ou limpar os filtros' }}
        </p>
        <div v-if="lancamentos.length === 0" class="flex items-center justify-center gap-2">
          <button
            @click="novoLancamento('entrada')"
            class="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold"
            type="button"
          >
            <i class="fa-solid fa-plus" aria-hidden="true" />
            Receita
          </button>
          <button
            @click="novoLancamento('saida')"
            class="inline-flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold"
            type="button"
          >
            <i class="fa-solid fa-plus" aria-hidden="true" />
            Despesa
          </button>
        </div>
      </div>

      <!-- Lista -->
      <div v-else class="space-y-3">
        <FinanceiroLancamentoCard
          v-for="l in filtrados"
          :key="l.id"
          :lancamento="l"
          @editar="editarLancamento"
          @excluir="pedirExcluir"
          @toggle-pago="handleTogglePago"
        />
      </div>

      <!-- Modais -->
      <FinanceiroLancamentoModal
        :show="showLancModal"
        :tipo-inicial="tipoInicialModal"
        :lancamento="lancamentoEditando"
        :salvando="salvando"
        @close="showLancModal = false; lancamentoEditando = null"
        @submit="handleSubmitLancamento"
      />

      <AdminConfirmacaoModal
        :show="!!lancamentoParaExcluir"
        title="Excluir lançamento"
        message="Tem certeza que deseja excluir"
        :cliente-nome="lancamentoParaExcluir?.descricao"
        confirm-label="Excluir"
        variant="danger"
        @close="lancamentoParaExcluir = null"
        @confirm="confirmarExcluir"
      />
    </div>
  </div>
</template>
