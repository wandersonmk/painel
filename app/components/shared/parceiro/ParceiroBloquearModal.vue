<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ClienteCarteira } from '~/composables/useParceiroLicencas'

const props = defineProps<{
  show: boolean
  cliente: ClienteCarteira | null
  /** true = bloquear, false = desbloquear */
  bloquear: boolean
}>()

const emit = defineEmits<{ close: []; confirmed: [] }>()

const { bloquear: executar } = useParceiroLicencas()
let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null
onMounted(async () => { toast = await useToastSafe() })

const motivo = ref('')
const salvando = ref(false)
const erro = ref<string | null>(null)

watch(() => props.show, (aberto) => {
  if (!aberto) return
  motivo.value = ''
  erro.value = null
  salvando.value = false
})

async function confirmar() {
  if (!props.cliente || salvando.value) return
  salvando.value = true
  erro.value = null
  try {
    await executar(props.cliente.empresa_id, props.bloquear, motivo.value.trim() || undefined)
    toast?.success(props.bloquear ? 'Cliente bloqueado' : 'Cliente desbloqueado')
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
  <BaseModal
    :show="show"
    :title="bloquear ? 'Bloquear acesso do cliente' : 'Desbloquear acesso do cliente'"
    max-width="max-w-sm"
    @close="emit('close')"
  >
    <div v-if="cliente" class="space-y-4">
      <div class="text-center py-1">
        <div
          class="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
          :class="bloquear ? 'bg-red-100 dark:bg-red-500/15' : 'bg-emerald-100 dark:bg-emerald-500/15'"
        >
          <i
            class="fa-solid text-2xl"
            :class="bloquear ? 'fa-lock text-red-600 dark:text-red-400' : 'fa-lock-open text-emerald-600 dark:text-emerald-400'"
            aria-hidden="true"
          />
        </div>
        <p class="text-sm font-semibold text-slate-900 dark:text-white">{{ cliente.empresa_nome }}</p>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
          <template v-if="bloquear">
            O cliente perde o acesso ao painel dele imediatamente. Os dados não são apagados,
            o vencimento não muda e <strong>nenhum crédito é devolvido</strong>.
          </template>
          <template v-else>
            O cliente volta a acessar o painel. Desbloquear <strong>não renova</strong> e
            não consome crédito — se a assinatura estiver vencida, ele continua vencido.
          </template>
        </p>
      </div>

      <div>
        <label class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
          Motivo <span class="font-medium normal-case text-slate-400">(opcional, fica no histórico)</span>
        </label>
        <input
          v-model="motivo"
          type="text"
          maxlength="300"
          :placeholder="bloquear ? 'Ex.: pagamento em atraso' : 'Ex.: pagamento regularizado'"
          class="w-full px-3 py-2 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      <p v-if="erro" class="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
        <i class="fa-solid fa-circle-exclamation text-[10px]" aria-hidden="true" />
        {{ erro }}
      </p>

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
          @click="confirmar"
          :disabled="salvando"
          class="flex-1 px-4 py-2.5 rounded font-semibold text-sm text-white disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          :class="bloquear ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'"
        >
          <i :class="['fa-solid', salvando ? 'fa-circle-notch fa-spin' : (bloquear ? 'fa-lock' : 'fa-lock-open'), 'text-xs']" aria-hidden="true" />
          {{ salvando ? 'Aguarde…' : (bloquear ? 'Bloquear' : 'Desbloquear') }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>
