<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

definePageMeta({
  middleware: ['auth', 'parceiro'],
  layout: 'parceiro',
})

const { resumo, loadingResumo, loadResumo } = useParceiro()
const { hideValues, init: initHideValues, toggle: toggleHideValues, mask: maskValue } = useHideValues()

const isRefreshing = ref(false)

async function refreshAll() {
  isRefreshing.value = true
  await loadResumo()
  isRefreshing.value = false
}

onMounted(async () => {
  initHideValues()
  await loadResumo()
})

const lancamentos = computed(() => resumo.value?.lancamentos ?? [])

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
}

function displayBRL(value: number) {
  return maskValue(formatBRL(value))
}

function formatDateStr(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function lancamentoStatusBadge(l: { status: string; liberar_em: string; repassado_em: string | null }) {
  if (l.status === 'a_liberar') {
    return { label: `A liberar em ${formatDateStr(l.liberar_em)}`, cls: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20' }
  }
  if (l.status === 'liberado') {
    return { label: 'Liberado', cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' }
  }
  if (l.status === 'repassado') {
    return { label: `Pago em ${formatDateStr(l.repassado_em)}`, cls: 'bg-slate-100 dark:bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-500/20' }
  }
  return { label: 'Estornado', cls: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20' }
}

function origemBadge(origem: string) {
  if (origem === 'stripe') return { label: 'Cartão', icon: 'fa-solid fa-credit-card' }
  if (origem === 'ajuste') return { label: 'Ajuste', icon: 'fa-solid fa-sliders' }
  return { label: 'PIX / Manual', icon: 'fa-brands fa-pix' }
}

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <div class="p-4 sm:p-6 md:p-8 space-y-6 max-w-[1100px] mx-auto w-full">

    <!-- Page Header -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
      <div>
        <h1 class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Extratos</h1>
        <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">Histórico completo das suas comissões</p>
      </div>
      <div class="flex items-center gap-2 w-full sm:w-auto">
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
          :disabled="isRefreshing || loadingResumo"
          class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm font-semibold transition-all duration-150 shadow-lg shadow-purple-600/30 dark:shadow-purple-600/20"
          type="button"
        >
          <i class="fa-solid fa-arrows-rotate text-sm" :class="{ 'animate-spin': isRefreshing }" aria-hidden="true" />
          <span>Atualizar</span>
        </button>
      </div>
    </div>

    <!-- Extrato -->
    <div :class="['overflow-hidden', cardBase]">
      <div v-if="loadingResumo" class="p-5 space-y-3">
        <div v-for="i in 5" :key="i" class="h-10 bg-slate-100 dark:bg-white/5 rounded animate-pulse" />
      </div>

      <div v-else-if="lancamentos.length === 0" class="px-5 py-12 text-center">
        <i class="fa-solid fa-receipt text-slate-300 dark:text-slate-700 text-2xl mb-2 block" aria-hidden="true" />
        <p class="text-slate-500 text-sm">Nenhum pagamento registrado ainda</p>
        <p class="text-slate-400 dark:text-slate-600 text-xs mt-1">Quando seus clientes pagarem, as comissões aparecem aqui.</p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-200 dark:border-white/5 bg-slate-50/60 dark:bg-white/[0.02]">
              <th class="text-left px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Pagamento</th>
              <th class="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Origem</th>
              <th class="hidden sm:table-cell text-right px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Valor pago</th>
              <th class="text-right px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Comissão</th>
              <th class="text-left px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-white/5">
            <tr
              v-for="l in lancamentos"
              :key="l.id"
              class="hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors"
              :class="{ 'opacity-60': l.status === 'estornado' }"
            >
              <td class="px-3 sm:px-5 py-3">
                <p class="text-sm font-medium text-slate-800 dark:text-white truncate max-w-[180px]">
                  {{ l.origem === 'ajuste' ? 'Ajuste de saldo' : l.empresa_nome }}
                </p>
                <p class="text-xs text-slate-500 mt-0.5">{{ formatDateStr(l.pago_em) }}</p>
              </td>
              <td class="hidden md:table-cell px-5 py-3">
                <span class="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <i :class="[origemBadge(l.origem).icon, 'text-[11px]']" aria-hidden="true" />
                  {{ origemBadge(l.origem).label }}
                </span>
              </td>
              <td class="hidden sm:table-cell px-5 py-3 text-right">
                <span class="text-slate-700 dark:text-slate-300 tabular-nums text-xs sm:text-sm whitespace-nowrap">
                  {{ l.origem === 'ajuste' ? '—' : displayBRL(l.valor_base) }}
                </span>
              </td>
              <td class="px-3 sm:px-5 py-3 text-right">
                <span
                  class="font-semibold tabular-nums text-xs sm:text-sm whitespace-nowrap"
                  :class="l.status === 'estornado'
                    ? 'text-slate-400 dark:text-slate-600 line-through'
                    : l.valor_comissao < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-700 dark:text-emerald-400'"
                >{{ displayBRL(l.valor_comissao) }}</span>
              </td>
              <td class="px-3 sm:px-5 py-3">
                <span
                  class="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium border whitespace-nowrap"
                  :class="lancamentoStatusBadge(l).cls"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
                  {{ lancamentoStatusBadge(l).label }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p v-if="!loadingResumo && lancamentos.length > 0" class="text-xs text-slate-400 dark:text-slate-600 flex items-center gap-1.5">
      <i class="fa-solid fa-circle-info text-[10px]" aria-hidden="true" />
      <span>Cada pagamento fica retido por 30 dias antes de entrar no saldo liberado. O saque é processado em até 24 horas, em dias úteis.</span>
    </p>

  </div>
</template>
