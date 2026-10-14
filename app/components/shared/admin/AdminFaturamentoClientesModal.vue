<script setup lang="ts">
// "Quem está no faturamento" (14/10/2026, pedido do dono): os clientes de cada
// card do Dashboard (Mensal Stripe, Mensal Pix, Anuais) e quem ficou de fora,
// com o motivo. As listas vêm prontas do Dashboard, pela mesma regra
// `faturamento()` dos cards, então o total aqui bate com o card.
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import type { ItemFaturamento, MotivoForaFaturamento, AbaFaturamento, ListasFaturamento } from '~/composables/useAdminClientes'

const props = defineProps<{
  show: boolean
  aba: AbaFaturamento
  listas: ListasFaturamento
}>()
const emit = defineEmits<{ close: [] }>()

const abaAtual = ref<AbaFaturamento>('mensal_stripe')
watch(() => [props.show, props.aba] as const, ([aberto, aba]) => {
  if (aberto) abaAtual.value = aba
}, { immediate: true })

// Esc fecha (o BaseModal não trata teclado).
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
watch(() => props.show, (aberto) => {
  if (!import.meta.client) return
  if (aberto) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
}, { immediate: true })
onBeforeUnmount(() => {
  if (import.meta.client) window.removeEventListener('keydown', onKey)
})

const { mask } = useHideValues()
const brl = (v: number) => mask(v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const dataBR = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
function quando(d: number) {
  if (!Number.isFinite(d)) return ''
  if (d < 0) return `venceu há ${plural(-d, 'dia', 'dias')}`
  if (d === 0) return 'vence hoje'
  if (d === 1) return 'vence amanhã'
  return `em ${d} dias`
}

const ABAS: { key: AbaFaturamento; label: string; icon: string; cor: string }[] = [
  { key: 'mensal_stripe', label: 'Mensal · Stripe', icon: 'fa-credit-card', cor: 'text-sky-500' },
  { key: 'mensal_pix', label: 'Mensal · Pix', icon: 'fa-qrcode', cor: 'text-emerald-500' },
  { key: 'anual', label: 'Anuais', icon: 'fa-calendar-check', cor: 'text-amber-500' },
  { key: 'fora', label: 'Fora do faturamento', icon: 'fa-circle-minus', cor: 'text-slate-400' },
]
const contagem = (k: AbaFaturamento) =>
  k === 'anual' ? props.listas.anual.length + props.listas.semestral.length : props.listas[k].length

const MOTIVO: Record<MotivoForaFaturamento, { texto: string; cls: string }> = {
  vencido: { texto: 'Vencido', cls: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' },
  cancelado: { texto: 'Cancelado', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  teste: { texto: 'Em teste', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' },
  parceiro: { texto: 'Paga o parceiro', cls: 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300' },
  desativado: { texto: 'Desativado', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  sem_valor: { texto: 'Sem valor cadastrado', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  nao_pagante: { texto: 'Não pagante', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
}
const ORDEM_MOTIVO = Object.keys(MOTIVO) as MotivoForaFaturamento[]

// Mais perto de vencer primeiro (igual à lista de Clientes); sem data vai pro fim.
const porVencimento = (l: ItemFaturamento[]) =>
  l.slice().sort((a, b) => (a.dias - b.dias) || a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
const porMotivo = (l: ItemFaturamento[]) =>
  l.slice().sort((a, b) =>
    (ORDEM_MOTIVO.indexOf(a.motivo!) - ORDEM_MOTIVO.indexOf(b.motivo!))
    || a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))

interface Bloco {
  titulo: string | null
  itens: ItemFaturamento[]
  colValor: string
  total: string | null
}
const somar = (l: ItemFaturamento[]) => l.reduce((s, i) => s + i.valor, 0)
const blocos = computed<Bloco[]>(() => {
  const L = props.listas
  const aba = abaAtual.value
  if (aba === 'fora') {
    return [{ titulo: null, itens: porMotivo(L.fora), colValor: 'Motivo', total: null }]
  }
  if (aba === 'anual') {
    const b: Bloco[] = [{ titulo: null, itens: porVencimento(L.anual), colValor: 'Valor do ano', total: `${brl(somar(L.anual))} no ano` }]
    if (L.semestral.length) {
      b.push({ titulo: 'Semestrais', itens: porVencimento(L.semestral), colValor: 'Por mês', total: `${brl(somar(L.semestral))} por mês` })
    }
    return b
  }
  const l = L[aba]
  return [{ titulo: null, itens: porVencimento(l), colValor: 'Por mês', total: `${brl(somar(l))} por mês` }]
})
</script>

<template>
  <BaseModal :show="show" title="Quem está no faturamento" max-width="max-w-3xl" @close="emit('close')">
    <div class="space-y-4">
      <div class="flex flex-wrap gap-2" role="tablist" aria-label="Grupos do faturamento">
        <button
          v-for="a in ABAS"
          :key="a.key"
          type="button"
          role="tab"
          :aria-selected="abaAtual === a.key"
          class="inline-flex items-center gap-2 h-9 px-3 rounded-full border text-sm transition-colors"
          :class="abaAtual === a.key
            ? 'bg-purple-600 border-purple-600 text-white'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'"
          @click="abaAtual = a.key"
        >
          <i :class="['fa-solid', a.icon, 'text-xs', abaAtual === a.key ? 'text-white' : a.cor]" aria-hidden="true" />
          {{ a.label }}
          <span
            class="text-[11px] tabular-nums px-1.5 rounded-full"
            :class="abaAtual === a.key ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'"
          >{{ contagem(a.key) }}</span>
        </button>
      </div>

      <template v-for="(bloco, idx) in blocos" :key="idx">
        <p v-if="bloco.titulo" class="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{{ bloco.titulo }}</p>

        <div v-if="bloco.itens.length" class="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div class="hidden sm:grid grid-cols-[1fr_150px_190px] gap-3 px-4 py-2 text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/40">
            <span>Cliente</span>
            <span class="text-right">{{ bloco.colValor }}</span>
            <span class="text-right">Vencimento</span>
          </div>
          <div class="divide-y divide-slate-100 dark:divide-slate-800">
            <div
              v-for="i in bloco.itens"
              :key="i.id"
              class="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_150px_190px] gap-x-3 gap-y-0.5 px-4 py-2.5 items-center"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{{ i.nome }}</p>
                <p v-if="i.responsavel" class="text-[11px] text-slate-500 dark:text-slate-400 truncate">{{ i.responsavel }}</p>
              </div>
              <div class="text-right">
                <span
                  v-if="i.motivo"
                  class="inline-flex px-2 py-0.5 rounded-full text-[11px] whitespace-nowrap"
                  :class="MOTIVO[i.motivo].cls"
                >{{ MOTIVO[i.motivo].texto }}</span>
                <span v-else class="text-sm tabular-nums whitespace-nowrap text-slate-900 dark:text-white">{{ brl(i.valor) }}</span>
              </div>
              <p class="col-span-2 sm:col-span-1 sm:text-right text-[11px] sm:text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {{ dataBR(i.vencimento) }}
                <span
                  v-if="quando(i.dias)"
                  :class="i.dias < 0 ? 'text-red-500' : i.dias <= 7 ? 'text-amber-600 dark:text-amber-400' : ''"
                >· {{ quando(i.dias) }}</span>
              </p>
            </div>
          </div>
          <div v-if="bloco.total" class="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800">
            <span class="text-sm text-slate-600 dark:text-slate-300">Total · {{ plural(bloco.itens.length, 'cliente', 'clientes') }}</span>
            <span class="text-sm font-medium tabular-nums text-slate-900 dark:text-white">{{ bloco.total }}</span>
          </div>
        </div>
        <p v-else class="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Nenhum cliente nesta lista.
        </p>
      </template>
    </div>
  </BaseModal>
</template>
