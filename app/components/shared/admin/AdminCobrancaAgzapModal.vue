<script setup lang="ts">
import { computed, ref, watch } from 'vue'

/**
 * Confirmação de "quem cobra este cliente" (Parceiros → clientes vinculados).
 * Antes o selo trocava no clique e o dono trocou sem querer (09/10/2026):
 * agora só grava no Confirmar, pela mesma rota de sempre.
 */
const props = defineProps<{
  show: boolean
  cliente: { empresa_id: string; empresa_nome: string; cobranca_agzap: boolean } | null
  parceiroNome?: string | null
}>()
const emit = defineEmits<{ close: []; salvo: [] }>()

const motivo = ref('')
const salvando = ref(false)

// Cópia do cliente: o conteúdo não some nem vira ao contrário enquanto o
// modal esmaece (a página zera o alvo e recarrega a lista no mesmo instante).
const alvo = ref(props.cliente)
const parceiro = ref(props.parceiroNome ?? null)
watch(() => props.cliente, (c) => { if (c) alvo.value = c })
watch(() => props.parceiroNome, (n) => { if (n) parceiro.value = n })

// Estado depois de confirmar (o contrário do atual).
const paraAgzap = computed(() => !alvo.value?.cobranca_agzap)

watch(() => props.show, (aberto) => {
  if (aberto) motivo.value = ''
})

function fechar() {
  if (!salvando.value) emit('close')
}

async function confirmar() {
  if (!props.show || !alvo.value || salvando.value) return
  salvando.value = true
  const toast = await useToastSafe()
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/parceiros/cobranca-agzap', {
      method: 'POST',
      body: {
        empresaId: alvo.value.empresa_id,
        cobrancaAgzap: paraAgzap.value,
        motivo: motivo.value.trim() || undefined,
      },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro')
    toast.success(paraAgzap.value
      ? 'Cliente marcado como cobrança da Agzap'
      : 'Cliente volta a consumir crédito do parceiro')
    emit('salvo')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.message || 'Erro ao salvar')
  } finally {
    salvando.value = false
  }
}

const seloParceiro = 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300'
const seloAgzap = 'bg-slate-200 dark:bg-slate-600/40 text-slate-700 dark:text-slate-300'
</script>

<template>
  <BaseModal :show="show" title="Trocar quem cobra este cliente?" max-width="max-w-md" @close="fechar">
    <div v-if="alvo" class="space-y-4">
      <div class="min-w-0">
        <p class="text-sm text-slate-900 dark:text-white break-words">{{ alvo.empresa_nome }}</p>
        <p v-if="parceiro" class="text-xs text-slate-500 dark:text-slate-400 break-words">Parceiro: {{ parceiro }}</p>
      </div>

      <!-- De → para -->
      <div class="flex flex-wrap items-center gap-2 text-xs">
        <span class="px-2 py-1 rounded whitespace-nowrap" :class="alvo.cobranca_agzap ? seloAgzap : seloParceiro">
          {{ alvo.cobranca_agzap ? 'Cobrança Agzap' : 'Crédito do parceiro' }}
        </span>
        <i class="fa-solid fa-arrow-right text-slate-400 text-[11px]" aria-hidden="true" />
        <span class="px-2 py-1 rounded whitespace-nowrap ring-1 ring-inset" :class="paraAgzap ? `${seloAgzap} ring-slate-400/50` : `${seloParceiro} ring-purple-400/50`">
          {{ paraAgzap ? 'Cobrança Agzap' : 'Crédito do parceiro' }}
        </span>
      </div>

      <p class="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-white/[0.03] px-3.5 py-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        <template v-if="paraAgzap">
          O cliente passa a pagar direto à Agzap. O parceiro não renova nem gasta crédito com ele; na carteira do parceiro ele fica só para leitura.
        </template>
        <template v-else>
          O parceiro volta a renovar este cliente com os créditos dele.
        </template>
      </p>

      <div>
        <label for="cobranca-motivo" class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          Motivo <span class="font-normal text-slate-400 dark:text-slate-500">(opcional)</span>
        </label>
        <input
          id="cobranca-motivo"
          v-model="motivo"
          type="text"
          maxlength="300"
          placeholder="Fica registrado na auditoria"
          class="w-full h-10 px-3 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 transition-colors"
          @keydown.enter.prevent="confirmar"
        >
      </div>

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
          class="flex-1 h-10 px-4 rounded-xl font-normal text-sm text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2"
          :disabled="salvando"
          @click="confirmar"
        >
          <i :class="['fa-solid text-xs', salvando ? 'fa-circle-notch fa-spin' : 'fa-check']" aria-hidden="true" />
          {{ salvando ? 'Salvando…' : 'Confirmar' }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>
