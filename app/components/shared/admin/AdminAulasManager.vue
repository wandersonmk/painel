<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

interface Categoria {
  id: string
  nome: string
  ordem: number
  ativo: boolean
}

interface Aula {
  id: string
  titulo: string
  descricao: string | null
  youtube_url: string
  ordem: number
  ativo: boolean
  categoria_id: string | null
}

const emit = defineEmits<{ 'count-change': [count: number] }>()

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

const categorias = ref<Categoria[]>([])
const aulas = ref<Aula[]>([])
const loading = ref(true)

async function loadTudo() {
  try {
    const resp = await $fetch<{ success: boolean; data?: { aulas: Aula[]; categorias: Categoria[] }; error?: string }>(
      '/api/admin/aulas/list',
      { headers: await useAdminAuthHeaders() },
    )
    if (resp.success && resp.data) {
      aulas.value = resp.data.aulas
      categorias.value = resp.data.categorias
      emit('count-change', aulas.value.length)
    }
  } catch {
    toast?.error('Erro ao carregar aulas')
  }
}

onMounted(async () => {
  toast = await useToastSafe()
  loading.value = true
  await loadTudo()
  loading.value = false
})

// ───────── Módulos (categorias) ─────────
const catEdit = ref<Categoria | null>(null)
const catNome = ref('')
const catOrdem = ref(0)
const savingCat = ref(false)
const catParaExcluir = ref<Categoria | null>(null)

function editarCategoria(c: Categoria) {
  catEdit.value = c
  catNome.value = c.nome
  catOrdem.value = c.ordem
}

function limparFormCategoria() {
  catEdit.value = null
  catNome.value = ''
  catOrdem.value = categorias.value.length
}

async function salvarCategoria() {
  if (!catNome.value.trim() || savingCat.value) return
  savingCat.value = true
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/aulas/categoria-salvar', {
      method: 'POST',
      body: { id: catEdit.value?.id, nome: catNome.value, ordem: catOrdem.value },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro')
    toast?.success(catEdit.value ? 'Módulo atualizado' : 'Módulo criado')
    limparFormCategoria()
    await loadTudo()
  } catch (err: any) {
    toast?.error(err?.data?.statusMessage || err?.message || 'Erro ao salvar módulo')
  } finally {
    savingCat.value = false
  }
}

async function confirmExcluirCategoria() {
  if (!catParaExcluir.value) return
  try {
    const resp = await $fetch<{ success: boolean }>('/api/admin/aulas/categoria-excluir', {
      method: 'POST', body: { id: catParaExcluir.value.id }, headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error('Erro')
    toast?.success('Módulo excluído — as aulas dele ficaram sem módulo')
    await loadTudo()
  } catch { toast?.error('Erro ao excluir módulo') }
  catParaExcluir.value = null
}

// ───────── Aulas ─────────
const aulaEdit = ref<Aula | null>(null)
const aulaTitulo = ref('')
const aulaDescricao = ref('')
const aulaUrl = ref('')
const aulaOrdem = ref(0)
const aulaCategoriaId = ref<string>('')
const savingAula = ref(false)
const aulaParaExcluir = ref<Aula | null>(null)

function editarAula(a: Aula) {
  aulaEdit.value = a
  aulaTitulo.value = a.titulo
  aulaDescricao.value = a.descricao || ''
  aulaUrl.value = a.youtube_url
  aulaOrdem.value = a.ordem
  aulaCategoriaId.value = a.categoria_id || ''
}

function limparFormAula() {
  aulaEdit.value = null
  aulaTitulo.value = ''
  aulaDescricao.value = ''
  aulaUrl.value = ''
  aulaOrdem.value = 0
  aulaCategoriaId.value = ''
}

async function salvarAula() {
  if (!aulaTitulo.value.trim() || !aulaUrl.value.trim() || savingAula.value) return
  savingAula.value = true
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/aulas/salvar', {
      method: 'POST',
      body: {
        id: aulaEdit.value?.id,
        titulo: aulaTitulo.value,
        descricao: aulaDescricao.value,
        youtubeUrl: aulaUrl.value,
        ordem: aulaOrdem.value,
        ativo: aulaEdit.value?.ativo ?? true,
        categoriaId: aulaCategoriaId.value || null,
      },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro')
    toast?.success(aulaEdit.value ? 'Aula atualizada' : 'Aula publicada')
    limparFormAula()
    await loadTudo()
  } catch (err: any) {
    toast?.error(err?.data?.statusMessage || err?.message || 'Erro ao salvar aula')
  } finally {
    savingAula.value = false
  }
}

async function toggleAulaAtiva(a: Aula) {
  try {
    const resp = await $fetch<{ success: boolean }>('/api/admin/aulas/salvar', {
      method: 'POST',
      body: { id: a.id, titulo: a.titulo, descricao: a.descricao, youtubeUrl: a.youtube_url, ordem: a.ordem, ativo: !a.ativo, categoriaId: a.categoria_id },
      headers: await useAdminAuthHeaders(),
    })
    if (resp.success) { a.ativo = !a.ativo }
  } catch { toast?.error('Erro ao atualizar aula') }
}

async function confirmExcluirAula() {
  if (!aulaParaExcluir.value) return
  try {
    const resp = await $fetch<{ success: boolean }>('/api/admin/aulas/excluir', {
      method: 'POST', body: { id: aulaParaExcluir.value.id }, headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error('Erro')
    toast?.success('Aula excluída')
    await loadTudo()
  } catch { toast?.error('Erro ao excluir aula') }
  aulaParaExcluir.value = null
}

/** Aulas agrupadas por módulo (na ordem dos módulos), com "Sem módulo" no fim. */
const grupos = computed(() => {
  const lista: Array<{ id: string | null; nome: string; aulas: Aula[] }> = []
  for (const c of categorias.value) {
    lista.push({ id: c.id, nome: c.nome, aulas: aulas.value.filter(a => a.categoria_id === c.id) })
  }
  const semModulo = aulas.value.filter(a => !a.categoria_id || !categorias.value.some(c => c.id === a.categoria_id))
  if (semModulo.length > 0) lista.push({ id: null, nome: 'Sem módulo', aulas: semModulo })
  return lista
})

function nomeCategoria(id: string | null) {
  return categorias.value.find(c => c.id === id)?.nome ?? 'Sem módulo'
}

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <div class="space-y-6">

    <!-- ───────── Módulos ───────── -->
    <div :class="['p-5', cardBase]">
      <h3 class="text-sm font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
        <i class="fa-solid fa-layer-group text-purple-500" aria-hidden="true" />
        Módulos (categorias)
      </h3>

      <form @submit.prevent="salvarCategoria" class="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          v-model="catNome"
          type="text"
          :placeholder="catEdit ? `Renomear “${catEdit.nome}”` : 'Nome do novo módulo (ex.: Primeiros passos)'"
          class="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <input
          v-model.number="catOrdem"
          type="number"
          min="0"
          title="Posição do módulo"
          class="w-20 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <div class="flex gap-2">
          <button
            v-if="catEdit"
            type="button"
            @click="limparFormCategoria"
            class="px-4 py-2 rounded font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            :disabled="savingCat || !catNome.trim()"
            class="px-4 py-2 rounded font-semibold text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white transition-colors flex items-center gap-2"
          >
            <i v-if="savingCat" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
            {{ catEdit ? 'Atualizar' : 'Criar módulo' }}
          </button>
        </div>
      </form>

      <div v-if="categorias.length === 0" class="text-xs text-slate-400 dark:text-slate-600">
        Nenhum módulo criado ainda — crie módulos para organizar as aulas no portal do parceiro.
      </div>
      <div v-else class="flex flex-wrap gap-2">
        <div
          v-for="c in categorias"
          :key="c.id"
          class="inline-flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-white/[0.03]"
        >
          <span class="text-[10px] font-bold text-slate-400 tabular-nums">#{{ c.ordem }}</span>
          <span class="text-xs font-semibold text-slate-700 dark:text-slate-200">{{ c.nome }}</span>
          <span class="text-[10px] text-slate-400 tabular-nums">{{ aulas.filter(a => a.categoria_id === c.id).length }} aula(s)</span>
          <button @click="editarCategoria(c)" class="w-6 h-6 flex items-center justify-center rounded-full hover:bg-blue-50 dark:hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 transition-colors" title="Editar módulo" type="button">
            <i class="fa-solid fa-pen-to-square text-[10px]" aria-hidden="true" />
          </button>
          <button @click="catParaExcluir = c" class="w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 dark:text-red-400 transition-colors" title="Excluir módulo" type="button">
            <i class="fa-solid fa-trash text-[10px]" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>

    <!-- ───────── Form da aula + lista agrupada ───────── -->
    <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <!-- Form -->
      <div :class="['p-5 lg:col-span-2 h-fit', cardBase]">
        <h3 class="text-sm font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
          <i class="fa-brands fa-youtube text-red-500" aria-hidden="true" />
          {{ aulaEdit ? 'Editar aula' : 'Publicar nova aula' }}
        </h3>
        <form @submit.prevent="salvarAula" class="space-y-3">
          <div>
            <label for="aula-titulo" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Título</label>
            <input id="aula-titulo" v-model="aulaTitulo" type="text" required placeholder="Ex.: Como conectar o WhatsApp"
              class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label for="aula-url" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Link do YouTube</label>
            <input id="aula-url" v-model="aulaUrl" type="url" required placeholder="https://youtube.com/watch?v=…"
              class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label for="aula-desc" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Descrição <span class="font-normal text-slate-400">(opcional)</span></label>
            <textarea id="aula-desc" v-model="aulaDescricao" rows="2" placeholder="O que o parceiro vai aprender"
              class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="aula-modulo" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Módulo</label>
              <select id="aula-modulo" v-model="aulaCategoriaId"
                class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
                <option value="">Sem módulo</option>
                <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nome }}</option>
              </select>
            </div>
            <div>
              <label for="aula-ordem" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Posição no módulo</label>
              <input id="aula-ordem" v-model.number="aulaOrdem" type="number" min="0"
                class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
          </div>
          <div class="flex gap-2 pt-1">
            <button v-if="aulaEdit" type="button" @click="limparFormAula"
              class="flex-1 px-4 py-2 rounded font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              Cancelar
            </button>
            <button type="submit" :disabled="savingAula || !aulaTitulo.trim() || !aulaUrl.trim()"
              class="flex-1 px-4 py-2 rounded font-semibold text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white transition-colors flex items-center justify-center gap-2">
              <i v-if="savingAula" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
              {{ savingAula ? 'Salvando…' : (aulaEdit ? 'Atualizar' : 'Publicar aula') }}
            </button>
          </div>
        </form>
      </div>

      <!-- Lista agrupada por módulo -->
      <div :class="['overflow-hidden lg:col-span-3', cardBase]">
        <div v-if="loading" class="p-5 space-y-3">
          <div v-for="i in 3" :key="i" class="h-14 bg-slate-100 dark:bg-white/5 rounded animate-pulse" />
        </div>
        <div v-else-if="aulas.length === 0" class="px-5 py-14 text-center">
          <i class="fa-solid fa-graduation-cap text-slate-300 dark:text-slate-700 text-3xl mb-3 block" aria-hidden="true" />
          <p class="text-slate-600 dark:text-slate-400 text-sm font-medium">Nenhuma aula publicada</p>
          <p class="text-slate-400 dark:text-slate-600 text-xs mt-1">As aulas publicadas aparecem no portal do parceiro.</p>
        </div>
        <div v-else>
          <div v-for="grupo in grupos" :key="grupo.id ?? 'sem-modulo'">
            <div v-if="grupo.aulas.length > 0" class="px-4 sm:px-5 py-2 bg-slate-50/80 dark:bg-white/[0.02] border-y border-slate-100 dark:border-white/5 first:border-t-0 flex items-center gap-2">
              <i class="fa-solid fa-layer-group text-purple-400 text-[10px]" aria-hidden="true" />
              <span class="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{{ grupo.nome }}</span>
              <span class="text-[10px] text-slate-400 tabular-nums">{{ grupo.aulas.length }}</span>
            </div>
            <div
              v-for="a in grupo.aulas"
              :key="a.id"
              class="px-4 sm:px-5 py-3 flex items-center gap-3 border-b border-slate-100 dark:border-white/5 last:border-b-0"
              :class="{ 'opacity-50': !a.ativo }"
            >
              <div class="w-9 h-9 rounded bg-red-100 dark:bg-red-500/15 flex items-center justify-center shrink-0">
                <i class="fa-brands fa-youtube text-red-500" aria-hidden="true" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-slate-800 dark:text-white truncate">{{ a.titulo }}</p>
                <p class="text-xs text-slate-500 truncate">{{ a.descricao || a.youtube_url }}</p>
              </div>
              <span class="hidden sm:inline text-[10px] text-slate-400 tabular-nums shrink-0" :title="`Posição no módulo ${nomeCategoria(a.categoria_id)}`">#{{ a.ordem }}</span>
              <div class="flex items-center gap-1 shrink-0">
                <button @click="toggleAulaAtiva(a)" class="w-8 h-8 flex items-center justify-center rounded transition-colors" :class="a.ativo ? 'hover:bg-amber-50 dark:hover:bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'" :title="a.ativo ? 'Ocultar do portal' : 'Publicar no portal'" type="button">
                  <i class="fa-solid text-sm" :class="a.ativo ? 'fa-eye-slash' : 'fa-eye'" aria-hidden="true" />
                </button>
                <button @click="editarAula(a)" class="w-8 h-8 flex items-center justify-center rounded hover:bg-blue-50 dark:hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 transition-colors" title="Editar aula" type="button">
                  <i class="fa-solid fa-pen-to-square text-sm" aria-hidden="true" />
                </button>
                <button @click="aulaParaExcluir = a" class="w-8 h-8 flex items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 dark:text-red-400 transition-colors" title="Excluir aula" type="button">
                  <i class="fa-solid fa-trash text-sm" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Confirmações -->
    <AdminConfirmacaoModal
      :show="!!aulaParaExcluir"
      title="Excluir aula"
      message="A aula será removida do portal do parceiro. Deseja excluir"
      :cliente-nome="aulaParaExcluir?.titulo"
      confirm-label="Excluir"
      variant="danger"
      @close="aulaParaExcluir = null"
      @confirm="confirmExcluirAula"
    />

    <AdminConfirmacaoModal
      :show="!!catParaExcluir"
      title="Excluir módulo"
      message="As aulas deste módulo NÃO serão apagadas — ficam como 'Sem módulo'. Deseja excluir"
      :cliente-nome="catParaExcluir?.nome"
      confirm-label="Excluir"
      variant="danger"
      @close="catParaExcluir = null"
      @confirm="confirmExcluirCategoria"
    />

  </div>
</template>
