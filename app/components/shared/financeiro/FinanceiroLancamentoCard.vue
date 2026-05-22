<script setup lang="ts">
import { computed } from 'vue'
import { type FinanceiroLancamento, type FinanceiroStatus, statusDoLancamento, statusLabel, formatBRL, formatDateBR } from '~/composables/useFinanceiro'

const props = defineProps<{ lancamento: FinanceiroLancamento }>()
defineEmits<{
  editar: [l: FinanceiroLancamento]
  excluir: [l: FinanceiroLancamento]
  'toggle-pago': [l: FinanceiroLancamento]
}>()

const status = computed<FinanceiroStatus>(() => statusDoLancamento(props.lancamento))
const isEntrada = computed(() => props.lancamento.tipo === 'entrada')

const styleMap: Record<FinanceiroStatus, { border: string; dot: string; badge: string; ring: string }> = {
  pago:       { border: 'border-l-emerald-500',          dot: 'bg-emerald-500',                        badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',   ring: '' },
  em_dia:     { border: 'border-l-emerald-500',          dot: 'bg-emerald-500',                        badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',   ring: '' },
  proximo:    { border: 'border-l-amber-500',            dot: 'bg-amber-500 animate-pulse',            badge: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',           ring: 'ring-1 ring-amber-200/60 dark:ring-amber-500/20' },
  vence_hoje: { border: 'border-l-red-500',              dot: 'bg-red-500 animate-pulse',              badge: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',                   ring: 'ring-1 ring-red-200/70 dark:ring-red-500/20' },
  vencido:    { border: 'border-l-red-600',              dot: 'bg-red-600 animate-pulse',              badge: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',                   ring: 'ring-1 ring-red-300/70 dark:ring-red-500/30' },
}
const styles = computed(() => styleMap[status.value])

const valorClass = computed(() => isEntrada.value
  ? 'text-emerald-600 dark:text-emerald-400'
  : 'text-red-600 dark:text-red-400')

const tipoIcon = computed(() => isEntrada.value ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down')
const tipoBg = computed(() => isEntrada.value
  ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
  : 'bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400')
</script>

<template>
  <article
    class="group relative rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 border-l-4 shadow-sm hover:shadow-md transition-all duration-150 overflow-hidden"
    :class="[styles.border, styles.ring]"
  >
    <div class="p-3 sm:p-4">
      <div class="flex items-start gap-3 sm:gap-4">
        <!-- Avatar tipo -->
        <div class="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0" :class="tipoBg">
          <i :class="['fa-solid', tipoIcon]" aria-hidden="true" />
        </div>

        <!-- Conteúdo -->
        <div class="flex-1 min-w-0 space-y-1.5">
          <!-- Linha 1: descricao + status -->
          <div class="flex items-start gap-2 flex-wrap">
            <h3 class="font-semibold text-slate-900 dark:text-white text-sm leading-tight truncate flex-1 min-w-0">
              {{ lancamento.descricao }}
            </h3>
            <span
              class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0"
              :class="styles.badge"
            >
              <span class="w-1.5 h-1.5 rounded-full" :class="styles.dot" aria-hidden="true" />
              {{ statusLabel(status, lancamento.tipo) }}
            </span>
          </div>

          <!-- Linha 2: meta info -->
          <div class="flex items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
            <span v-if="lancamento.categoria" class="inline-flex items-center gap-1.5">
              <i class="fa-solid fa-tag text-[10px]" aria-hidden="true" />
              <span class="capitalize">{{ lancamento.categoria }}</span>
            </span>
            <span v-if="!isEntrada && lancamento.data_vencimento" class="inline-flex items-center gap-1.5">
              <i class="fa-solid fa-calendar-day text-[10px]" aria-hidden="true" />
              <span class="tabular-nums">Venc.: {{ formatDateBR(lancamento.data_vencimento) }}</span>
            </span>
            <span v-if="lancamento.data_pagamento" class="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
              <i class="fa-solid fa-check-circle text-[10px]" aria-hidden="true" />
              <span class="tabular-nums">{{ isEntrada ? 'Recebido' : 'Pago' }} em {{ formatDateBR(lancamento.data_pagamento) }}</span>
            </span>
            <span v-if="isEntrada" class="inline-flex items-center gap-1.5 text-purple-600 dark:text-purple-400 font-medium" title="10% desta receita">
              <i class="fa-solid fa-hand-holding-heart text-[10px]" aria-hidden="true" />
              <span class="tabular-nums">Dízimo: {{ formatBRL(lancamento.valor * 0.10) }}</span>
            </span>
          </div>

          <!-- Observação -->
          <p v-if="lancamento.observacao" class="text-xs text-slate-500 dark:text-slate-400 italic line-clamp-1">
            {{ lancamento.observacao }}
          </p>
        </div>

        <!-- Valor + ações (desktop / sm+) -->
        <div class="hidden sm:flex flex-col items-end gap-2 shrink-0">
          <span class="text-lg font-bold tabular-nums leading-none whitespace-nowrap" :class="valorClass">
            {{ isEntrada ? '+' : '−' }} {{ formatBRL(lancamento.valor) }}
          </span>

          <div class="flex items-center gap-1">
            <button
              @click="$emit('toggle-pago', lancamento)"
              class="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
              :class="lancamento.data_pagamento
                ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'"
              :title="lancamento.data_pagamento ? 'Marcar como em aberto' : 'Marcar como pago'"
              type="button"
              :aria-label="lancamento.data_pagamento ? 'Marcar como em aberto' : 'Marcar como pago'"
            >
              <i class="fa-solid text-xs" :class="lancamento.data_pagamento ? 'fa-rotate-left' : 'fa-check'" aria-hidden="true" />
            </button>
            <button
              @click="$emit('editar', lancamento)"
              class="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
              title="Editar"
              type="button"
              aria-label="Editar"
            >
              <i class="fa-solid fa-pen text-xs" aria-hidden="true" />
            </button>
            <button
              @click="$emit('excluir', lancamento)"
              class="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              title="Excluir"
              type="button"
              aria-label="Excluir"
            >
              <i class="fa-solid fa-trash text-xs" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <!-- Valor + ações (mobile) -->
      <div class="sm:hidden mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
        <span class="text-lg font-bold tabular-nums" :class="valorClass">
          {{ isEntrada ? '+' : '−' }} {{ formatBRL(lancamento.valor) }}
        </span>
        <div class="flex items-center gap-1">
          <button
            @click="$emit('toggle-pago', lancamento)"
            class="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
            :class="lancamento.data_pagamento
              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'"
            :aria-label="lancamento.data_pagamento ? 'Marcar como em aberto' : 'Marcar como pago'"
            type="button"
          >
            <i class="fa-solid text-sm" :class="lancamento.data_pagamento ? 'fa-rotate-left' : 'fa-check'" aria-hidden="true" />
          </button>
          <button
            @click="$emit('editar', lancamento)"
            class="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50"
            aria-label="Editar"
            type="button"
          >
            <i class="fa-solid fa-pen text-sm" aria-hidden="true" />
          </button>
          <button
            @click="$emit('excluir', lancamento)"
            class="w-9 h-9 flex items-center justify-center rounded-lg text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10"
            aria-label="Excluir"
            type="button"
          >
            <i class="fa-solid fa-trash text-sm" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  </article>
</template>
