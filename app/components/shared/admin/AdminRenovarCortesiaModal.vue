<script setup lang="ts">
import { computed, ref, watch } from 'vue'

/**
 * "Renovar pela Agzap": cortesia para um cliente de parceiro, sem gastar
 * crédito do parceiro e sem gerar desconto de indicação.
 * As datas vêm da rota (previa: true), com a mesma conta que grava de verdade:
 * a tela nunca manda data para o servidor.
 */
type Periodo = '30d' | '12m'

interface Previa {
  empresaNome: string
  vencimentoAtual: string | null
  diasParaVencer: number | null
  contaDe: 'vencimento' | 'hoje'
  novos: Record<Periodo, string>
  bloqueio: 'parceiro' | 'admin' | null
}

const props = defineProps<{
  show: boolean
  cliente: { empresa_id: string; empresa_nome: string } | null
  parceiroNome?: string | null
}>()
const emit = defineEmits<{ close: []; renovado: [] }>()

const ROTA = '/api/admin/parceiros/renovar-cortesia'

const periodo = ref<Periodo>('30d')
const motivo = ref('')
const carregando = ref(false)
const salvando = ref(false)
const previa = ref<Previa | null>(null)
const erro = ref<string | null>(null)

// Cópia do cliente: o conteúdo não some enquanto o modal esmaece (a página
// zera o alvo e recarrega a lista no mesmo instante).
const alvo = ref(props.cliente)
const parceiro = ref(props.parceiroNome ?? null)
watch(() => props.cliente, (c) => { if (c) alvo.value = c })
watch(() => props.parceiroNome, (n) => { if (n) parceiro.value = n })

const fmtData = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
const fmt = (iso: string | null | undefined) => (iso ? fmtData.format(new Date(iso)) : 'sem vencimento')

const situacao = computed(() => {
  const d = previa.value?.diasParaVencer
  if (d === null || d === undefined) return 'Vencimento atual'
  if (d < -1) return `Venceu há ${-d} dias`
  if (d === -1) return 'Venceu ontem'
  if (d === 0) return 'Vence hoje'
  if (d === 1) return 'Vence amanhã'
  return `Vence em ${d} dias`
})
const contaDeTexto = computed(() => {
  const p = previa.value
  if (!p) return ''
  if (p.contaDe === 'vencimento') return 'Conta a partir do vencimento atual.'
  return p.vencimentoAtual ? 'O vencimento já passou: conta a partir de hoje.' : 'Sem vencimento cadastrado: conta a partir de hoje.'
})
const novoVencimento = computed(() => previa.value?.novos?.[periodo.value] ?? null)

// Só ao abrir: fechar não limpa a prévia (senão o conteúdo pisca no esmaecer).
// `pedido` descarta a resposta de uma abertura anterior que chegue atrasada.
let pedido = 0
watch(() => [props.show, props.cliente?.empresa_id] as const, async ([aberto, empresaId]) => {
  if (!aberto || !empresaId) return
  const meu = ++pedido
  previa.value = null
  erro.value = null
  periodo.value = '30d'
  motivo.value = ''
  carregando.value = true
  try {
    const resp = await $fetch<{ success: boolean; data?: Previa; error?: string }>(ROTA, {
      method: 'POST',
      body: { empresaId, previa: true },
      headers: await useAdminAuthHeaders(),
    })
    if (meu !== pedido) return
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Não foi possível carregar.')
    previa.value = resp.data
  } catch (e: any) {
    if (meu === pedido) erro.value = e?.data?.statusMessage || e?.message || 'Não foi possível carregar.'
  } finally {
    if (meu === pedido) carregando.value = false
  }
}, { immediate: true })

function fechar() {
  if (!salvando.value) emit('close')
}

async function renovar() {
  if (!props.show || !alvo.value || !previa.value || salvando.value) return
  salvando.value = true
  const toast = await useToastSafe()
  try {
    const resp = await $fetch<{
      success: boolean
      error?: string
      data?: { novoVencimento: string; periodo: Periodo; comissoesCanceladas: number; avisoComissoes?: string | null }
    }>(ROTA, {
      method: 'POST',
      body: {
        empresaId: alvo.value.empresa_id,
        periodo: periodo.value,
        motivo: motivo.value.trim() || undefined,
      },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Erro')
    const n = resp.data.comissoesCanceladas || 0
    toast.success(`Renovado pela Agzap até ${fmt(resp.data.novoVencimento)}${n ? ` · ${n} ${n === 1 ? 'comissão cancelada' : 'comissões canceladas'}` : ''}`)
    if (resp.data.avisoComissoes) toast.warning(resp.data.avisoComissoes)
    emit('renovado')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.message || 'Erro ao renovar')
  } finally {
    salvando.value = false
  }
}

const opcoes: { key: Periodo; label: string }[] = [
  { key: '30d', label: '30 dias' },
  { key: '12m', label: '12 meses' },
]
</script>

<template>
  <BaseModal :show="show" title="Renovar pela Agzap" max-width="max-w-md" @close="fechar">
    <div v-if="alvo" class="space-y-4">
      <div class="min-w-0">
        <p class="text-sm text-slate-900 dark:text-white break-words">{{ previa?.empresaNome || alvo.empresa_nome }}</p>
        <p v-if="parceiro" class="text-xs text-slate-500 dark:text-slate-400 break-words">Parceiro: {{ parceiro }}</p>
      </div>

      <div v-if="carregando" class="py-6 flex justify-center text-slate-400">
        <i class="fa-solid fa-spinner fa-spin" aria-hidden="true" />
      </div>

      <p v-else-if="erro" role="alert" class="text-sm text-red-600 dark:text-red-400">{{ erro }}</p>

      <template v-else-if="previa">
        <!-- Período -->
        <div>
          <span id="cortesia-periodo" class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Período</span>
          <div role="radiogroup" aria-labelledby="cortesia-periodo" class="grid grid-cols-2 gap-1 h-10 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10">
            <button
              v-for="o in opcoes"
              :key="o.key"
              type="button"
              role="radio"
              :aria-checked="periodo === o.key"
              class="rounded-lg text-sm font-normal transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              :class="periodo === o.key
                ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
              @click="periodo = o.key"
            >{{ o.label }}</button>
          </div>
        </div>

        <!-- Vencimento atual → novo -->
        <div>
          <div class="flex items-center justify-between gap-3 rounded-xl border border-purple-200 bg-purple-50/60 px-4 py-2.5 dark:border-purple-500/30 dark:bg-purple-500/10">
            <div class="min-w-0">
              <p
                class="text-xs"
                :class="previa.diasParaVencer !== null && previa.diasParaVencer < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'"
              >{{ situacao }}</p>
              <p class="text-sm tabular-nums text-slate-700 dark:text-slate-300">{{ fmt(previa.vencimentoAtual) }}</p>
            </div>
            <i class="fa-solid fa-arrow-right shrink-0 text-sm text-purple-500 dark:text-purple-400" aria-hidden="true" />
            <div class="min-w-0 text-right">
              <p class="text-xs text-slate-500 dark:text-slate-400">Novo vencimento</p>
              <p class="text-base font-medium tabular-nums text-purple-700 dark:text-purple-300" aria-live="polite">{{ fmt(novoVencimento) }}</p>
            </div>
          </div>
          <p class="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{{ contaDeTexto }}</p>
        </div>

        <p class="flex items-start gap-2 rounded-xl bg-slate-50 dark:bg-white/[0.03] px-3 py-2.5 text-xs leading-snug text-slate-600 dark:text-slate-300">
          <i class="fa-solid fa-gift mt-px text-emerald-500" aria-hidden="true" />
          <span>Cortesia da Agzap: não gasta crédito do parceiro e não gera desconto de indicação.</span>
        </p>

        <p v-if="previa.bloqueio" role="note" class="text-xs rounded-xl px-3 py-2.5 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          Este cliente está bloqueado {{ previa.bloqueio === 'parceiro' ? 'pelo parceiro' : 'pela Agzap' }}. A data muda, mas o bloqueio continua.
        </p>

        <div>
          <label for="cortesia-motivo" class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
            Motivo <span class="font-normal text-slate-400 dark:text-slate-500">(opcional)</span>
          </label>
          <input
            id="cortesia-motivo"
            v-model="motivo"
            type="text"
            maxlength="300"
            placeholder="Fica registrado na auditoria"
            class="w-full h-10 px-3 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 transition-colors"
          >
        </div>
      </template>

      <div class="flex gap-2 pt-1">
        <button
          type="button"
          class="flex-1 h-10 px-4 rounded-xl font-normal text-sm border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05] disabled:opacity-50 transition-colors"
          :disabled="salvando"
          @click="fechar"
        >
          Cancelar
        </button>
        <button
          type="button"
          class="flex-1 h-10 px-4 rounded-xl font-normal text-sm text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2"
          :disabled="carregando || salvando || !previa"
          @click="renovar"
        >
          <i :class="['fa-solid text-xs', salvando ? 'fa-circle-notch fa-spin' : 'fa-rotate-right']" aria-hidden="true" />
          {{ salvando ? 'Renovando…' : 'Renovar' }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>
