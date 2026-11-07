<script setup lang="ts">
import { computed } from 'vue'
import { itensDoPlano, type RecursosPlano } from '~/utils/planosItens'

/**
 * O que vem e o que não vem num plano. Usado na aba Preços do admin, na tela
 * Preços do parceiro e na renovação do painel.
 */
const props = withDefaults(defineProps<{
  plano: RecursosPlano
  /** 2 = duas colunas a partir de sm (modal largo). */
  colunas?: 1 | 2
}>(), { colunas: 2 })

const itens = computed(() => itensDoPlano(props.plano))
const grade = computed(() => (props.colunas === 2 ? 'sm:grid-cols-2' : ''))
</script>

<template>
  <div class="space-y-4">
    <div>
      <p class="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Vem no plano</p>
      <ul class="grid gap-x-6 gap-y-1.5" :class="grade">
        <li v-for="i in itens.vem" :key="i.texto" class="flex items-start gap-2 text-[13px] leading-snug text-slate-700 dark:text-slate-200">
          <i class="fa-solid fa-check mt-[3px] shrink-0 text-[11px] text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <span class="min-w-0">
            {{ i.texto }}
            <span v-if="i.detalhe" class="block text-[11px] text-slate-500 dark:text-slate-400">{{ i.detalhe }}</span>
          </span>
        </li>
      </ul>
    </div>

    <div v-if="itens.naoVem.length">
      <p class="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Não vem no plano</p>
      <ul class="grid gap-x-6 gap-y-1.5" :class="grade">
        <li v-for="i in itens.naoVem" :key="i.texto" class="flex items-start gap-2 text-[13px] leading-snug text-slate-400 dark:text-slate-500">
          <i class="fa-solid fa-xmark mt-[3px] shrink-0 text-[11px]" aria-hidden="true" />
          <span class="min-w-0">{{ i.texto }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>
