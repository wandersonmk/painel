<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface ParceiroOption {
  id: string
  nome: string
  email: string | null
  ativo: boolean
}

interface Vinculo {
  id: string
  parceiro_id: string
  comissao_percentual: number
  valor_base_override: number | null
  ativo: boolean
}

const props = defineProps<{
  show: boolean
  clienteId: string
  clienteNome: string
}>()
const emit = defineEmits<{
  close: []
  saved: []
}>()

const parceiros = ref<ParceiroOption[]>([])
const vinculo = ref<Vinculo | null>(null)
const loading = ref(false)
const saving = ref(false)
const removing = ref(false)
const confirmandoRemocao = ref(false)

const parceiroId = ref('')
const comissao = ref<number | null>(null)
const valorBase = ref<number | null>(null)

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

watch(() => props.show, async (open) => {
  if (open) {
    toast = await useToastSafe()
    await carregar()
  } else {
    parceiros.value = []
    vinculo.value = null
    parceiroId.value = ''
    comissao.value = null
    valorBase.value = null
    confirmandoRemocao.value = false
  }
})

async function carregar() {
  if (!props.clienteId) return
  loading.value = true
  try {
    const resp = await $fetch<{
      success: boolean
      data?: { parceiros: ParceiroOption[]; vinculo: Vinculo | null }
      error?: string
    }>('/api/admin/parceiros', {
      query: { empresaId: props.clienteId },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Erro')
    parceiros.value = resp.data.parceiros
    vinculo.value = resp.data.vinculo
    if (vinculo.value) {
      parceiroId.value = vinculo.value.parceiro_id
      comissao.value = Number(vinculo.value.comissao_percentual)
      valorBase.value = vinculo.value.valor_base_override !== null
        ? Number(vinculo.value.valor_base_override)
        : null
    }
  } catch {
    toast?.error('Erro ao carregar parceiros')
  } finally {
    loading.value = false
  }
}

const parceirosAtivos = computed(() => parceiros.value.filter(p => p.ativo))

const parceiroAtual = computed(() =>
  vinculo.value ? parceiros.value.find(p => p.id === vinculo.value!.parceiro_id) : null,
)

const podeSalvar = computed(() =>
  !!parceiroId.value
  && comissao.value !== null
  && Number.isFinite(comissao.value)
  && comissao.value >= 0
  && comissao.value <= 100,
)

async function salvar() {
  if (!podeSalvar.value || saving.value) return
  saving.value = true
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/atribuir-parceiro', {
      method: 'POST',
      body: {
        empresaId: props.clienteId,
        parceiroId: parceiroId.value,
        comissaoPercentual: comissao.value,
        valorBaseOverride: valorBase.value ?? null,
      },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro')
    toast?.success(vinculo.value ? 'Atribuição atualizada' : 'Cliente atribuído ao parceiro')
    emit('saved')
    emit('close')
  } catch {
    toast?.error('Erro ao salvar atribuição')
  } finally {
    saving.value = false
  }
}

async function remover() {
  if (removing.value) return
  removing.value = true
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/remover-parceiro', {
      method: 'POST',
      body: { empresaId: props.clienteId },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro')
    toast?.success('Atribuição removida')
    emit('saved')
    emit('close')
  } catch {
    toast?.error('Erro ao remover atribuição')
  } finally {
    removing.value = false
    confirmandoRemocao.value = false
  }
}
</script>

<template>
  <BaseModal :show="show" title="Atribuir a parceiro" max-width="max-w-md" @close="$emit('close')">

    <!-- Header do cliente -->
    <div class="flex items-center gap-3 pb-4 mb-4 border-b border-slate-200 dark:border-slate-800">
      <div class="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center shrink-0 shadow">
        <span class="text-white font-bold text-sm">{{ clienteNome.charAt(0).toUpperCase() }}</span>
      </div>
      <div class="min-w-0">
        <p class="font-semibold text-slate-900 dark:text-white truncate">{{ clienteNome }}</p>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          <template v-if="loading">Carregando…</template>
          <template v-else-if="parceiroAtual">
            Atribuído a <span class="font-semibold text-purple-600 dark:text-purple-400">{{ parceiroAtual.nome }}</span>
          </template>
          <template v-else>Sem parceiro atribuído</template>
        </p>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="py-8 flex items-center justify-center gap-3 text-slate-400 dark:text-slate-600">
      <i class="fa-solid fa-circle-notch animate-spin" aria-hidden="true" />
      <span class="text-sm">Buscando parceiros…</span>
    </div>

    <!-- Sem parceiros cadastrados -->
    <div v-else-if="parceirosAtivos.length === 0" class="py-8 text-center">
      <div class="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
        <i class="fa-solid fa-handshake text-slate-400 dark:text-slate-600 text-xl" aria-hidden="true" />
      </div>
      <p class="text-sm font-medium text-slate-600 dark:text-slate-400">Nenhum parceiro ativo cadastrado</p>
      <p class="text-xs text-slate-400 dark:text-slate-600 mt-0.5">Cadastre um parceiro antes de atribuir clientes</p>
    </div>

    <!-- Formulário -->
    <form v-else @submit.prevent="salvar" class="space-y-4">
      <!-- Parceiro -->
      <div>
        <label for="parceiro-select" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
          <i class="fa-solid fa-handshake text-purple-500 text-xs" aria-hidden="true" />
          Parceiro
        </label>
        <select
          id="parceiro-select"
          v-model="parceiroId"
          required
          class="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="" disabled>Selecione um parceiro…</option>
          <option v-for="p in parceirosAtivos" :key="p.id" :value="p.id">
            {{ p.nome }}{{ p.email ? ` — ${p.email}` : '' }}
          </option>
        </select>
      </div>

      <!-- Comissão -->
      <div>
        <label for="comissao-input" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
          <i class="fa-solid fa-percent text-emerald-500 text-xs" aria-hidden="true" />
          Comissão (%)
        </label>
        <input
          id="comissao-input"
          v-model.number="comissao"
          type="number"
          min="0"
          max="100"
          step="0.01"
          required
          placeholder="Ex.: 20"
          class="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <p class="text-xs text-slate-400 dark:text-slate-600 mt-1">
          Percentual sobre o valor da assinatura do cliente (0 – 100).
        </p>
      </div>

      <!-- Valor base override (opcional) -->
      <div>
        <label for="valor-base-input" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
          <i class="fa-solid fa-coins text-amber-500 text-xs" aria-hidden="true" />
          Valor base (opcional)
        </label>
        <input
          id="valor-base-input"
          v-model.number="valorBase"
          type="number"
          min="0"
          step="0.01"
          placeholder="Vazio = valor real da assinatura"
          class="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <p class="text-xs text-slate-400 dark:text-slate-600 mt-1">
          Se preenchido, a comissão é calculada sobre este valor em vez do valor da assinatura.
        </p>
      </div>

      <!-- Ações -->
      <div class="flex gap-2 pt-2">
        <button
          type="button"
          @click="$emit('close')"
          :disabled="saving || removing"
          class="flex-1 px-4 py-2.5 rounded font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          :disabled="!podeSalvar || saving || removing"
          class="flex-1 px-4 py-2.5 rounded font-semibold text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors flex items-center justify-center gap-2"
        >
          <i v-if="saving" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
          {{ saving ? 'Salvando…' : (vinculo ? 'Atualizar' : 'Atribuir') }}
        </button>
      </div>

      <!-- Remover vínculo existente -->
      <div v-if="vinculo" class="pt-3 border-t border-slate-200 dark:border-slate-800">
        <div v-if="!confirmandoRemocao" class="flex justify-center">
          <button
            type="button"
            @click="confirmandoRemocao = true"
            class="text-xs font-medium text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors inline-flex items-center gap-1.5"
          >
            <i class="fa-solid fa-link-slash text-[10px]" aria-hidden="true" />
            Remover atribuição deste cliente
          </button>
        </div>
        <div v-else class="rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-3 space-y-2">
          <p class="text-xs text-red-700 dark:text-red-300">
            O parceiro <strong>{{ parceiroAtual?.nome }}</strong> deixará de ver este cliente e a comissão dele sairá do saldo. Confirmar?
          </p>
          <div class="flex gap-2">
            <button
              type="button"
              @click="confirmandoRemocao = false"
              :disabled="removing"
              class="flex-1 px-3 py-1.5 rounded text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              Voltar
            </button>
            <button
              type="button"
              @click="remover"
              :disabled="removing"
              class="flex-1 px-3 py-1.5 rounded text-xs font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
            >
              <i v-if="removing" class="fa-solid fa-circle-notch animate-spin text-[10px]" aria-hidden="true" />
              {{ removing ? 'Removendo…' : 'Remover' }}
            </button>
          </div>
        </div>
      </div>
    </form>

  </BaseModal>
</template>
