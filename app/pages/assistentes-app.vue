<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

definePageMeta({
  middleware: ['auth', 'super-admin'],
  layout: 'dashboard',
})

interface Modelo {
  id: string
  slug: string
  nome: string
  segmento: string | null
  descricao: string | null
  icone: string
  cor: string
  personalidade: string | null
  instrucao_principal: string
  requer_api: boolean
  integracao_video_url: string | null
  ordem: number
  ativo: boolean
  created_at: string
}

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

const modelos = ref<Modelo[]>([])
const loading = ref(true)
const isRefreshing = ref(false)
const busca = ref('')

// ───────── Carregamento ─────────
async function loadTudo() {
  try {
    const resp = await $fetch<{ success: boolean; data?: Modelo[]; error?: string }>(
      '/api/admin/assistentes/list',
      { headers: await useAdminAuthHeaders() },
    )
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Erro')
    modelos.value = resp.data
  } catch (err: any) {
    toast?.error(err?.data?.statusMessage || err?.message || 'Erro ao carregar os modelos de assistente')
  }
}

async function refreshAll() {
  isRefreshing.value = true
  await loadTudo()
  isRefreshing.value = false
}

onMounted(async () => {
  toast = await useToastSafe()
  loading.value = true
  await loadTudo()
  loading.value = false
})

// ───────── Derivados ─────────
const modelosOrdenados = computed(() =>
  [...modelos.value].sort((a, b) => a.ordem - b.ordem || a.created_at.localeCompare(b.created_at)),
)

const modelosFiltrados = computed(() => {
  const q = busca.value.trim().toLowerCase()
  if (!q) return modelosOrdenados.value
  return modelosOrdenados.value.filter(m =>
    m.nome.toLowerCase().includes(q)
    || (m.segmento || '').toLowerCase().includes(q)
    || (m.descricao || '').toLowerCase().includes(q),
  )
})

const totalComApi = computed(() => modelos.value.filter(m => m.requer_api).length)
const podeReordenar = computed(() => !busca.value.trim())

// ───────── Criar / editar ─────────
const showModal = ref(false)
const modeloEdit = ref<Modelo | null>(null)
const ordemSugerida = ref(1)

function abrirNovo() {
  modeloEdit.value = null
  ordemSugerida.value = Math.max(0, ...modelos.value.map(m => m.ordem)) + 1
  showModal.value = true
}

function abrirEditar(m: Modelo) {
  modeloEdit.value = m
  showModal.value = true
}

// ───────── Visível / oculto ─────────
async function toggleAtivo(m: Modelo) {
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/assistentes/salvar', {
      method: 'POST',
      body: {
        id: m.id,
        nome: m.nome,
        segmento: m.segmento,
        icone: m.icone,
        cor: m.cor,
        descricao: m.descricao,
        personalidade: m.personalidade,
        instrucaoPrincipal: m.instrucao_principal,
        requerApi: m.requer_api,
        integracaoVideoUrl: m.integracao_video_url,
        ordem: m.ordem,
        ativo: !m.ativo,
      },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro')
    m.ativo = !m.ativo
    toast?.success(m.ativo ? 'Modelo visível no app' : 'Modelo oculto no app')
  } catch (err: any) {
    toast?.error(err?.data?.statusMessage || err?.message || 'Erro ao atualizar o modelo')
  }
}

// ───────── Reordenar ─────────
const reordenando = ref(false)

async function mover(m: Modelo, direcao: -1 | 1) {
  if (reordenando.value || !podeReordenar.value) return
  const lista = modelosOrdenados.value
  const idx = lista.findIndex(x => x.id === m.id)
  const alvo = idx + direcao
  if (idx < 0 || alvo < 0 || alvo >= lista.length) return

  const novaOrdem = lista.map(x => x.id)
  ;[novaOrdem[idx], novaOrdem[alvo]] = [novaOrdem[alvo]!, novaOrdem[idx]!]

  reordenando.value = true
  // Atualização otimista
  novaOrdem.forEach((id, i) => {
    const mod = modelos.value.find(x => x.id === id)
    if (mod) mod.ordem = i + 1
  })
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/assistentes/reordenar', {
      method: 'POST',
      body: { ids: novaOrdem },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro')
  } catch (err: any) {
    toast?.error(err?.data?.statusMessage || err?.message || 'Erro ao reordenar — restaurando do banco')
    await loadTudo()
  } finally {
    reordenando.value = false
  }
}

// ───────── Excluir ─────────
const modeloParaExcluir = ref<Modelo | null>(null)
const excluindo = ref(false)

async function confirmarExclusao() {
  if (!modeloParaExcluir.value || excluindo.value) return
  excluindo.value = true
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/assistentes/excluir', {
      method: 'POST',
      body: { id: modeloParaExcluir.value.id },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro')
    toast?.success('Modelo excluído')
    modeloParaExcluir.value = null
    await loadTudo()
  } catch (err: any) {
    toast?.error(err?.data?.statusMessage || err?.message || 'Erro ao excluir o modelo')
  } finally {
    excluindo.value = false
  }
}

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <div class="p-4 sm:p-6 md:p-10">
    <div class="max-w-[1100px] mx-auto space-y-6">

      <!-- Header -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div class="space-y-1">
          <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Modelos de Assistente</h1>
          <p class="text-slate-500 dark:text-slate-400 text-sm">
            Assistentes prontos exibidos na aba <span class="font-medium">Materiais</span> do app —
            <span class="font-semibold tabular-nums">{{ modelos.length }}</span> modelos,
            <span class="font-semibold tabular-nums">{{ totalComApi }}</span> com integração.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            @click="abrirNovo"
            class="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded text-sm font-semibold transition-colors"
            type="button"
          >
            <i class="fa-solid fa-plus text-purple-600 dark:text-purple-400" aria-hidden="true" />
            <span>Novo modelo</span>
          </button>
          <button
            @click="refreshAll"
            :disabled="isRefreshing"
            class="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-sm font-semibold transition-colors"
            type="button"
          >
            <i class="fa-solid fa-arrows-rotate" :class="{ 'animate-spin': isRefreshing }" aria-hidden="true" />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      <!-- Busca -->
      <div class="relative">
        <i class="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm" aria-hidden="true" />
        <input
          v-model="busca"
          type="text"
          placeholder="Buscar modelo por nome ou segmento (ex.: pet shop, advocacia)…"
          class="w-full pl-11 pr-4 py-3 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      <!-- Loading -->
      <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="i in 3" :key="i" class="h-48 rounded-md bg-slate-100 dark:bg-white/5 animate-pulse border border-slate-200 dark:border-white/5" />
      </div>

      <template v-else>
        <!-- Vazio -->
        <div v-if="modelosFiltrados.length === 0" :class="['px-5 py-16 text-center', cardBase]">
          <i class="fa-solid fa-wand-magic-sparkles text-slate-300 dark:text-slate-700 text-3xl mb-3 block" aria-hidden="true" />
          <p class="text-slate-600 dark:text-slate-400 text-sm font-medium">
            {{ busca.trim() ? 'Nenhum modelo encontrado para essa busca' : 'Nenhum modelo cadastrado' }}
          </p>
          <p class="text-slate-400 dark:text-slate-600 text-xs mt-1">
            {{ busca.trim() ? 'Tente outro termo.' : 'Clique em "Novo modelo" para criar o primeiro.' }}
          </p>
        </div>

        <!-- Grid de cards -->
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="(m, idx) in modelosFiltrados"
            :key="m.id"
            :class="['flex flex-col p-4 transition-opacity', cardBase, { 'opacity-60': !m.ativo }]"
          >
            <!-- Topo: ícone + selos -->
            <div class="flex items-start justify-between gap-2">
              <div class="w-11 h-11 rounded-lg flex items-center justify-center shrink-0" :class="corDoAssistente(m.cor).soft">
                <i class="fa-solid text-lg" :class="[m.icone, corDoAssistente(m.cor).text]" aria-hidden="true" />
              </div>
              <div class="flex flex-wrap items-center justify-end gap-1">
                <span
                  v-if="m.requer_api"
                  class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400"
                  title="Tem integração via API"
                >
                  <i class="fa-solid fa-plug text-[9px]" aria-hidden="true" />
                  API
                </span>
                <span
                  v-if="m.requer_api && !m.integracao_video_url"
                  class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400"
                  title="Integração marcada, mas sem vídeo de configuração"
                >
                  <i class="fa-solid fa-triangle-exclamation text-[9px]" aria-hidden="true" />
                  Sem vídeo
                </span>
                <span
                  v-if="!m.ativo"
                  class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                  title="Oculto no app"
                >
                  <i class="fa-solid fa-eye-slash text-[9px]" aria-hidden="true" />
                  Oculto
                </span>
              </div>
            </div>

            <!-- Nome + segmento -->
            <div class="mt-3 min-w-0">
              <p class="font-semibold text-slate-900 dark:text-white truncate">{{ m.nome }}</p>
              <span v-if="m.segmento" class="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold" :class="[corDoAssistente(m.cor).soft, corDoAssistente(m.cor).text]">
                {{ m.segmento }}
              </span>
            </div>

            <p class="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-3 flex-1">
              {{ m.descricao || 'Sem descrição' }}
            </p>

            <!-- Vídeo de integração (resumo) -->
            <a
              v-if="m.requer_api && m.integracao_video_url"
              :href="m.integracao_video_url"
              target="_blank"
              rel="noopener"
              class="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-purple-600 dark:text-purple-400 hover:underline truncate"
              title="Abrir vídeo de configuração"
            >
              <i class="fa-solid fa-circle-play text-[10px]" aria-hidden="true" />
              <span class="truncate">Vídeo de configuração</span>
            </a>

            <!-- Footer: ações -->
            <div class="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between gap-1">
              <div class="flex items-center gap-0.5">
                <button
                  @click="mover(m, -1)"
                  :disabled="!podeReordenar || idx === 0 || reordenando"
                  class="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-25 disabled:pointer-events-none transition-colors"
                  :title="podeReordenar ? 'Mover para cima' : 'Limpe a busca para reordenar'" type="button"
                >
                  <i class="fa-solid fa-chevron-up text-[10px]" aria-hidden="true" />
                </button>
                <button
                  @click="mover(m, 1)"
                  :disabled="!podeReordenar || idx === modelosFiltrados.length - 1 || reordenando"
                  class="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-25 disabled:pointer-events-none transition-colors"
                  :title="podeReordenar ? 'Mover para baixo' : 'Limpe a busca para reordenar'" type="button"
                >
                  <i class="fa-solid fa-chevron-down text-[10px]" aria-hidden="true" />
                </button>
              </div>

              <div class="flex items-center gap-0.5">
                <button
                  @click="toggleAtivo(m)"
                  class="w-8 h-8 flex items-center justify-center rounded transition-colors"
                  :class="m.ativo ? 'hover:bg-amber-50 dark:hover:bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'"
                  :title="m.ativo ? 'Ocultar do app' : 'Mostrar no app'" type="button"
                >
                  <i class="fa-solid text-sm" :class="m.ativo ? 'fa-eye-slash' : 'fa-eye'" aria-hidden="true" />
                </button>
                <button
                  @click="abrirEditar(m)"
                  class="w-8 h-8 flex items-center justify-center rounded hover:bg-blue-50 dark:hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 transition-colors"
                  title="Editar modelo" type="button"
                >
                  <i class="fa-solid fa-pen-to-square text-sm" aria-hidden="true" />
                </button>
                <button
                  @click="modeloParaExcluir = m"
                  class="w-8 h-8 flex items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 dark:text-red-400 transition-colors"
                  title="Excluir modelo" type="button"
                >
                  <i class="fa-solid fa-trash text-sm" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Modal criar/editar -->
      <AdminAssistenteModeloModal
        :show="showModal"
        :modelo="modeloEdit"
        :ordem-sugerida="ordemSugerida"
        @close="showModal = false"
        @saved="loadTudo"
      />

      <!-- Confirmação de exclusão -->
      <AdminConfirmacaoModal
        :show="!!modeloParaExcluir"
        title="Excluir modelo?"
        message="O modelo deixará de aparecer na aba Materiais do app. Os assistentes que os clientes já criaram a partir dele não são afetados. Se quiser apenas tirá-lo do app, use o botão de ocultar (olho). Excluir mesmo o modelo"
        :cliente-nome="modeloParaExcluir?.nome"
        confirm-label="Excluir modelo"
        variant="danger"
        @close="modeloParaExcluir = null"
        @confirm="confirmarExclusao"
      />

    </div>
  </div>
</template>
