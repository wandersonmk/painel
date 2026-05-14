<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { AdminCliente } from '~/composables/useAdminClientes'

const props = defineProps<{ show: boolean; cliente: AdminCliente | null }>()
const emit = defineEmits<{
  close: []
  confirm: [dados: { nome: string; email: string; whatsapp: string | null; subscription_price: number | null }]
}>()

const nome = ref('')
const email = ref('')
const whatsapp = ref('')
const priceCents = ref(0)

const priceDisplay = computed(() =>
  (priceCents.value / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
)

function onPriceInput(e: Event) {
  const input = e.target as HTMLInputElement
  const digits = input.value.replace(/\D/g, '').slice(0, 10)
  priceCents.value = digits ? parseInt(digits, 10) : 0
  input.value = priceDisplay.value
}

// Estado do token OpenAI da empresa
const tokenState = ref<'sem-token' | 'proprio' | 'global' | 'desconhecido'>('desconhecido')
const tokenLoading = ref(false)
const tokenEditing = ref(false)
const novoToken = ref('')
const tokenSalvando = ref(false)

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

async function checkToken() {
  if (!props.cliente?.id) return
  tokenLoading.value = true
  try {
    const resp = await $fetch<{ success: boolean; hasToken: boolean; isGlobal: boolean }>('/api/admin/token-empresa', {
      method: 'POST',
      body: { clienteId: props.cliente.id, action: 'check' },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.hasToken) tokenState.value = 'sem-token'
    else if (resp.isGlobal) tokenState.value = 'global'
    else tokenState.value = 'proprio'
  } catch {
    tokenState.value = 'desconhecido'
  } finally {
    tokenLoading.value = false
  }
}

async function tokenAction(action: 'save' | 'remove' | 'apply-global') {
  if (!props.cliente?.id) return
  if (action === 'save' && !novoToken.value.trim()) {
    toast?.warning('Cole um token válido')
    return
  }
  tokenSalvando.value = true
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/token-empresa', {
      method: 'POST',
      body: action === 'save'
        ? { clienteId: props.cliente.id, action, token: novoToken.value.trim() }
        : { clienteId: props.cliente.id, action },
      headers: await useAdminAuthHeaders(),
    })
    if (resp.success) {
      if (action === 'save') toast?.success('Token salvo')
      if (action === 'remove') toast?.success('Token removido')
      if (action === 'apply-global') toast?.success('Token global aplicado')
      novoToken.value = ''
      tokenEditing.value = false
      await checkToken()
    } else toast?.error(resp.error || 'Falha na operação')
  } catch (err: any) {
    toast?.error(err?.statusMessage || err?.message || 'Erro ao atualizar token')
  } finally {
    tokenSalvando.value = false
  }
}

watch(() => props.show, async (open) => {
  if (open && props.cliente) {
    nome.value = props.cliente.nome
    email.value = props.cliente.email
    whatsapp.value = props.cliente.whatsapp || ''
    const price = props.cliente.subscription_price ?? 297
    priceCents.value = Math.round(price * 100)
    toast = await useToastSafe()
    tokenEditing.value = false
    novoToken.value = ''
    await checkToken()
  }
})

function handleSubmit() {
  emit('confirm', {
    nome: nome.value.trim(),
    email: email.value.trim(),
    whatsapp: whatsapp.value.trim() || null,
    subscription_price: priceCents.value > 0 ? priceCents.value / 100 : null,
  })
}
</script>

<template>
  <BaseModal :show="show" title="Editar cliente" max-width="max-w-lg" @close="$emit('close')">
    <form @submit.prevent="handleSubmit" class="space-y-4">
      <div>
        <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Nome da Empresa</label>
        <input v-model="nome" required class="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white" />
      </div>
      <div>
        <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Email</label>
        <input v-model="email" type="email" required class="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white" />
      </div>
      <div>
        <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">WhatsApp</label>
        <input v-model="whatsapp" type="tel" placeholder="(11) 99999-9999" class="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white" />
      </div>
      <div>
        <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Valor do Plano (R$)</label>
        <div class="relative">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">R$</span>
          <input
            :value="priceDisplay"
            @input="onPriceInput"
            type="text"
            inputmode="numeric"
            placeholder="0,00"
            class="w-full pl-10 pr-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white tabular-nums"
          />
        </div>
      </div>

      <!-- Bloco: Token OpenAI da empresa -->
      <div class="border-t border-slate-200 dark:border-slate-800 pt-4">
        <div class="flex items-center justify-between mb-2">
          <label class="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <i class="fa-solid fa-key text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            Token OpenAI
          </label>
          <span
            v-if="!tokenLoading"
            class="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full"
            :class="{
              'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400': tokenState === 'sem-token',
              'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400': tokenState === 'proprio',
              'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': tokenState === 'global',
              'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400': tokenState === 'desconhecido',
            }"
          >
            {{ {
              'sem-token': 'Sem token',
              'proprio': 'Próprio',
              'global': 'Global',
              'desconhecido': '—',
            }[tokenState] }}
          </span>
        </div>

        <div v-if="tokenLoading" class="py-2"><AppLoading /></div>

        <div v-else-if="!tokenEditing && (tokenState === 'proprio' || tokenState === 'global')" class="space-y-2">
          <code class="block px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-300">
            sk-•••...
          </code>
          <div class="flex gap-2">
            <button type="button" @click="tokenEditing = true; novoToken = ''" class="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold">
              Alterar
            </button>
            <button type="button" @click="tokenAction('remove')" :disabled="tokenSalvando" class="px-3 py-1.5 text-xs rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/60 text-red-700 dark:text-red-400 font-semibold disabled:opacity-50">
              Remover
            </button>
          </div>
        </div>

        <div v-else class="space-y-2">
          <input
            v-model="novoToken"
            type="text"
            placeholder="sk-..."
            autocomplete="off"
            class="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-mono text-slate-900 dark:text-white"
          />
          <div class="flex gap-2 flex-wrap">
            <button v-if="tokenEditing" type="button" @click="tokenEditing = false; novoToken = ''" class="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold">
              Cancelar
            </button>
            <button type="button" @click="tokenAction('save')" :disabled="tokenSalvando || !novoToken.trim()" class="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50">
              {{ tokenSalvando ? 'Salvando...' : 'Salvar' }}
            </button>
            <button type="button" @click="tokenAction('apply-global')" :disabled="tokenSalvando" class="px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50">
              Aplicar Global
            </button>
          </div>
        </div>
      </div>

      <div class="flex gap-2 pt-2">
        <button type="button" @click="$emit('close')" class="flex-1 px-4 py-2.5 rounded-lg font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
          Cancelar
        </button>
        <button type="submit" class="flex-1 px-4 py-2.5 rounded-lg font-semibold bg-purple-600 hover:bg-purple-700 text-white">
          Salvar
        </button>
      </div>
    </form>
  </BaseModal>
</template>
