<script setup lang="ts">
import { ref, watch, computed } from 'vue'

// Saldo do programa de indicação da empresa (como indicadora): 1 linha por
// mês de ganho. O desconto é aplicado à parte (na cobrança); aqui a Agzap DÁ
// BAIXA no que foi usado — com a descrição que a indicadora vê no "Registro
// de ganhos" — ou CANCELA um mês que não vale (estorno, chargeback, erro).
const props = defineProps<{ show: boolean; clienteId: string | null; clienteNome: string }>()
const emit = defineEmits<{ close: []; usado: [valor: number] }>()

interface Item {
  id: string; status: string; valor: number; valorBase: number; percentual: number
  parcela: number | null; parcelasTotal: number | null; tipo: string; indicada: string | null
  liberarEm: string | null; liberadoEm: string | null; utilizadoEm: string | null
  utilizadoDescricao: string | null; motivo: string | null; estornadoEm: string | null
}
interface Saldo { disponivel: number; pendente: number; programado: number; naFatura: number; utilizado: number; itens: Item[] }

const saldo = ref<Saldo | null>(null)
const carregando = ref(false)
const erro = ref('')
const aviso = ref('')
const valor = ref<number | null>(null)
const descricao = ref('')
const salvando = ref(false)

function brl(v: number) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function data(iso: string | null) { return iso ? new Date(iso).toLocaleDateString('pt-BR') : '' }

function ehProgramado(i: Item) { return i.status === 'pendente_liberacao' && Number(i.parcela || 1) > 1 }
function mes(i: Item) {
  const total = Number(i.parcelasTotal || 1)
  if (total > 1) return `Mês ${i.parcela}/${total}`
  return i.tipo === 'primeira' ? '1ª mensalidade' : 'Mensalidade'
}
function situacao(i: Item): { texto: string; cls: string } {
  if (i.status === 'liberado') return { texto: 'Disponível', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' }
  if (ehProgramado(i)) return { texto: `Programado · ${data(i.liberarEm)}`, cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400' }
  if (i.status === 'pendente_liberacao') return { texto: `Carência · ${data(i.liberarEm)}`, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' }
  if (i.status === 'utilizado') return { texto: `Utilizado · ${data(i.utilizadoEm)}`, cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400' }
  if (i.status === 'creditado') return { texto: 'Na fatura (Stripe)', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400' }
  if (i.status === 'estornado') return { texto: `Estornado · ${data(i.estornadoEm)}`, cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' }
  return { texto: `Cancelado · ${data(i.estornadoEm)}`, cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' }
}
const inativo = (i: Item) => ['cancelado', 'estornado'].includes(i.status)

// Agrupa por indicada (o nome é longo; não repete em cada linha) e ordena os
// meses pela data de liberação.
const grupos = computed(() => {
  const mapa = new Map<string, Item[]>()
  for (const i of saldo.value?.itens || []) {
    const k = i.indicada || 'Indicada'
    mapa.set(k, [...(mapa.get(k) || []), i])
  }
  return [...mapa.entries()].map(([nome, itens]) => ({
    nome,
    itens: [...itens].sort((a, b) => String(a.liberarEm || '').localeCompare(String(b.liberarEm || ''))),
  }))
})

async function carregar() {
  if (!props.clienteId) return
  carregando.value = true
  erro.value = ''
  try {
    saldo.value = await $fetch<Saldo>('/api/admin/indicacao-saldo', { query: { empresaId: props.clienteId }, headers: await useAdminAuthHeaders() })
    valor.value = saldo.value.disponivel || null
  } catch (e: any) {
    erro.value = e?.data?.statusMessage || e?.statusMessage || 'Não foi possível carregar o saldo'
  } finally {
    carregando.value = false
  }
}
watch(() => [props.show, props.clienteId], ([s]) => {
  if (s) { descricao.value = ''; aviso.value = ''; acaoEm.value = null; void carregar() }
}, { immediate: true })

// Baixa por VALOR (consome os meses disponíveis do mais antigo; divide se precisar).
async function usar() {
  if (!props.clienteId || !valor.value || !descricao.value.trim() || salvando.value) return
  salvando.value = true
  erro.value = ''
  try {
    await $fetch('/api/admin/indicacao-usar-saldo', {
      method: 'POST', headers: await useAdminAuthHeaders(),
      body: { empresaId: props.clienteId, valor: valor.value, descricao: descricao.value.trim() },
    })
    emit('usado', valor.value)
    aviso.value = `Baixa de ${brl(valor.value)} registrada.`
    descricao.value = ''
    await carregar()
  } catch (e: any) {
    erro.value = e?.data?.statusMessage || e?.statusMessage || 'Não foi possível registrar a baixa'
  } finally {
    salvando.value = false
  }
}

// Ação em UM mês: dar baixa (utilizado) ou cancelar.
const acaoEm = ref<{ id: string; acao: 'utilizar' | 'cancelar' } | null>(null)
const textoAcao = ref('')
const salvandoAcao = ref(false)
function abrirAcao(i: Item, acao: 'utilizar' | 'cancelar') {
  acaoEm.value = { id: i.id, acao }
  textoAcao.value = ''
  erro.value = ''
}
async function confirmarAcao(i: Item) {
  if (!acaoEm.value || !textoAcao.value.trim() || salvandoAcao.value) return
  salvandoAcao.value = true
  erro.value = ''
  try {
    await $fetch('/api/admin/indicacao-comissao-acao', {
      method: 'POST', headers: await useAdminAuthHeaders(),
      body: { comissaoId: i.id, acao: acaoEm.value.acao, descricao: textoAcao.value.trim() },
    })
    if (acaoEm.value.acao === 'utilizar') emit('usado', i.valor)
    aviso.value = acaoEm.value.acao === 'utilizar'
      ? `${mes(i)} (${brl(i.valor)}) marcado como utilizado.`
      : `${mes(i)} (${brl(i.valor)}) cancelado.`
    acaoEm.value = null
    await carregar()
  } catch (e: any) {
    erro.value = e?.data?.statusMessage || e?.statusMessage || 'Não foi possível salvar'
  } finally {
    salvandoAcao.value = false
  }
}
</script>

<template>
  <BaseModal :show="show" title="Saldo de indicação" max-width="max-w-3xl" @close="$emit('close')">
    <p class="text-sm text-slate-600 dark:text-slate-400 mb-3">
      Descontos que <span class="font-semibold text-slate-900 dark:text-white">{{ clienteNome }}</span> ganhou indicando outras empresas.
    </p>
    <div v-if="carregando && !saldo" class="py-8 text-center text-sm text-slate-500">Carregando…</div>
    <template v-else-if="saldo">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <div class="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2">
          <p class="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Disponível</p>
          <p class="text-base font-bold text-emerald-700 dark:text-emerald-400">{{ brl(saldo.disponivel) }}</p>
        </div>
        <div class="rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2">
          <p class="text-[10px] font-bold uppercase tracking-wide text-slate-500">Em carência</p>
          <p class="text-base font-bold text-amber-600">{{ brl(saldo.pendente) }}</p>
        </div>
        <div class="rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2" title="Meses seguintes do plano anual das indicadas: liberam um por mês, na data da renovação">
          <p class="text-[10px] font-bold uppercase tracking-wide text-slate-500">Próximos meses</p>
          <p class="text-base font-bold text-violet-600">{{ brl(saldo.programado) }}</p>
        </div>
        <div class="rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2" :title="saldo.naFatura > 0 ? `Inclui ${brl(saldo.naFatura)} que foram pro saldo do Stripe (regra antiga)` : ''">
          <p class="text-[10px] font-bold uppercase tracking-wide text-slate-500">Utilizado</p>
          <p class="text-base font-bold text-sky-600">{{ brl(saldo.utilizado + saldo.naFatura) }}</p>
        </div>
      </div>

      <!-- Baixa por valor (desconto aplicado na mensalidade) -->
      <form v-if="saldo.disponivel > 0" class="flex flex-col sm:flex-row gap-2 mb-3" @submit.prevent="usar">
        <input v-model.number="valor" type="number" min="0.01" step="0.01" :max="saldo.disponivel" class="sm:w-28 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-sm" aria-label="Valor" />
        <input v-model="descricao" type="text" maxlength="200" placeholder="Em quê? Ex.: Desconto na mensalidade de novembro/2026" class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-sm" />
        <button type="submit" class="px-4 py-2 rounded-lg font-semibold bg-purple-600 hover:bg-purple-700 text-white text-sm whitespace-nowrap disabled:opacity-50" :disabled="salvando || !valor || !descricao.trim()">
          {{ salvando ? 'Registrando…' : `Dar baixa de ${brl(valor || 0)}` }}
        </button>
      </form>
      <p v-else class="text-xs text-slate-500 mb-3">Nada disponível pra dar baixa agora. Os meses liberam nas datas abaixo.</p>

      <p v-if="aviso" class="text-xs rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-3 py-2 mb-2">{{ aviso }}</p>
      <p v-if="erro" class="text-sm text-red-600 mb-2">{{ erro }}</p>

      <div v-if="grupos.length" class="max-h-[46vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <template v-for="g in grupos" :key="g.nome">
          <p class="sticky top-0 z-10 px-3 py-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-800 truncate">{{ g.nome }}</p>
          <div v-for="i in g.itens" :key="i.id" class="border-b last:border-b-0 border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-3 px-3 py-1.5 text-xs" :class="inativo(i) ? 'opacity-60' : ''">
              <span class="w-24 shrink-0 font-semibold text-slate-800 dark:text-slate-200">{{ mes(i) }}</span>
              <span class="hidden sm:inline w-32 shrink-0 text-slate-500">{{ i.percentual }}% de {{ brl(i.valorBase) }}</span>
              <span class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap" :class="situacao(i).cls">{{ situacao(i).texto }}</span>
              <span class="flex-1 min-w-0 truncate text-slate-500" :title="i.utilizadoDescricao || i.motivo || ''">{{ i.utilizadoDescricao || i.motivo || '' }}</span>
              <span class="shrink-0 font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{{ brl(i.valor) }}</span>
              <span class="shrink-0 flex gap-1 w-[118px] justify-end">
                <button
                  v-if="i.status === 'liberado'"
                  type="button"
                  class="px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                  title="Marcar como usado em desconto"
                  @click="abrirAcao(i, 'utilizar')"
                >Dar baixa</button>
                <button
                  v-if="i.status === 'liberado' || i.status === 'pendente_liberacao'"
                  type="button"
                  class="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                  title="Cancelar este mês (estorno, chargeback, erro)"
                  @click="abrirAcao(i, 'cancelar')"
                >Cancelar</button>
              </span>
            </div>
            <form v-if="acaoEm?.id === i.id" class="flex flex-col sm:flex-row gap-2 px-3 pb-2" @submit.prevent="confirmarAcao(i)">
              <input
                v-model="textoAcao"
                type="text"
                maxlength="200"
                :placeholder="acaoEm.acao === 'utilizar' ? 'Ex.: Desconto na mensalidade de novembro/2026' : 'Motivo. Ex.: Chargeback da indicada'"
                class="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-xs"
              />
              <div class="flex gap-2">
                <button type="button" class="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs" :disabled="salvandoAcao" @click="acaoEm = null">Voltar</button>
                <button
                  type="submit"
                  class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                  :class="acaoEm.acao === 'utilizar' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'"
                  :disabled="salvandoAcao || !textoAcao.trim()"
                >
                  {{ salvandoAcao ? 'Salvando…' : acaoEm.acao === 'utilizar' ? `Dar baixa de ${brl(i.valor)}` : `Cancelar ${brl(i.valor)}` }}
                </button>
              </div>
            </form>
          </div>
        </template>
      </div>
      <p v-else class="text-xs text-slate-500">Essa empresa ainda não ganhou desconto por indicação.</p>
      <p class="text-[11px] text-slate-500 mt-2">A descrição da baixa ou o motivo do cancelamento aparecem para o cliente no Registro de ganhos.</p>
    </template>
    <p v-else-if="erro" class="text-sm text-red-600">{{ erro }}</p>
  </BaseModal>
</template>
