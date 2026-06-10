<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { AdminCliente } from '~/composables/useAdminClientes'

const props = defineProps<{
  show: boolean
  cliente: AdminCliente | null
}>()
const emit = defineEmits<{
  close: []
  saved: []
}>()

const valor = ref<number | null>(null)
const pagoEm = ref('')
const observacao = ref('')
const saving = ref(false)
const confirmando = ref(false)

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

watch(() => props.show, async (open) => {
  if (open) {
    toast = await useToastSafe()
    valor.value = props.cliente?.subscription_price ?? null
    pagoEm.value = new Date().toISOString().slice(0, 10)
    observacao.value = ''
    confirmando.value = false
  }
})

const temParceiro = computed(() => !!props.cliente?.parceiro_nome)

const comissaoEstimada = computed(() => {
  const pct = props.cliente?.parceiro_comissao ?? 0
  const v = valor.value ?? 0
  return Math.round(v * pct) / 100
})

// Valor a partir de R$ 1.500 identifica plano anual — mesma retenção de 30 dias
const isPlanoAnual = computed(() => (valor.value ?? 0) >= 1500)

const podeSalvar = computed(() =>
  temParceiro.value
  && valor.value !== null
  && Number.isFinite(valor.value)
  && valor.value > 0
  && !!pagoEm.value,
)

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

function formatDataPagamento() {
  if (!pagoEm.value) return '—'
  return new Date(`${pagoEm.value}T12:00:00`).toLocaleDateString('pt-BR')
}

async function salvar() {
  if (!podeSalvar.value || saving.value || !props.cliente) return
  saving.value = true
  try {
    const resp = await $fetch<{
      success: boolean
      data?: { parceiroNome: string; valorComissao: number; liberarEm: string }
      error?: string
    }>('/api/admin/sinalizar-pagamento', {
      method: 'POST',
      body: {
        empresaId: props.cliente.id,
        valorBase: valor.value,
        pagoEm: pagoEm.value,
        observacao: observacao.value || undefined,
      },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Erro')
    const liberar = new Date(resp.data.liberarEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    toast?.success(`Pagamento registrado — ${formatBRL(resp.data.valorComissao)} de comissão a liberar em ${liberar}`)
    emit('saved')
    emit('close')
  } catch (err: any) {
    toast?.error(err?.data?.statusMessage || err?.message || 'Erro ao registrar pagamento')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseModal :show="show" title="Sinalizar pagamento" max-width="max-w-md" @close="$emit('close')">

    <!-- Header do cliente -->
    <div class="flex items-center gap-3 pb-4 mb-4 border-b border-slate-200 dark:border-slate-800">
      <div class="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center shrink-0 shadow">
        <i class="fa-solid fa-money-check-dollar text-white text-sm" aria-hidden="true" />
      </div>
      <div class="min-w-0">
        <p class="font-semibold text-slate-900 dark:text-white truncate">{{ cliente?.nome }}</p>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          <template v-if="temParceiro">
            Parceiro: <span class="font-semibold text-teal-600 dark:text-teal-400">{{ cliente?.parceiro_nome }}</span>
            · {{ cliente?.parceiro_comissao }}% de comissão
          </template>
          <template v-else>Sem parceiro vinculado</template>
        </p>
      </div>
    </div>

    <!-- Sem parceiro: aviso -->
    <div v-if="!temParceiro" class="rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-4 text-center">
      <i class="fa-solid fa-handshake-slash text-amber-500 text-xl mb-2 block" aria-hidden="true" />
      <p class="text-sm font-medium text-amber-800 dark:text-amber-300">Este cliente não está vinculado a nenhum parceiro</p>
      <p class="text-xs text-amber-700/80 dark:text-amber-500 mt-1">
        Sinalizar pagamento serve para gerar a comissão do parceiro. Atribua o cliente a um parceiro primeiro.
      </p>
    </div>

    <!-- Confirmação -->
    <div v-else-if="confirmando" class="space-y-4">
      <div class="rounded-md bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 divide-y divide-slate-200 dark:divide-white/5">
        <div class="px-4 py-2.5 flex items-center justify-between gap-3">
          <span class="text-xs text-slate-500 dark:text-slate-400">Cliente</span>
          <span class="text-sm font-semibold text-slate-900 dark:text-white truncate">{{ cliente?.nome }}</span>
        </div>
        <div class="px-4 py-2.5 flex items-center justify-between gap-3">
          <span class="text-xs text-slate-500 dark:text-slate-400">Valor pago</span>
          <span class="text-sm font-semibold text-slate-900 dark:text-white tabular-nums flex items-center gap-2">
            <span
              v-if="isPlanoAnual"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400"
            >
              <i class="fa-solid fa-calendar-days" aria-hidden="true" />
              Plano anual
            </span>
            {{ formatBRL(valor ?? 0) }}
          </span>
        </div>
        <div class="px-4 py-2.5 flex items-center justify-between gap-3">
          <span class="text-xs text-slate-500 dark:text-slate-400">Data do pagamento</span>
          <span class="text-sm font-semibold text-slate-900 dark:text-white tabular-nums">{{ formatDataPagamento() }}</span>
        </div>
        <div class="px-4 py-2.5 flex items-center justify-between gap-3">
          <span class="text-xs text-slate-500 dark:text-slate-400">Comissão ({{ cliente?.parceiro_comissao }}% · {{ cliente?.parceiro_nome }})</span>
          <span class="text-sm font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{{ formatBRL(comissaoEstimada) }}</span>
        </div>
      </div>

      <p class="text-xs text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
        <i class="fa-solid fa-circle-info text-[10px] mt-0.5" aria-hidden="true" />
        <span>Confirma o registro deste pagamento? A comissão entra como "a liberar" e fica disponível para o parceiro 30 dias após a data do pagamento.</span>
      </p>

      <div class="flex gap-2 pt-1">
        <button
          type="button"
          @click="confirmando = false"
          :disabled="saving"
          class="flex-1 px-4 py-2.5 rounded font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          Voltar
        </button>
        <button
          type="button"
          @click="salvar"
          :disabled="saving"
          class="flex-1 px-4 py-2.5 rounded font-semibold text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white transition-colors flex items-center justify-center gap-2"
        >
          <i v-if="saving" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
          {{ saving ? 'Registrando…' : 'Confirmar pagamento' }}
        </button>
      </div>
    </div>

    <!-- Formulário -->
    <form v-else @submit.prevent="confirmando = true" class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label for="pgto-valor" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Valor pago</label>
          <AppCurrencyInput
            id="pgto-valor"
            v-model="valor"
            required
            class="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label for="pgto-data" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Data do pagamento</label>
          <input
            id="pgto-data"
            v-model="pagoEm"
            type="date"
            required
            class="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      <div>
        <label for="pgto-obs" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Observação <span class="font-normal text-slate-400">(opcional)</span></label>
        <input
          id="pgto-obs"
          v-model="observacao"
          type="text"
          placeholder="Ex.: PIX recebido na conta da empresa"
          class="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      <!-- Resumo da comissão -->
      <div class="rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-4 py-3 flex items-center justify-between gap-3">
        <span class="text-xs text-emerald-800 dark:text-emerald-300">
          Comissão do parceiro ({{ cliente?.parceiro_comissao }}%) — liberada 30 dias após o pagamento
        </span>
        <span class="text-sm font-bold text-emerald-700 dark:text-emerald-400 tabular-nums whitespace-nowrap">{{ formatBRL(comissaoEstimada) }}</span>
      </div>

      <p v-if="isPlanoAnual" class="text-xs text-indigo-700 dark:text-indigo-400 flex items-start gap-1.5 -mt-2">
        <i class="fa-solid fa-calendar-days text-[10px] mt-0.5" aria-hidden="true" />
        <span>Valor a partir de R$ 1.500,00 — identificado como <strong>plano anual</strong>. A retenção segue os mesmos 30 dias.</span>
      </p>

      <div class="flex gap-2 pt-2">
        <button
          type="button"
          @click="$emit('close')"
          :disabled="saving"
          class="flex-1 px-4 py-2.5 rounded font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          :disabled="!podeSalvar"
          class="flex-1 px-4 py-2.5 rounded font-semibold text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors flex items-center justify-center gap-2"
        >
          Continuar
          <i class="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
        </button>
      </div>
    </form>

  </BaseModal>
</template>
