<script setup lang="ts">
import { computed } from 'vue'

/** Rodapé de paginação das listas do financeiro. Some quando cabe tudo. */
interface Props { modelValue: number; total: number; tamanho: number }
const props = defineProps<Props>()
const emit = defineEmits<{ 'update:modelValue': [pagina: number] }>()

const paginas = computed(() => Math.max(1, Math.ceil(props.total / props.tamanho)))
const primeiro = computed(() => (props.modelValue - 1) * props.tamanho + 1)
const ultimo = computed(() => Math.min(props.modelValue * props.tamanho, props.total))

function ir(p: number) {
  emit('update:modelValue', Math.min(Math.max(1, p), paginas.value))
}

const btn = 'w-7 h-7 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 disabled:opacity-40 disabled:hover:text-slate-500 transition-colors'
</script>

<template>
  <div v-if="total > tamanho" class="flex items-center justify-between gap-3 pt-3 mt-1 border-t border-slate-100 dark:border-slate-800">
    <p class="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
      Mostrando <span class="font-semibold text-slate-700 dark:text-slate-200">{{ primeiro }}–{{ ultimo }}</span> de
      <span class="font-semibold text-slate-700 dark:text-slate-200">{{ total }}</span>
    </p>
    <div class="flex items-center gap-1.5">
      <button type="button" :class="btn" :disabled="modelValue <= 1" @click="ir(1)" aria-label="Primeira página">
        <i class="fa-solid fa-angles-left text-[10px]" aria-hidden="true" />
      </button>
      <button type="button" :class="btn" :disabled="modelValue <= 1" @click="ir(modelValue - 1)" aria-label="Página anterior">
        <i class="fa-solid fa-chevron-left text-[10px]" aria-hidden="true" />
      </button>
      <span class="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums px-1">{{ modelValue }} / {{ paginas }}</span>
      <button type="button" :class="btn" :disabled="modelValue >= paginas" @click="ir(modelValue + 1)" aria-label="Próxima página">
        <i class="fa-solid fa-chevron-right text-[10px]" aria-hidden="true" />
      </button>
      <button type="button" :class="btn" :disabled="modelValue >= paginas" @click="ir(paginas)" aria-label="Última página">
        <i class="fa-solid fa-angles-right text-[10px]" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
