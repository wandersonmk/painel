<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { FinanceiroLancamento, FinanceiroFormPayload } from '~/composables/useFinanceiro'

const props = defineProps<{
  show: boolean
  tipoInicial: 'entrada' | 'saida'
  lancamento?: FinanceiroLancamento | null
  salvando?: boolean
}>()
const emit = defineEmits<{ close: []; submit: [payload: FinanceiroFormPayload] }>()

const categoriasSaida = [
  'Aluguel', 'Água', 'Luz', 'Internet', 'Telefone',
  'Marketing', 'Salário', 'Pró-labore', 'Imposto',
  'Software', 'Equipamento', 'Outros',
]
const categoriasEntrada = [
  'Assinatura', 'Venda', 'Serviço', 'Investimento', 'Outros',
]

const form = ref<FinanceiroFormPayload>({
  tipo: 'saida',
  descricao: '',
  categoria: '',
  valor: 0,
  data_vencimento: '',
  data_pagamento: '',
  observacao: '',
})

const valorStr = ref('0,00')
const pago = ref(false)

const categoriasDisponiveis = computed(() =>
  form.value.tipo === 'entrada' ? categoriasEntrada : categoriasSaida,
)
const isEdit = computed(() => !!props.lancamento?.id)
const titulo = computed(() => {
  const base = form.value.tipo === 'entrada' ? 'receita' : 'despesa'
  return isEdit.value ? `Editar ${base}` : `Nova ${base}`
})

function reset() {
  if (props.lancamento) {
    form.value = {
      id: props.lancamento.id,
      tipo: props.lancamento.tipo,
      descricao: props.lancamento.descricao,
      categoria: props.lancamento.categoria || '',
      valor: Number(props.lancamento.valor || 0),
      data_vencimento: props.lancamento.data_vencimento || '',
      data_pagamento: props.lancamento.data_pagamento || '',
      observacao: props.lancamento.observacao || '',
    }
    valorStr.value = Number(props.lancamento.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    pago.value = !!props.lancamento.data_pagamento
  } else {
    form.value = {
      tipo: props.tipoInicial,
      descricao: '',
      categoria: '',
      valor: 0,
      data_vencimento: '',
      data_pagamento: '',
      observacao: '',
    }
    valorStr.value = '0,00'
    pago.value = false
  }
}

watch(() => props.show, (open) => {
  if (open) reset()
})

function onValorInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value
  const digits = raw.replace(/\D/g, '')
  const num = Number(digits) / 100
  form.value.valor = num
  valorStr.value = num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function submit() {
  if (!form.value.descricao.trim()) return
  if (!Number.isFinite(form.value.valor) || form.value.valor < 0) return
  const payload: FinanceiroFormPayload = {
    ...form.value,
    descricao: form.value.descricao.trim(),
    categoria: form.value.categoria?.trim() || null,
    data_vencimento: form.value.tipo === 'saida' ? (form.value.data_vencimento || null) : null,
    data_pagamento: pago.value ? (form.value.data_pagamento || new Date().toISOString().slice(0, 10)) : null,
    observacao: form.value.observacao?.trim() || null,
  }
  emit('submit', payload)
}
</script>

<template>
  <BaseModal :show="show" :title="titulo" max-width="max-w-lg" @close="$emit('close')">
    <form @submit.prevent="submit" class="space-y-4">
      <!-- Tipo toggle -->
      <div class="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-lg" role="tablist">
        <button
          type="button"
          @click="form.tipo = 'entrada'; form.categoria = ''; form.data_vencimento = ''"
          class="flex-1 px-3 py-2 rounded-md text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          :class="form.tipo === 'entrada'
            ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
            : 'text-slate-500 dark:text-slate-400'"
        >
          <i class="fa-solid fa-arrow-trend-up" aria-hidden="true" />
          Receita
        </button>
        <button
          type="button"
          @click="form.tipo = 'saida'; form.categoria = ''"
          class="flex-1 px-3 py-2 rounded-md text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          :class="form.tipo === 'saida'
            ? 'bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 shadow-sm'
            : 'text-slate-500 dark:text-slate-400'"
        >
          <i class="fa-solid fa-arrow-trend-down" aria-hidden="true" />
          Despesa
        </button>
      </div>

      <!-- Descrição -->
      <div>
        <label for="fin-descricao" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Descrição</label>
        <input
          id="fin-descricao"
          v-model="form.descricao"
          type="text"
          required
          placeholder="Ex.: Conta de internet — Vivo"
          class="w-full px-3 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      <!-- Valor + Categoria -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="fin-valor" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Valor</label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 dark:text-slate-500 font-semibold">R$</span>
            <input
              id="fin-valor"
              :value="valorStr"
              @input="onValorInput"
              type="text"
              inputmode="numeric"
              required
              class="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white tabular-nums font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>
        <div>
          <label for="fin-categoria" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Categoria</label>
          <select
            id="fin-categoria"
            v-model="form.categoria"
            class="w-full px-3 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">— sem categoria —</option>
            <option v-for="c in categoriasDisponiveis" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
      </div>

      <!-- Vencimento (apenas despesas) + Pago/Recebido -->
      <div class="grid gap-3" :class="form.tipo === 'saida' ? 'grid-cols-2' : 'grid-cols-1'">
        <div v-if="form.tipo === 'saida'">
          <label for="fin-venc" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Vencimento</label>
          <input
            id="fin-venc"
            v-model="form.data_vencimento"
            type="date"
            class="w-full px-3 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            {{ form.tipo === 'entrada' ? 'Já foi recebido?' : 'Já foi pago?' }}
          </label>
          <label class="flex items-center gap-2 h-[42px] px-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer hover:border-purple-300 dark:hover:border-purple-700">
            <input v-model="pago" type="checkbox" class="rounded text-purple-600 focus:ring-purple-500" />
            <span class="text-sm text-slate-700 dark:text-slate-300">
              {{ form.tipo === 'entrada' ? 'Marcar como recebido' : 'Marcar como pago' }}
            </span>
          </label>
        </div>
      </div>

      <!-- Data pagamento/recebimento se marcado -->
      <div v-if="pago">
        <label for="fin-pagto" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
          {{ form.tipo === 'entrada' ? 'Data do recebimento' : 'Data do pagamento' }}
        </label>
        <input
          id="fin-pagto"
          v-model="form.data_pagamento"
          type="date"
          class="w-full px-3 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      <!-- Observação -->
      <div>
        <label for="fin-obs" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Observação <span class="text-slate-400 font-normal">(opcional)</span></label>
        <textarea
          id="fin-obs"
          v-model="form.observacao"
          rows="2"
          placeholder="Anotações…"
          class="w-full px-3 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
        />
      </div>

      <div class="flex gap-2 pt-2">
        <button
          type="button"
          @click="$emit('close')"
          class="flex-1 px-4 py-2.5 rounded-lg font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          :disabled="salvando || !form.descricao.trim() || form.valor < 0"
          class="flex-1 px-4 py-2.5 rounded-lg font-semibold text-sm text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          :class="form.tipo === 'entrada' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'"
        >
          <i v-if="salvando" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
          {{ salvando ? 'Salvando…' : 'Salvar' }}
        </button>
      </div>
    </form>
  </BaseModal>
</template>
