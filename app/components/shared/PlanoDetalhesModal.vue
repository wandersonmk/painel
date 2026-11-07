<script setup lang="ts">
import type { RecursosPlano } from '~/utils/planosItens'

/**
 * Janela "O que vem no plano": preços do crédito no topo e a lista do plano.
 * Admin (aba Preços) e parceiro (tela Preços) abrem a mesma.
 */
defineProps<{
  show: boolean
  plano: RecursosPlano | null
  /** Ex.: "Start 30 dias". Sem ele, o título usa o nome do plano. */
  titulo?: string
  /** Linhas de valor no topo: preço por faixa, revenda, ganho. */
  resumo?: { rotulo: string; valor: string; destaque?: boolean }[]
  /** Frase curta abaixo do resumo (ex.: validade e quais planos renova). */
  subtitulo?: string
  /** Aviso no rodapé. */
  nota?: string
}>()
defineEmits<{ close: [] }>()
</script>

<template>
  <BaseModal :show="show" :title="titulo || (plano ? `O que vem no ${plano.nome}` : 'O que vem no plano')" max-width="max-w-2xl" @close="$emit('close')">
    <p v-if="!plano" role="alert" class="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
      Não consegui carregar o que vem neste plano. Recarregue a página.
    </p>
    <div v-else class="space-y-5">
      <p v-if="subtitulo" class="-mt-1 text-sm text-slate-600 dark:text-slate-400">{{ subtitulo }}</p>

      <dl
        v-if="resumo?.length"
        class="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 dark:border-white/10 dark:bg-white/10"
        :class="resumo.length >= 4 ? 'sm:grid-cols-4' : resumo.length === 3 ? 'sm:grid-cols-3' : ''"
      >
        <div v-for="r in resumo" :key="r.rotulo" class="bg-slate-50 px-3.5 py-2.5 dark:bg-slate-900">
          <dt class="text-[11px] text-slate-500 dark:text-slate-400">{{ r.rotulo }}</dt>
          <dd
            class="mt-0.5 text-sm font-medium tabular-nums"
            :class="r.destaque ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-white'"
          >{{ r.valor }}</dd>
        </div>
      </dl>

      <PlanoRecursos :plano="plano" />

      <p
        v-if="nota"
        class="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2.5 text-[13px] leading-snug text-sky-900 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300"
      >
        <i class="fa-solid fa-circle-info mt-0.5 shrink-0 text-[12px]" aria-hidden="true" />
        <span>{{ nota }}</span>
      </p>

      <div class="flex justify-end">
        <button
          type="button"
          class="rounded-lg border border-slate-300 px-5 py-2 text-sm font-normal text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          @click="$emit('close')"
        >Fechar</button>
      </div>
    </div>
  </BaseModal>
</template>
