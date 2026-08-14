<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

definePageMeta({
  middleware: ['auth', 'parceiro'],
  layout: 'parceiro',
})

const { parceiro, checkParceiro } = useParceiro()
const { clientes, saldos, indicadores, loading, error, loadCarteira } = useParceiroLicencas()

const atualizando = ref(false)

async function recarregar() {
  atualizando.value = true
  await loadCarteira()
  atualizando.value = false
}

onMounted(async () => {
  await Promise.all([checkParceiro(), loadCarteira()])
})

// ───────── Filtros ─────────
type Aba = 'todos' | 'ativos' | 'vencendo' | 'vencidos' | 'bloqueados'
const aba = ref<Aba>('todos')
const busca = ref('')
const vencimentoDe = ref('')
const vencimentoAte = ref('')
const ordem = ref<'vencimento' | 'nome'>('vencimento')

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const clientesFiltrados = computed(() => {
  let lista = [...clientes.value]

  if (aba.value === 'ativos') lista = lista.filter(c => c.situacao === 'ativo')
  else if (aba.value === 'vencendo') lista = lista.filter(c => c.situacao === 'ativo' && c.dias_restantes !== null && c.dias_restantes <= 7)
  else if (aba.value === 'vencidos') lista = lista.filter(c => c.situacao === 'vencido')
  else if (aba.value === 'bloqueados') lista = lista.filter(c => c.situacao.startsWith('bloqueado'))

  const termo = normalizar(busca.value.trim())
  if (termo) {
    lista = lista.filter(c =>
      normalizar(c.empresa_nome).includes(termo)
      || normalizar(c.responsavel ?? '').includes(termo)
      || (c.telefone ?? '').includes(busca.value.replace(/\D/g, '')),
    )
  }
  if (vencimentoDe.value) {
    const de = new Date(`${vencimentoDe.value}T00:00:00`)
    lista = lista.filter(c => c.vencimento && new Date(c.vencimento) >= de)
  }
  if (vencimentoAte.value) {
    const ate = new Date(`${vencimentoAte.value}T23:59:59`)
    lista = lista.filter(c => c.vencimento && new Date(c.vencimento) <= ate)
  }

  if (ordem.value === 'nome') {
    lista.sort((a, b) => a.empresa_nome.localeCompare(b.empresa_nome, 'pt-BR'))
  }
  return lista
})

const temFiltro = computed(() =>
  aba.value !== 'todos' || !!busca.value.trim() || !!vencimentoDe.value || !!vencimentoAte.value,
)

function limparFiltros() {
  aba.value = 'todos'
  busca.value = ''
  vencimentoDe.value = ''
  vencimentoAte.value = ''
}

const abas = computed(() => [
  { id: 'todos' as const, label: 'Todos', total: indicadores.value?.total ?? 0, cor: 'slate' },
  { id: 'ativos' as const, label: 'Ativos', total: indicadores.value?.ativos ?? 0, cor: 'emerald' },
  { id: 'vencendo' as const, label: 'Vencendo em 7 dias', total: indicadores.value?.vencendo_7d ?? 0, cor: 'amber' },
  { id: 'vencidos' as const, label: 'Vencidos', total: indicadores.value?.vencidos ?? 0, cor: 'red' },
  { id: 'bloqueados' as const, label: 'Bloqueados', total: indicadores.value?.bloqueados_pelo_parceiro ?? 0, cor: 'orange' },
])

const CLASSES_ABA: Record<string, string> = {
  slate: 'border-slate-400 bg-slate-100 dark:bg-slate-500/15 text-slate-700 dark:text-slate-300',
  emerald: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  amber: 'border-amber-400 bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400',
  red: 'border-red-400 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-400',
  orange: 'border-orange-400 bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400',
}

const semSaldo = computed(() => saldos.value.mensal_30d < 1 && saldos.value.anual_12m < 1)
</script>

<template>
  <div class="p-4 sm:p-6 md:p-8 space-y-5 max-w-[1400px] mx-auto w-full">

    <!-- Cabeçalho -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Meus Clientes</h1>
        <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
          Renove, bloqueie e acompanhe os clientes vinculados a você
        </p>
      </div>
      <div class="flex items-center gap-2 w-full sm:w-auto">
        <!-- Saldo sempre à vista: é o que limita as ações desta página.
             Número em cima, o que ele compra embaixo — "3 × 30d" numa linha só
             obrigava a decifrar a abreviação. Zerado fica apagado. -->
        <div class="flex items-stretch rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 divide-x divide-slate-200 dark:divide-white/10 overflow-hidden">
          <div class="hidden sm:flex items-center gap-2 px-3">
            <i class="fa-solid fa-coins text-purple-500 text-xs" aria-hidden="true" />
            <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-tight">Créditos<br>disponíveis</span>
          </div>
          <div class="px-3.5 py-1.5 text-center min-w-[78px]">
            <p class="text-xl font-bold leading-none tabular-nums" :class="saldos.mensal_30d > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-300 dark:text-slate-600'">
              {{ saldos.mensal_30d }}
            </p>
            <p class="text-[10px] font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400 mt-0.5">de 30 dias</p>
          </div>
          <div class="px-3.5 py-1.5 text-center min-w-[78px]">
            <p class="text-xl font-bold leading-none tabular-nums" :class="saldos.anual_12m > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-300 dark:text-slate-600'">
              {{ saldos.anual_12m }}
            </p>
            <p class="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 mt-0.5">de 12 meses</p>
          </div>
        </div>
        <button
          @click="recarregar"
          :disabled="atualizando || loading"
          type="button"
          class="inline-flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-sm font-semibold transition-all duration-150 shadow-lg shadow-purple-600/30 dark:shadow-purple-600/20"
        >
          <i class="fa-solid fa-arrows-rotate text-sm" :class="{ 'animate-spin': atualizando }" aria-hidden="true" />
          <span class="hidden sm:inline">Atualizar</span>
        </button>
      </div>
    </div>

    <div v-if="error" class="p-4 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
      <span>{{ error }}</span>
    </div>

    <!-- Aviso de saldo zerado -->
    <div
      v-if="!loading && semSaldo && clientes.length > 0"
      class="rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-4 py-3 flex items-start gap-2.5"
    >
      <i class="fa-solid fa-circle-exclamation text-amber-600 dark:text-amber-400 text-sm mt-0.5" aria-hidden="true" />
      <p class="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
        Você está <strong>sem créditos</strong> — não é possível renovar nenhum cliente agora.
        <NuxtLink to="/parceiro/creditos" class="underline font-semibold hover:text-amber-900 dark:hover:text-amber-200">Solicitar créditos à Agzap</NuxtLink>.
      </p>
    </div>

    <!-- Abas / contadores -->
    <div class="flex flex-wrap gap-2">
      <button
        v-for="a in abas"
        :key="a.id"
        type="button"
        @click="aba = a.id"
        class="px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-150 flex items-center gap-1.5"
        :class="aba === a.id
          ? CLASSES_ABA[a.cor]
          : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20'"
      >
        {{ a.label }}
        <span class="tabular-nums opacity-70">{{ a.total }}</span>
      </button>
    </div>

    <!-- Busca / período / ordenação -->
    <div v-if="clientes.length > 0" class="flex flex-col lg:flex-row lg:items-center gap-2">
      <div class="relative flex-1 lg:flex-initial">
        <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" aria-hidden="true" />
        <input
          v-model="busca"
          type="search"
          placeholder="Nome, responsável ou telefone…"
          class="w-full lg:w-64 pl-8 pr-3 py-2 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-full text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">Venc.</span>
        <input v-model="vencimentoDe" type="date" title="Vencimento a partir de"
          class="flex-1 sm:w-32 px-2.5 py-2 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-full text-xs text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-500" />
        <span class="text-[10px] text-slate-400">até</span>
        <input v-model="vencimentoAte" type="date" title="Vencimento até"
          class="flex-1 sm:w-32 px-2.5 py-2 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-full text-xs text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-500" />
      </div>
      <div class="flex items-center gap-2 lg:ml-auto">
        <select
          v-model="ordem"
          class="px-3 py-2 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-full text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="vencimento">Ordenar por vencimento</option>
          <option value="nome">Ordenar por nome</option>
        </select>
        <button
          v-if="temFiltro"
          @click="limparFiltros"
          type="button"
          class="px-3 py-2 rounded-full text-xs font-semibold text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors whitespace-nowrap"
        >
          <i class="fa-solid fa-xmark text-[10px] mr-1" aria-hidden="true" />
          Limpar
        </button>
      </div>
    </div>

    <p v-if="!loading && clientes.length > 0" class="text-xs text-slate-400 dark:text-slate-600">
      Mostrando <strong class="text-slate-600 dark:text-slate-300">{{ clientesFiltrados.length }}</strong>
      de {{ clientes.length }} cliente{{ clientes.length > 1 ? 's' : '' }}
    </p>

    <ParceiroCarteiraTabela
      :clientes="clientesFiltrados"
      :saldos="saldos"
      :loading="loading"
      :parceiro-nome="parceiro?.nome"
      :mensagem-vazio="clientes.length === 0
        ? 'Nenhum cliente vinculado a você ainda'
        : 'Nenhum cliente com esses filtros'"
      @changed="loadCarteira()"
    >
      <template #vazio>
        <p v-if="clientes.length === 0" class="text-slate-400 dark:text-slate-600 text-xs mt-1">
          Quando a Agzap vincular clientes à sua conta, eles aparecem aqui.
        </p>
        <button v-else @click="limparFiltros" type="button" class="mt-3 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline">
          Limpar filtros
        </button>
      </template>
    </ParceiroCarteiraTabela>

    <p class="text-xs text-slate-400 dark:text-slate-600 flex items-start gap-1.5">
      <i class="fa-solid fa-circle-info text-[10px] mt-0.5" aria-hidden="true" />
      <span>
        Exclusão de clientes, quantidade de instâncias, números e assistentes são definidos pela Agzap.
        Use <strong>Ver detalhes</strong> (⋯) para solicitar.
      </span>
    </p>
  </div>
</template>
