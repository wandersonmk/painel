<script setup lang="ts">
import { ref, watch, computed } from 'vue'

interface Instancia {
  id: string
  nome_instancia: string
  status: string
  created_at: string
  phone: string | null
}

const props = defineProps<{
  show: boolean
  clienteId: string
  clienteNome: string
  valorAtual: number
}>()
const emit = defineEmits<{ close: []; confirm: [quantidade: number] }>()

const quantidade = ref(1)
const instancias = ref<Instancia[]>([])
const loadingInstancias = ref(false)
const idExpandido = ref<string | null>(null)
const idCopiado = ref<string | null>(null)
const acaoConfirmacao = ref<{ tipo: 'desconectar' | 'excluir'; instancia: Instancia } | null>(null)
const processandoAcao = ref(false)

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

watch(() => props.show, async (open) => {
  if (open) {
    quantidade.value = props.valorAtual || 1
    toast = await useToastSafe()
    await carregarInstancias()
  } else {
    instancias.value = []
    idExpandido.value = null
    idCopiado.value = null
    acaoConfirmacao.value = null
  }
})

async function carregarInstancias() {
  if (!props.clienteId) return
  loadingInstancias.value = true
  try {
    const resp = await $fetch<{ success: boolean; data?: Instancia[]; error?: string }>('/api/admin/instancias', {
      query: { empresaId: props.clienteId },
      headers: await useAdminAuthHeaders(),
    })
    instancias.value = resp.success && resp.data ? resp.data.filter(i => i.status !== 'deleted') : []
  } catch {
    instancias.value = []
  } finally {
    loadingInstancias.value = false
  }
}

const statusMap: Record<string, { label: string; dot: string; border: string; badge: string }> = {
  connected:    { label: 'Conectado',    dot: 'bg-emerald-500', border: 'border-emerald-400 dark:border-emerald-500',   badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400' },
  connecting:   { label: 'Conectando',   dot: 'bg-amber-400 animate-pulse', border: 'border-amber-400',                  badge: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400' },
  disconnected: { label: 'Desconectado', dot: 'bg-slate-400', border: 'border-slate-300 dark:border-slate-700',          badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-400' },
  deleted:      { label: 'Excluída',     dot: 'bg-red-400', border: 'border-red-300 dark:border-red-900',                badge: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' },
}
function getStatus(s: string) {
  return statusMap[s] ?? statusMap.disconnected
}

function toggleId(id: string) {
  idExpandido.value = idExpandido.value === id ? null : id
}
async function copiarId(id: string) {
  try {
    await navigator.clipboard.writeText(id)
    idCopiado.value = id
    setTimeout(() => { if (idCopiado.value === id) idCopiado.value = null }, 2000)
  } catch {}
}

function abrirConfirmacao(tipo: 'desconectar' | 'excluir', instancia: Instancia) {
  acaoConfirmacao.value = { tipo, instancia }
}

async function executarAcao() {
  if (!acaoConfirmacao.value) return
  const { tipo, instancia } = acaoConfirmacao.value
  processandoAcao.value = true
  try {
    if (tipo === 'desconectar') {
      const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/desconectar-instancia', {
        method: 'POST',
        body: { instanciaId: instancia.id },
        headers: await useAdminAuthHeaders(),
      })
      if (resp.success) {
        const i = instancias.value.find(x => x.id === instancia.id)
        if (i) i.status = 'disconnected'
        toast?.success('Instância desconectada com sucesso')
      } else {
        toast?.error(resp.error || 'Falha ao desconectar')
      }
    } else {
      const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/excluir-instancia', {
        method: 'POST',
        body: { instanciaId: instancia.id },
        headers: await useAdminAuthHeaders(),
      })
      if (resp.success) {
        instancias.value = instancias.value.filter(x => x.id !== instancia.id)
        toast?.success('Instância removida')
      } else {
        toast?.error(resp.error || 'Falha ao excluir')
      }
    }
  } catch {
    toast?.error('Erro inesperado ao executar ação')
  } finally {
    processandoAcao.value = false
    acaoConfirmacao.value = null
  }
}

const canaisUsados = computed(() => instancias.value.length)
</script>

<template>
  <BaseModal :show="show" title="Canais WhatsApp" max-width="max-w-xl" @close="$emit('close')">

    <!-- Header do cliente -->
    <div class="flex items-center gap-3 pb-4 mb-4 border-b border-slate-200 dark:border-slate-800">
      <div class="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center shrink-0 shadow">
        <span class="text-white font-bold text-sm">{{ clienteNome.charAt(0).toUpperCase() }}</span>
      </div>
      <div>
        <p class="font-semibold text-slate-900 dark:text-white">{{ clienteNome }}</p>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          {{ canaisUsados }} de {{ valorAtual }} canal{{ valorAtual > 1 ? 'is' : '' }} em uso
        </p>
      </div>
    </div>

    <!-- Lista de instâncias -->
    <section class="mb-5">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <i class="fa-brands fa-whatsapp text-emerald-500" aria-hidden="true" />
          Instâncias cadastradas
        </h3>
        <button
          @click="carregarInstancias"
          :disabled="loadingInstancias"
          class="text-xs text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors flex items-center gap-1"
          type="button"
          title="Recarregar"
        >
          <i class="fa-solid fa-arrows-rotate text-[10px]" :class="{ 'animate-spin': loadingInstancias }" aria-hidden="true" />
          Recarregar
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loadingInstancias" class="py-8 flex items-center justify-center gap-3 text-slate-400 dark:text-slate-600">
        <i class="fa-solid fa-circle-notch animate-spin" aria-hidden="true" />
        <span class="text-sm">Buscando canais…</span>
      </div>

      <!-- Vazia -->
      <div v-else-if="instancias.length === 0" class="py-8 text-center">
        <div class="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
          <i class="fa-brands fa-whatsapp text-slate-400 dark:text-slate-600 text-xl" aria-hidden="true" />
        </div>
        <p class="text-sm font-medium text-slate-600 dark:text-slate-400">Nenhum canal cadastrado</p>
        <p class="text-xs text-slate-400 dark:text-slate-600 mt-0.5">O cliente ainda não conectou um número</p>
      </div>

      <!-- Cards de instância -->
      <div v-else class="space-y-3">
        <div
          v-for="inst in instancias"
          :key="inst.id"
          class="rounded-md border-l-4 border bg-white dark:bg-slate-900 shadow-sm dark:shadow-none overflow-hidden"
          :class="[getStatus(inst.status).border, 'border-slate-200 dark:border-slate-800']"
        >
          <div class="p-4">
            <div class="flex items-start justify-between gap-3">

              <!-- Esquerda: info do canal -->
              <div class="flex items-start gap-3 min-w-0 flex-1">
                <!-- Avatar WhatsApp -->
                <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm"
                  :class="inst.status === 'connected' ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'">
                  <i class="fa-brands fa-whatsapp text-white text-lg" aria-hidden="true" />
                </div>

                <div class="min-w-0 flex-1">
                  <!-- Nome + badge -->
                  <div class="flex items-center gap-2 flex-wrap mb-1">
                    <span class="font-semibold text-slate-900 dark:text-white text-sm leading-tight truncate max-w-[160px]">
                      {{ inst.nome_instancia }}
                    </span>
                    <span
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      :class="getStatus(inst.status).badge"
                    >
                      <span class="w-1.5 h-1.5 rounded-full" :class="getStatus(inst.status).dot" aria-hidden="true" />
                      {{ getStatus(inst.status).label }}
                    </span>
                  </div>

                  <!-- Telefone conectado -->
                  <div v-if="inst.phone"
                    class="flex items-center gap-1.5 mb-1.5"
                  >
                    <i class="fa-solid fa-phone text-emerald-500 text-[11px]" aria-hidden="true" />
                    <span class="text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums tracking-wide">
                      {{ inst.phone }}
                    </span>
                  </div>
                  <div v-else class="flex items-center gap-1.5 mb-1.5">
                    <i class="fa-solid fa-phone text-slate-300 dark:text-slate-700 text-[11px]" aria-hidden="true" />
                    <span class="text-xs text-slate-400 dark:text-slate-600 italic">Número não disponível</span>
                  </div>

                  <!-- ID expansível -->
                  <button
                    @click="toggleId(inst.id)"
                    class="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-400 dark:text-slate-600 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                    type="button"
                  >
                    <i class="fa-solid fa-fingerprint text-[10px]" aria-hidden="true" />
                    <span>{{ idExpandido === inst.id ? inst.id : inst.id.slice(0, 10) + '…' }}</span>
                    <span
                      v-if="idExpandido === inst.id"
                      @click.stop="copiarId(inst.id)"
                      class="ml-1 p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      :class="idCopiado === inst.id ? 'text-emerald-500' : 'text-slate-400'"
                      role="button"
                      :aria-label="idCopiado === inst.id ? 'Copiado' : 'Copiar ID'"
                    >
                      <i :class="['fa-solid text-[10px]', idCopiado === inst.id ? 'fa-check' : 'fa-copy']" aria-hidden="true" />
                    </span>
                  </button>
                </div>
              </div>

              <!-- Direita: ações -->
              <div class="flex flex-col items-end gap-1 shrink-0">
                <button
                  v-if="inst.status === 'connected' || inst.status === 'disconnected'"
                  @click="abrirConfirmacao('desconectar', inst)"
                  class="w-8 h-8 flex items-center justify-center rounded transition-colors"
                  :class="inst.status === 'connected'
                    ? 'hover:bg-amber-50 dark:hover:bg-amber-500/10 text-amber-500 dark:text-amber-400'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-600'"
                  :title="inst.status === 'connected' ? 'Desconectar WhatsApp' : 'Forçar desconexão (status pode estar dessincronizado)'"
                  aria-label="Desconectar instância"
                  type="button"
                >
                  <i class="fa-solid fa-power-off text-sm" aria-hidden="true" />
                </button>
                <button
                  @click="abrirConfirmacao('excluir', inst)"
                  class="w-8 h-8 flex items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 dark:text-red-400 transition-colors"
                  title="Remover instância"
                  aria-label="Remover instância"
                  type="button"
                >
                  <i class="fa-solid fa-trash text-sm" aria-hidden="true" />
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Limite de canais -->
    <section class="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-4">
      <form @submit.prevent="$emit('confirm', quantidade)" class="space-y-3">
        <div class="flex items-start justify-between gap-3">
          <div>
            <label for="max-instancias" class="block text-sm font-semibold text-slate-700 dark:text-slate-300">
              Limite de canais
            </label>
            <p class="text-xs text-slate-400 dark:text-slate-600 mt-0.5">Máximo de instâncias simultâneas (1 – 20)</p>
          </div>
          <input
            id="max-instancias"
            v-model.number="quantidade"
            type="number"
            min="1"
            max="20"
            required
            class="w-20 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white tabular-nums text-center font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div class="flex gap-2 pt-1">
          <button
            type="button"
            @click="$emit('close')"
            class="flex-1 px-4 py-2.5 rounded font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            class="flex-1 px-4 py-2.5 rounded font-semibold text-sm bg-purple-600 hover:bg-purple-700 text-white transition-colors"
          >
            Salvar limite
          </button>
        </div>
      </form>
    </section>

    <!-- Dialog de confirmação -->
    <Teleport to="body">
      <div
        v-if="acaoConfirmacao"
        class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
      >
        <div class="w-full max-w-sm bg-white dark:bg-slate-900 rounded-md shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <!-- Cabeçalho colorido por ação -->
          <div
            class="px-5 py-4 flex items-center gap-3"
            :class="acaoConfirmacao.tipo === 'desconectar'
              ? 'bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/20'
              : 'bg-red-50 dark:bg-red-500/10 border-b border-red-200 dark:border-red-500/20'"
          >
            <div
              class="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              :class="acaoConfirmacao.tipo === 'desconectar' ? 'bg-amber-100 dark:bg-amber-500/20' : 'bg-red-100 dark:bg-red-500/20'"
            >
              <i
                class="fa-solid text-sm"
                :class="acaoConfirmacao.tipo === 'desconectar'
                  ? 'fa-power-off text-amber-600 dark:text-amber-400'
                  : 'fa-trash text-red-600 dark:text-red-400'"
                aria-hidden="true"
              />
            </div>
            <h3 class="font-bold text-slate-900 dark:text-white text-base">
              {{ acaoConfirmacao.tipo === 'desconectar' ? 'Desconectar canal' : 'Remover canal' }}
            </h3>
          </div>

          <!-- Corpo -->
          <div class="px-5 py-4 space-y-1">
            <p class="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {{ acaoConfirmacao.instancia.nome_instancia }}
            </p>
            <p v-if="acaoConfirmacao.instancia.phone" class="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
              {{ acaoConfirmacao.instancia.phone }}
            </p>
            <p class="text-sm text-slate-500 dark:text-slate-400 pt-1">
              <template v-if="acaoConfirmacao.tipo === 'desconectar'">
                O número será desconectado do WhatsApp. Um novo QR Code será necessário para reconectar.
              </template>
              <template v-else>
                O canal será <strong class="text-red-600 dark:text-red-400">removido permanentemente</strong> do sistema. O WhatsApp será desconectado e o histórico mantido.
              </template>
            </p>
          </div>

          <!-- Rodapé com botões -->
          <div class="px-5 py-3 flex gap-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
            <button
              type="button"
              @click="acaoConfirmacao = null"
              :disabled="processandoAcao"
              class="flex-1 px-4 py-2 rounded text-sm font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              @click="executarAcao"
              :disabled="processandoAcao"
              class="flex-1 px-4 py-2 rounded text-sm font-semibold text-white disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              :class="acaoConfirmacao.tipo === 'desconectar' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'"
            >
              <i v-if="processandoAcao" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
              {{ processandoAcao ? 'Aguarde…' : 'Confirmar' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

  </BaseModal>
</template>
