<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ClienteCarteira } from '~/composables/useParceiroLicencas'

const props = defineProps<{
  show: boolean
  cliente: ClienteCarteira | null
  acao: 'liberar' | 'remover'
}>()

const emit = defineEmits<{ close: []; confirmed: [] }>()

const { alterarDelivery } = useParceiroLicencas()
let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null
onMounted(async () => { toast = await useToastSafe() })

const confirmado = ref(false)
const salvando = ref(false)
const erro = ref<string | null>(null)

watch(() => props.show, (aberto) => {
  if (!aberto) return
  confirmado.value = false
  salvando.value = false
  erro.value = null
})

const liberar = computed(() => props.acao === 'liberar')
const titulo = computed(() => (liberar.value ? 'Liberar Delivery' : 'Remover Delivery'))
const podeConfirmar = computed(() => !salvando.value && (!liberar.value || confirmado.value))

const linhas = computed(() => liberar.value
  ? [
      { rotulo: 'Crédito consumido agora', valor: 'Nenhum' },
      { rotulo: 'Cota inicial', valor: '500 pedidos por mês' },
      { rotulo: 'Vencimento do cliente', valor: 'Não muda' },
    ]
  : [
      { rotulo: 'Cardápio e pedidos', valor: 'Ficam guardados' },
      { rotulo: 'Crédito devolvido', valor: 'Nenhum' },
      { rotulo: 'Vencimento do cliente', valor: 'Não muda' },
    ])

async function confirmar() {
  if (!props.cliente || !podeConfirmar.value) return
  salvando.value = true
  erro.value = null
  try {
    await alterarDelivery(props.cliente.empresa_id, props.acao, confirmado.value)
    toast?.success(liberar.value ? 'Delivery liberado' : 'Delivery removido')
    emit('confirmed')
    emit('close')
  } catch (e: any) {
    erro.value = String(e?.message || 'Não foi possível concluir a operação')
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <BaseModal :show="show" :title="titulo" max-width="max-w-2xl" @close="emit('close')">
    <div v-if="cliente" class="space-y-4">
      <div class="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div class="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center shrink-0 shadow">
          <span class="text-white font-bold text-sm">{{ cliente.empresa_nome.charAt(0).toUpperCase() }}</span>
        </div>
        <div class="min-w-0">
          <p class="font-semibold text-slate-900 dark:text-white truncate">{{ cliente.empresa_nome }}</p>
          <p class="text-xs text-slate-500 dark:text-slate-400">Cliente vinculado a você</p>
        </div>
      </div>

      <p class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
        <template v-if="liberar">O módulo aparece para o cliente na hora, com cardápio, pedidos e entregas.</template>
        <template v-else>O cardápio online sai do ar na hora e o cliente deixa de receber pedidos pelo site e pela IA.</template>
      </p>

      <div class="rounded-md bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 divide-y divide-slate-200 dark:divide-white/5">
        <div v-for="l in linhas" :key="l.rotulo" class="flex items-center justify-between gap-3 px-4 py-2.5">
          <span class="text-xs text-slate-500 dark:text-slate-400">{{ l.rotulo }}</span>
          <span class="text-sm font-semibold text-slate-800 dark:text-white">{{ l.valor }}</span>
        </div>
      </div>

      <template v-if="liberar">
        <div class="rounded-md bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 p-3 flex items-start gap-2.5">
          <i class="fa-solid fa-circle-info text-orange-600 dark:text-orange-400 text-sm mt-0.5" aria-hidden="true" />
          <p class="text-xs text-orange-800 dark:text-orange-300 leading-relaxed">
            A cota é definida na renovação: o crédito Delivery até 500 deixa 500 pedidos por mês, e o Delivery acima de 500 deixa até 5.000.
          </p>
        </div>

        <label class="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed cursor-pointer">
          <input v-model="confirmado" type="checkbox" class="mt-0.5 w-4 h-4 shrink-0 rounded border-slate-300 text-purple-600 focus:ring-purple-500" />
          <span>Confirmo que este cliente vai vender pelo Delivery. Usar o crédito de Delivery em outro tipo de negócio é proibido pelo Termo do Parceiro.</span>
        </label>
      </template>

      <p v-else class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
        O resto do sistema continua funcionando. Você pode liberar o módulo de novo quando quiser.
      </p>

      <p v-if="erro" class="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
        <i class="fa-solid fa-circle-exclamation text-[10px]" aria-hidden="true" />
        {{ erro }}
      </p>

      <div class="flex gap-2 pt-1">
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
          @click="confirmar"
          :disabled="!podeConfirmar"
          class="flex-1 px-4 py-2.5 rounded font-semibold text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          :class="liberar ? 'bg-purple-600 hover:bg-purple-700' : 'bg-red-700 hover:bg-red-800'"
        >
          <i v-if="salvando" class="fa-solid fa-circle-notch fa-spin text-xs" aria-hidden="true" />
          {{ salvando ? 'Salvando…' : titulo }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>
