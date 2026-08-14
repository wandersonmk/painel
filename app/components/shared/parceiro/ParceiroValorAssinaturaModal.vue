<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ClienteCarteira } from '~/composables/useParceiroLicencas'

/**
 * O parceiro define quanto o cliente dele vê como valor da assinatura.
 * Quem revende cobra o preço que quiser — a tela do cliente tem que mostrar o
 * combinado com o parceiro, não o preço de tabela da Agzap.
 */
const props = defineProps<{ show: boolean; cliente: ClienteCarteira | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const { salvarValorAssinatura } = useParceiroLicencas()
const valor = ref<number | null>(null)
const salvando = ref(false)
const erro = ref<string | null>(null)
let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

watch(() => props.show, async (aberto) => {
  if (!aberto) return
  valor.value = props.cliente?.preco ?? null
  erro.value = null
  if (!toast) toast = await useToastSafe()
})

const fmtBRL = (v: number | null) =>
  v === null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

async function salvar() {
  if (!props.cliente || salvando.value) return
  salvando.value = true
  erro.value = null
  try {
    await salvarValorAssinatura(props.cliente.empresa_id, valor.value)
    toast?.success('Valor da assinatura atualizado')
    emit('saved')
    emit('close')
  } catch (e: any) {
    erro.value = e?.data?.statusMessage || e?.message || 'Não foi possível salvar'
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <BaseModal :show="show" title="Valor da assinatura" max-width="max-w-sm" @close="emit('close')">
    <div v-if="cliente" class="space-y-4">
      <div class="text-center py-1">
        <p class="text-sm font-semibold text-slate-900 dark:text-white">{{ cliente.empresa_nome }}</p>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
          É este valor que o cliente vê na tela de assinatura dele. Cobre o que combinou na revenda —
          a Agzap não interfere no seu preço.
        </p>
      </div>

      <div>
        <label class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
          Valor mensal cobrado do cliente
        </label>
        <AppCurrencyInput
          v-model="valor"
          placeholder="R$ 0,00"
          class="w-full px-3 py-2.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded text-base font-semibold text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <p class="mt-1.5 text-[11px] text-slate-400">
          Valor atual: <span class="tabular-nums">{{ fmtBRL(cliente.preco) }}</span> · deixe vazio para não exibir preço
        </p>
      </div>

      <p v-if="erro" role="alert" class="text-xs text-red-600 dark:text-red-400">{{ erro }}</p>

      <div class="flex gap-2">
        <button
          type="button"
          @click="emit('close')"
          :disabled="salvando"
          class="flex-1 px-4 py-2.5 rounded font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          @click="salvar"
          :disabled="salvando"
          class="flex-1 px-4 py-2.5 rounded font-semibold text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white transition-colors flex items-center justify-center gap-2"
        >
          <i :class="['fa-solid', salvando ? 'fa-circle-notch fa-spin' : 'fa-check', 'text-xs']" aria-hidden="true" />
          {{ salvando ? 'Salvando…' : 'Salvar' }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>
