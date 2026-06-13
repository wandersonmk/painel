<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

definePageMeta({
  middleware: ['auth', 'super-admin'],
  layout: 'dashboard',
})

interface Trilha {
  id: string
  slug: string
  nome: string
  nivel_label: string
  descricao: string | null
  icone: string
  cor: string
  ordem: number
  ativo: boolean
}

interface Aula {
  id: string
  trilha_id: string
  titulo: string
  descricao: string | null
  video_url: string | null
  thumbnail_url: string | null
  duracao_segundos: number
  ordem: number
  ativo: boolean
}

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

const trilhas = ref<Trilha[]>([])
const aulas = ref<Aula[]>([])
const trilhaAtivaId = ref('')
const loading = ref(true)
const isRefreshing = ref(false)

// ───────── Carregamento ─────────
async function loadTudo() {
  try {
    const resp = await $fetch<{ success: boolean; data?: { trilhas: Trilha[]; aulas: Aula[] }; error?: string }>(
      '/api/admin/suporte/list',
      { headers: await useAdminAuthHeaders() },
    )
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Erro')
    trilhas.value = resp.data.trilhas
    aulas.value = resp.data.aulas
    if (!trilhaAtivaId.value || !trilhas.value.some(t => t.id === trilhaAtivaId.value)) {
      trilhaAtivaId.value = trilhas.value[0]?.id || ''
    }
  } catch (err: any) {
    toast?.error(err?.data?.statusMessage || err?.message || 'Erro ao carregar as aulas do app')
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

// ───────── Helpers ─────────
const corMap: Record<string, { text: string; bg: string; dot: string }> = {
  emerald: { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-500/15', dot: 'bg-emerald-500' },
  amber: { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-500/15', dot: 'bg-amber-500' },
  violet: { text: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-500/15', dot: 'bg-violet-500' },
}
function cor(t: Trilha) {
  return corMap[t.cor] || corMap.emerald!
}

function formatDuracao(s: number) {
  if (!s || s <= 0) return '—'
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function aulasDaTrilha(trilhaId: string) {
  return aulas.value
    .filter(a => a.trilha_id === trilhaId)
    .sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo))
}

const trilhaAtiva = computed(() => trilhas.value.find(t => t.id === trilhaAtivaId.value) || null)
const aulasAtivas = computed(() => trilhaAtivaId.value ? aulasDaTrilha(trilhaAtivaId.value) : [])

const totalComVideo = computed(() => aulas.value.filter(a => a.video_url).length)

// ───────── Criar / editar aula ─────────
const showAulaModal = ref(false)
const aulaEdit = ref<Aula | null>(null)
const ordemSugerida = ref(1)

function abrirNovaAula() {
  aulaEdit.value = null
  ordemSugerida.value = Math.max(0, ...aulasAtivas.value.map(a => a.ordem)) + 1
  showAulaModal.value = true
}

function abrirEditarAula(a: Aula) {
  aulaEdit.value = a
  showAulaModal.value = true
}

// ───────── Ativar / ocultar aula ─────────
async function toggleAulaAtiva(a: Aula) {
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/suporte/aula-salvar', {
      method: 'POST',
      body: {
        id: a.id,
        trilhaId: a.trilha_id,
        titulo: a.titulo,
        descricao: a.descricao,
        videoUrl: a.video_url,
        thumbnailUrl: a.thumbnail_url,
        duracaoSegundos: a.duracao_segundos,
        ordem: a.ordem,
        ativo: !a.ativo,
      },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro')
    a.ativo = !a.ativo
    toast?.success(a.ativo ? 'Aula visível no app' : 'Aula oculta no app (nada foi apagado)')
  } catch (err: any) {
    toast?.error(err?.data?.statusMessage || err?.message || 'Erro ao atualizar a aula')
  }
}

// ───────── Reordenar ─────────
const reordenando = ref(false)

async function moverAula(a: Aula, direcao: -1 | 1) {
  if (reordenando.value) return
  const lista = aulasAtivas.value
  const idx = lista.findIndex(x => x.id === a.id)
  const alvo = idx + direcao
  if (idx < 0 || alvo < 0 || alvo >= lista.length) return

  const novaOrdem = lista.map(x => x.id)
  ;[novaOrdem[idx], novaOrdem[alvo]] = [novaOrdem[alvo]!, novaOrdem[idx]!]

  reordenando.value = true
  // Atualização otimista — em caso de erro recarrega do banco
  novaOrdem.forEach((id, i) => {
    const aula = aulas.value.find(x => x.id === id)
    if (aula) aula.ordem = i + 1
  })
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/suporte/aulas-reordenar', {
      method: 'POST',
      body: { trilhaId: a.trilha_id, aulaIds: novaOrdem },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro')
  } catch (err: any) {
    toast?.error(err?.data?.statusMessage || err?.message || 'Erro ao reordenar — restaurando ordem do banco')
    await loadTudo()
  } finally {
    reordenando.value = false
  }
}

// ───────── Excluir aula (confirmação dupla) ─────────
const aulaParaExcluir = ref<Aula | null>(null)
const showExcluirEtapa2 = ref(false)
const cienteExclusao = ref(false)
const excluindo = ref(false)

function iniciarExclusao(a: Aula) {
  aulaParaExcluir.value = a
  cienteExclusao.value = false
  showExcluirEtapa2.value = false
}

function confirmarEtapa1() {
  showExcluirEtapa2.value = true
}

function cancelarExclusao() {
  aulaParaExcluir.value = null
  showExcluirEtapa2.value = false
  cienteExclusao.value = false
}

async function confirmarExclusaoFinal() {
  if (!aulaParaExcluir.value || !cienteExclusao.value || excluindo.value) return
  excluindo.value = true
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/suporte/aula-excluir', {
      method: 'POST',
      body: { id: aulaParaExcluir.value.id },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro')
    toast?.success('Aula excluída permanentemente')
    cancelarExclusao()
    await loadTudo()
  } catch (err: any) {
    toast?.error(err?.data?.statusMessage || err?.message || 'Erro ao excluir a aula')
  } finally {
    excluindo.value = false
  }
}

// ───────── Editar trilha ─────────
const showTrilhaModal = ref(false)
const trilhaEdit = ref<Trilha | null>(null)

function abrirEditarTrilha(t: Trilha) {
  trilhaEdit.value = t
  showTrilhaModal.value = true
}

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <div class="p-4 sm:p-6 md:p-10">
    <div class="max-w-[1100px] mx-auto space-y-6">

      <!-- Header -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div class="space-y-1">
          <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Aulas do App</h1>
          <p class="text-slate-500 dark:text-slate-400 text-sm">
            Vídeos das trilhas exibidas na página Suporte do app —
            <span class="font-semibold tabular-nums">{{ totalComVideo }}/{{ aulas.length }}</span> aulas com vídeo.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            @click="abrirNovaAula"
            class="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded text-sm font-semibold transition-colors"
            type="button"
          >
            <i class="fa-solid fa-plus text-purple-600 dark:text-purple-400" aria-hidden="true" />
            <span>Nova aula</span>
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

      <!-- Loading -->
      <div v-if="loading" class="space-y-4">
        <div class="h-12 rounded-lg bg-slate-100 dark:bg-white/5 animate-pulse" />
        <div class="h-72 rounded-md bg-slate-100 dark:bg-white/5 animate-pulse border border-slate-200 dark:border-white/5" />
      </div>

      <template v-else>
        <!-- Abas das trilhas -->
        <div class="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-lg w-full sm:w-fit overflow-x-auto" role="tablist">
          <button
            v-for="t in trilhas"
            :key="t.id"
            type="button" role="tab" :aria-selected="trilhaAtivaId === t.id"
            @click="trilhaAtivaId = t.id"
            class="flex-1 sm:flex-initial px-4 py-2 rounded-md text-sm font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            :class="trilhaAtivaId === t.id ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
          >
            <i class="fa-solid" :class="[t.icone, cor(t).text]" aria-hidden="true" />
            {{ t.nome }}
            <span class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
              {{ aulasDaTrilha(t.id).filter(a => a.video_url).length }}/{{ aulasDaTrilha(t.id).length }}
            </span>
          </button>
        </div>

        <template v-if="trilhaAtiva">
          <!-- Cabeçalho da trilha -->
          <div :class="['p-5 flex flex-col sm:flex-row sm:items-center gap-4', cardBase]">
            <div class="w-11 h-11 rounded-lg flex items-center justify-center shrink-0" :class="cor(trilhaAtiva).bg">
              <i class="fa-solid text-lg" :class="[trilhaAtiva.icone, cor(trilhaAtiva).text]" aria-hidden="true" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <p class="font-semibold text-slate-900 dark:text-white">{{ trilhaAtiva.nome }}</p>
                <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold" :class="[cor(trilhaAtiva).bg, cor(trilhaAtiva).text]">
                  <span class="w-1.5 h-1.5 rounded-full" :class="cor(trilhaAtiva).dot" aria-hidden="true" />
                  {{ trilhaAtiva.nivel_label }}
                </span>
                <span v-if="!trilhaAtiva.ativo" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400">
                  <i class="fa-solid fa-eye-slash" aria-hidden="true" />
                  Oculta no app
                </span>
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{{ trilhaAtiva.descricao || 'Sem descrição' }}</p>
            </div>
            <button
              @click="abrirEditarTrilha(trilhaAtiva)"
              class="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              type="button"
            >
              <i class="fa-solid fa-pen-to-square text-xs" aria-hidden="true" />
              Editar trilha
            </button>
          </div>

          <!-- Lista de aulas -->
          <div :class="['overflow-hidden', cardBase]">
            <div v-if="aulasAtivas.length === 0" class="px-5 py-14 text-center">
              <i class="fa-solid fa-circle-play text-slate-300 dark:text-slate-700 text-3xl mb-3 block" aria-hidden="true" />
              <p class="text-slate-600 dark:text-slate-400 text-sm font-medium">Nenhuma aula nesta trilha</p>
              <p class="text-slate-400 dark:text-slate-600 text-xs mt-1">Clique em "Nova aula" para adicionar a primeira.</p>
            </div>
            <div
              v-for="(a, idx) in aulasAtivas"
              :key="a.id"
              class="px-4 sm:px-5 py-3 flex items-center gap-3 border-b border-slate-100 dark:border-white/5 last:border-b-0"
              :class="{ 'opacity-50': !a.ativo }"
            >
              <!-- Setas de reordenação -->
              <div class="flex flex-col shrink-0">
                <button
                  @click="moverAula(a, -1)"
                  :disabled="idx === 0 || reordenando"
                  class="w-6 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-25 disabled:pointer-events-none transition-colors"
                  title="Mover para cima" type="button"
                >
                  <i class="fa-solid fa-chevron-up text-[10px]" aria-hidden="true" />
                </button>
                <button
                  @click="moverAula(a, 1)"
                  :disabled="idx === aulasAtivas.length - 1 || reordenando"
                  class="w-6 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-25 disabled:pointer-events-none transition-colors"
                  title="Mover para baixo" type="button"
                >
                  <i class="fa-solid fa-chevron-down text-[10px]" aria-hidden="true" />
                </button>
              </div>

              <span class="w-7 text-center text-xs font-bold text-slate-400 tabular-nums shrink-0">{{ a.ordem }}</span>

              <div class="w-9 h-9 rounded flex items-center justify-center shrink-0" :class="a.video_url ? 'bg-red-100 dark:bg-red-500/15' : 'bg-slate-100 dark:bg-white/5'">
                <i class="text-sm" :class="a.video_url ? 'fa-brands fa-youtube text-red-500' : 'fa-solid fa-hourglass-half text-slate-400'" aria-hidden="true" />
              </div>

              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-slate-800 dark:text-white truncate">{{ a.titulo }}</p>
                <p class="text-xs text-slate-500 truncate">{{ a.descricao || a.video_url || 'Sem descrição' }}</p>
              </div>

              <span
                class="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
                :class="a.video_url
                  ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400'"
              >
                <i class="fa-solid text-[9px]" :class="a.video_url ? 'fa-check' : 'fa-hourglass-half'" aria-hidden="true" />
                {{ a.video_url ? 'Com vídeo' : 'Em breve' }}
              </span>

              <span class="hidden md:inline text-xs text-slate-400 tabular-nums shrink-0 w-12 text-right" title="Duração">
                <i class="fa-regular fa-clock text-[10px] mr-1" aria-hidden="true" />{{ formatDuracao(a.duracao_segundos) }}
              </span>

              <div class="flex items-center gap-1 shrink-0">
                <button
                  @click="toggleAulaAtiva(a)"
                  class="w-8 h-8 flex items-center justify-center rounded transition-colors"
                  :class="a.ativo ? 'hover:bg-amber-50 dark:hover:bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'"
                  :title="a.ativo ? 'Ocultar do app (sem apagar)' : 'Mostrar no app'" type="button"
                >
                  <i class="fa-solid text-sm" :class="a.ativo ? 'fa-eye-slash' : 'fa-eye'" aria-hidden="true" />
                </button>
                <button
                  @click="abrirEditarAula(a)"
                  class="w-8 h-8 flex items-center justify-center rounded hover:bg-blue-50 dark:hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 transition-colors"
                  title="Editar aula" type="button"
                >
                  <i class="fa-solid fa-pen-to-square text-sm" aria-hidden="true" />
                </button>
                <button
                  @click="iniciarExclusao(a)"
                  class="w-8 h-8 flex items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 dark:text-red-400 transition-colors"
                  title="Excluir aula (apaga progresso dos clientes)" type="button"
                >
                  <i class="fa-solid fa-trash text-sm" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </template>
      </template>

      <!-- Modais -->
      <AdminSuporteAulaModal
        :show="showAulaModal"
        :trilhas="trilhas"
        :aula="aulaEdit"
        :trilha-id-padrao="trilhaAtivaId"
        :ordem-sugerida="ordemSugerida"
        @close="showAulaModal = false"
        @saved="loadTudo"
      />

      <AdminSuporteTrilhaModal
        :show="showTrilhaModal"
        :trilha="trilhaEdit"
        @close="showTrilhaModal = false"
        @saved="loadTudo"
      />

      <!-- Exclusão — etapa 1: aviso e alternativa -->
      <AdminConfirmacaoModal
        :show="!!aulaParaExcluir && !showExcluirEtapa2"
        title="Excluir aula?"
        message="Excluir apaga PERMANENTEMENTE o progresso e as anotações dos clientes nesta aula. Se quiser apenas tirá-la do app, use o botão de ocultar (olho). Deseja mesmo excluir"
        :cliente-nome="aulaParaExcluir?.titulo"
        confirm-label="Continuar exclusão"
        variant="danger"
        @close="cancelarExclusao"
        @confirm="confirmarEtapa1"
      />

      <!-- Exclusão — etapa 2: confirmação final com ciência -->
      <BaseModal :show="!!aulaParaExcluir && showExcluirEtapa2" title="Confirmação final" @close="cancelarExclusao">
        <div class="space-y-4">
          <div class="px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 flex items-start gap-2.5">
            <i class="fa-solid fa-triangle-exclamation text-red-500 mt-0.5" aria-hidden="true" />
            <p class="text-xs text-red-700 dark:text-red-400">
              A aula <span class="font-bold">{{ aulaParaExcluir?.titulo }}</span> será apagada do banco, junto com o
              progresso de vídeo e as anotações de TODOS os clientes nessa aula. Essa ação não tem volta.
            </p>
          </div>
          <label class="flex items-start gap-2.5 cursor-pointer select-none">
            <input v-model="cienteExclusao" type="checkbox" class="mt-0.5 w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-red-600 focus:ring-red-500" />
            <span class="text-sm text-slate-700 dark:text-slate-300">Entendo que o progresso e as anotações dos clientes serão apagados permanentemente.</span>
          </label>
          <div class="flex gap-2">
            <button type="button" @click="cancelarExclusao"
              class="flex-1 px-4 py-2.5 rounded-lg font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              Cancelar
            </button>
            <button type="button" :disabled="!cienteExclusao || excluindo" @click="confirmarExclusaoFinal"
              class="flex-1 px-4 py-2.5 rounded-lg font-semibold text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white transition-colors flex items-center justify-center gap-2">
              <i v-if="excluindo" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
              {{ excluindo ? 'Excluindo…' : 'Excluir de vez' }}
            </button>
          </div>
        </div>
      </BaseModal>

    </div>
  </div>
</template>
