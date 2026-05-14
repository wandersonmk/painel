<script setup lang="ts">
import { ref, onMounted } from 'vue'

const hasToken = ref(false)
const tokenAtual = ref<string | null>(null)
const editing = ref(false)
const novoToken = ref('')
const salvando = ref(false)
const removendo = ref(false)
const showToken = ref(false)

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

async function loadStatus() {
  try {
    const resp = await $fetch<{ success: boolean; hasToken: boolean; token: string | null }>('/api/admin/token-global', {
      method: 'POST',
      body: { action: 'get' },
      headers: await useAdminAuthHeaders(),
    })
    hasToken.value = resp.hasToken
    tokenAtual.value = resp.token
  } catch {
    hasToken.value = false
    tokenAtual.value = null
  }
}

async function salvar() {
  if (!novoToken.value.trim()) {
    toast?.warning('Cole um token válido')
    return
  }
  salvando.value = true
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/token-global', {
      method: 'POST',
      body: { action: 'save', token: novoToken.value.trim() },
      headers: await useAdminAuthHeaders(),
    })
    if (resp.success) {
      toast?.success('Token global salvo')
      novoToken.value = ''
      editing.value = false
      await loadStatus()
    } else toast?.error(resp.error || 'Falha ao salvar token')
  } catch { toast?.error('Erro ao salvar token') }
  finally { salvando.value = false }
}

async function remover() {
  if (!confirm('Remover o token OpenAI global?')) return
  removendo.value = true
  try {
    const resp = await $fetch<{ success: boolean }>('/api/admin/token-global', {
      method: 'POST',
      body: { action: 'remove' },
      headers: await useAdminAuthHeaders(),
    })
    if (resp.success) {
      toast?.success('Token global removido')
      await loadStatus()
    } else toast?.error('Falha ao remover token')
  } catch { toast?.error('Erro ao remover token') }
  finally { removendo.value = false }
}

function maskToken(t: string | null) {
  if (!t) return ''
  if (t.length <= 10) return '•'.repeat(t.length)
  return `${t.slice(0, 6)}${'•'.repeat(20)}${t.slice(-4)}`
}

onMounted(async () => {
  toast = await useToastSafe()
  await loadStatus()
})
</script>

<template>
  <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
    <div class="flex items-start justify-between gap-3 mb-3">
      <div class="flex items-center gap-3">
        <div class="size-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
          <i class="fa-solid fa-key" aria-hidden="true" />
        </div>
        <div>
          <h3 class="text-base font-bold text-slate-900 dark:text-white">Token OpenAI Global</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">Aplicado por padrão a novas empresas que não tenham token próprio.</p>
        </div>
      </div>
      <span
        class="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold shrink-0"
        :class="hasToken ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'"
      >
        {{ hasToken ? 'Configurado' : 'Não configurado' }}
      </span>
    </div>

    <div v-if="hasToken && !editing" class="space-y-3">
      <div class="flex items-center gap-2">
        <code class="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-300 truncate">
          {{ showToken ? tokenAtual : maskToken(tokenAtual) }}
        </code>
        <button
          @click="showToken = !showToken"
          class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
          :aria-label="showToken ? 'Ocultar token' : 'Mostrar token'"
          type="button"
        >
          <i :class="['fa-solid', showToken ? 'fa-eye-slash' : 'fa-eye']" aria-hidden="true" />
        </button>
      </div>
      <div class="flex gap-2">
        <button type="button" @click="editing = true; novoToken = ''" class="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold">
          Alterar
        </button>
        <button type="button" @click="remover" :disabled="removendo" class="px-3 py-2 text-sm rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/60 text-red-700 dark:text-red-400 font-semibold disabled:opacity-50">
          {{ removendo ? 'Removendo...' : 'Remover' }}
        </button>
      </div>
    </div>

    <form v-else @submit.prevent="salvar" class="space-y-2">
      <input
        v-model="novoToken"
        type="text"
        placeholder="sk-..."
        autocomplete="off"
        class="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-mono text-slate-900 dark:text-white"
      />
      <div class="flex gap-2">
        <button v-if="editing" type="button" @click="editing = false; novoToken = ''" class="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold">
          Cancelar
        </button>
        <button type="submit" :disabled="salvando || !novoToken.trim()" class="px-3 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50">
          {{ salvando ? 'Salvando...' : 'Salvar' }}
        </button>
      </div>
    </form>
  </div>
</template>
