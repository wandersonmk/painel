<script setup lang="ts">
// Cartão de resumo no estilo da referência do dono (09/10/2026): fundo suave
// colorido, ícone + título, um bloco branco com o valor principal e blocos
// menores com ícone, rótulo, valor e legenda. Usado no Dashboard e na página
// Clientes. Quem chama decide os números; aqui é só apresentação.
export interface TileResumo {
  label: string
  icon: string
  iconCls: string
  valor: string
  detalhe?: string
}

type Tom = 'lavanda' | 'menta' | 'ambar' | 'ceu'

interface Props {
  titulo: string
  icon: string
  tom: Tom
  principalLabel: string
  principal: string
  principalDetalhe?: string
  tiles: TileResumo[]
  nota?: string
  // false = dado ainda não chegou ou falhou: mostra "—" em vez de zeros.
  pronto?: boolean
  // Texto no lugar da legenda principal quando não está pronto.
  aviso?: string
  // Onde o bloco principal passa a ficar em cima dos menores. Antes disso
  // (a partir de sm) fica ao lado. 'nunca' = sempre ao lado a partir de sm.
  empilharEm?: 'lg' | 'xl' | 'nunca'
  tituloTag?: 'h2' | 'h3'
}

const props = withDefaults(defineProps<Props>(), {
  principalDetalhe: '',
  nota: '',
  pronto: true,
  aviso: 'Carregando…',
  empilharEm: 'xl',
  tituloTag: 'h3',
})

const TONS: Record<Tom, { card: string; icone: string }> = {
  lavanda: { card: 'bg-purple-50 dark:bg-purple-500/10', icone: 'bg-white text-purple-600 dark:bg-purple-500/15 dark:text-purple-300' },
  menta:   { card: 'bg-emerald-50 dark:bg-emerald-500/10', icone: 'bg-white text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300' },
  ambar:   { card: 'bg-amber-50 dark:bg-amber-500/10', icone: 'bg-white text-amber-600 dark:bg-amber-500/15 dark:text-amber-300' },
  ceu:     { card: 'bg-sky-50 dark:bg-sky-500/10', icone: 'bg-white text-sky-600 dark:bg-sky-500/15 dark:text-sky-300' },
}

// Classes estáticas (o Tailwind precisa enxergá-las inteiras no código).
const LAYOUT: Record<NonNullable<Props['empilharEm']>, { grade: string; menores: string }> = {
  lg:    { grade: 'sm:grid-cols-3 lg:grid-cols-1', menores: 'sm:col-span-2 lg:col-span-1' },
  xl:    { grade: 'sm:grid-cols-3 xl:grid-cols-1', menores: 'sm:col-span-2 xl:col-span-1' },
  nunca: { grade: 'sm:grid-cols-3', menores: 'sm:col-span-2' },
}
</script>

<template>
  <article class="rounded-2xl p-4 sm:p-5 flex flex-col min-w-0" :class="TONS[props.tom].card">
    <div class="flex items-center gap-2.5">
      <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm" :class="TONS[props.tom].icone">
        <i :class="['fa-solid', props.icon, 'text-sm']" aria-hidden="true" />
      </span>
      <component :is="props.tituloTag" class="text-[15px] font-medium text-slate-800 dark:text-slate-100">{{ props.titulo }}</component>
    </div>

    <div class="mt-3.5 grid grid-cols-1 gap-2" :class="LAYOUT[props.empilharEm].grade">
      <div class="min-w-0 rounded-xl bg-white/80 dark:bg-slate-900/60 px-4 py-3">
        <p class="text-xs text-slate-500 dark:text-slate-400">{{ props.principalLabel }}</p>
        <p class="mt-1 font-display text-2xl font-semibold leading-tight tabular-nums whitespace-nowrap text-slate-900 dark:text-white">
          {{ props.pronto ? props.principal : '—' }}
        </p>
        <p class="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
          {{ props.pronto ? props.principalDetalhe : props.aviso }}
        </p>
      </div>
      <div class="grid grid-cols-2 gap-2 min-w-0" :class="LAYOUT[props.empilharEm].menores">
        <div
          v-for="tile in props.tiles"
          :key="tile.label"
          class="min-w-0 rounded-xl bg-white/80 dark:bg-slate-900/60 px-3 py-2.5"
        >
          <p class="flex items-start gap-1.5 text-xs leading-snug text-slate-500 dark:text-slate-400">
            <i :class="['fa-solid', tile.icon, tile.iconCls, 'text-[11px] mt-0.5 shrink-0']" aria-hidden="true" />
            <span>{{ tile.label }}</span>
          </p>
          <p class="mt-1 text-base font-semibold tabular-nums whitespace-nowrap text-slate-900 dark:text-white">
            {{ props.pronto ? tile.valor : '—' }}
          </p>
          <p v-if="props.pronto && tile.detalhe" class="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{{ tile.detalhe }}</p>
        </div>
      </div>
    </div>

    <p v-if="props.nota" class="mt-2.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
      <i class="fa-solid fa-circle-info mr-1 text-slate-400 dark:text-slate-500" aria-hidden="true" />{{ props.nota }}
    </p>
  </article>
</template>
