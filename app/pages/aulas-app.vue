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
  grupo: string
  ordem: number
  ativo: boolean
}

interface Aula {
  id: string
  trilha_id: string
  titulo: string
  descricao: string | null
  secao: string | null
  video_url: string | null
  thumbnail_url: string | null
  duracao_segundos: number
  ordem: number
  ativo: boolean
}

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

const trilhas = ref<Trilha[]>([])
const aulas = ref<Aula[]>([])
// 'fila' = fila de gravação (todas as aulas sem vídeo); senão, id da trilha.
const selecao = ref<string>('fila')
const filtroVideo = ref<'todas' | 'sem' | 'com'>('todas')
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
    trilhas.value = resp.data.trilhas.map(t => ({ ...t, grupo: t.grupo || 'modulos' }))
    aulas.value = resp.data.aulas
    if (selecao.value !== 'fila' && !trilhas.value.some(t => t.id === selecao.value)) selecao.value = 'fila'
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

// ───────── Grupos e cores (iguais aos da página de Aulas do app) ─────────
const GRUPOS = [
  { id: 'comece', nome: 'Comece por aqui' },
  { id: 'atendimento', nome: 'Atendimento e vendas' },
  { id: 'ia', nome: 'Inteligência Artificial' },
  { id: 'modulos', nome: 'Módulos' },
  { id: 'avancado', nome: 'Integrações e gestão' },
  { id: 'crescimento', nome: 'Parcerias' },
]
const corMap: Record<string, { text: string; bg: string; solid: string; dot: string }> = {
  emerald: { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-500/15', solid: 'bg-emerald-500', dot: 'bg-emerald-500' },
  sky: { text: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-100 dark:bg-sky-500/15', solid: 'bg-sky-500', dot: 'bg-sky-500' },
  indigo: { text: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-100 dark:bg-indigo-500/15', solid: 'bg-indigo-500', dot: 'bg-indigo-500' },
  orange: { text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-500/15', solid: 'bg-orange-500', dot: 'bg-orange-500' },
  teal: { text: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-100 dark:bg-teal-500/15', solid: 'bg-teal-500', dot: 'bg-teal-500' },
  violet: { text: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-500/15', solid: 'bg-violet-500', dot: 'bg-violet-500' },
  rose: { text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-100 dark:bg-rose-500/15', solid: 'bg-rose-500', dot: 'bg-rose-500' },
  cyan: { text: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-100 dark:bg-cyan-500/15', solid: 'bg-cyan-500', dot: 'bg-cyan-500' },
  amber: { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-500/15', solid: 'bg-amber-500', dot: 'bg-amber-500' },
  pink: { text: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-100 dark:bg-pink-500/15', solid: 'bg-pink-500', dot: 'bg-pink-500' },
  slate: { text: 'text-slate-600 dark:text-slate-300', bg: 'bg-slate-200 dark:bg-slate-500/20', solid: 'bg-slate-500', dot: 'bg-slate-500' },
  fuchsia: { text: 'text-fuchsia-600 dark:text-fuchsia-400', bg: 'bg-fuchsia-100 dark:bg-fuchsia-500/15', solid: 'bg-fuchsia-500', dot: 'bg-fuchsia-500' },
  lime: { text: 'text-lime-700 dark:text-lime-400', bg: 'bg-lime-100 dark:bg-lime-500/15', solid: 'bg-lime-500', dot: 'bg-lime-500' },
}
function cor(t: Trilha | null | undefined) {
  return corMap[t?.cor || ''] || corMap.violet!
}

function formatDuracao(s: number) {
  if (!s || s <= 0) return '—'
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// Tira a marcação (**negrito**, __sublinhado__, [texto](url)) pra mostrar a
// descrição limpa no preview da lista.
function descricaoLimpa(md: string | null) {
  if (!md) return ''
  return md
    .replace(/\[([^\]]+)\]\((?:https?:\/\/[^\s)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function aulasDaTrilha(trilhaId: string) {
  return aulas.value
    .filter(a => a.trilha_id === trilhaId)
    .sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo))
}
const contagem = (trilhaId: string) => {
  const lista = aulasDaTrilha(trilhaId).filter(a => a.ativo)
  const com = lista.filter(a => a.video_url).length
  return { total: lista.length, com, pct: lista.length ? Math.round((com / lista.length) * 100) : 0 }
}

const gruposComTrilhas = computed(() => {
  const ids = new Set(GRUPOS.map(g => g.id))
  const lista = GRUPOS.map(g => ({ ...g, trilhas: trilhas.value.filter(t => t.grupo === g.id) }))
  const outras = trilhas.value.filter(t => !ids.has(t.grupo))
  if (outras.length) lista.push({ id: 'outras', nome: 'Outras', trilhas: outras })
  return lista.filter(g => g.trilhas.length)
})

const trilhaAtiva = computed(() => trilhas.value.find(t => t.id === selecao.value) || null)
const aulasTrilhaAtiva = computed(() => (trilhaAtiva.value ? aulasDaTrilha(trilhaAtiva.value.id) : []))
const aulasFiltradas = computed(() => aulasTrilhaAtiva.value.filter(a =>
  filtroVideo.value === 'todas' || (filtroVideo.value === 'sem' ? !a.video_url : !!a.video_url)))

/** Blocos por seção, na ordem (seção que se repete adiante vira outro bloco). */
function emBlocos(lista: Aula[]) {
  const blocos: { secao: string | null; itens: Aula[] }[] = []
  for (const a of lista) {
    const s = a.secao?.trim() || null
    const ultimo = blocos[blocos.length - 1]
    if (ultimo && ultimo.secao === s) ultimo.itens.push(a)
    else blocos.push({ secao: s, itens: [a] })
  }
  return blocos
}

const secoesPorTrilha = computed(() => {
  const mapa: Record<string, string[]> = {}
  for (const a of aulas.value) {
    if (!a.secao) continue
    const lista = (mapa[a.trilha_id] ||= [])
    if (!lista.includes(a.secao)) lista.push(a.secao)
  }
  return mapa
})

// ───────── Números do topo ─────────
const trilhasAtivas = computed(() => trilhas.value.filter(t => t.ativo))
const aulasVisiveis = computed(() => aulas.value.filter(a => a.ativo && trilhasAtivas.value.some(t => t.id === a.trilha_id)))
const totalComVideo = computed(() => aulasVisiveis.value.filter(a => a.video_url).length)
const pctGravado = computed(() => (aulasVisiveis.value.length ? Math.round((totalComVideo.value / aulasVisiveis.value.length) * 100) : 0))

// ───────── Fila de gravação ─────────
const fila = computed(() => trilhasAtivas.value
  .map(t => ({ trilha: t, aulas: aulasDaTrilha(t.id).filter(a => a.ativo && !a.video_url) }))
  .filter(g => g.aulas.length))
const totalFila = computed(() => fila.value.reduce((s, g) => s + g.aulas.length, 0))

async function copiarTexto(texto: string) {
  try {
    await navigator.clipboard.writeText(texto)
    toast?.success('Copiado')
  } catch {
    toast?.error('Não foi possível copiar')
  }
}
function copiarRoteiro(g: { trilha: Trilha; aulas: Aula[] }) {
  const linhas = g.aulas.map(a => `${a.ordem}. ${a.titulo}${a.descricao ? `\n   ${descricaoLimpa(a.descricao)}` : ''}`)
  copiarTexto(`${g.trilha.nome}\n\n${linhas.join('\n')}`)
}

// ───────── Criar / editar aula ─────────
const showAulaModal = ref(false)
const aulaEdit = ref<Aula | null>(null)
const ordemSugerida = ref(1)

function abrirNovaAula() {
  aulaEdit.value = null
  ordemSugerida.value = Math.max(0, ...aulasTrilhaAtiva.value.map(a => a.ordem)) + 1
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

// ───────── Reordenar (só com o filtro "Todas", senão a troca pularia aulas escondidas) ─────────
const reordenando = ref(false)

async function moverAula(a: Aula, direcao: -1 | 1) {
  if (reordenando.value || filtroVideo.value !== 'todas') return
  const lista = aulasTrilhaAtiva.value
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

// ───────── Criar / editar trilha ─────────
const showTrilhaModal = ref(false)
const trilhaEdit = ref<Trilha | null>(null)
const ordemTrilhaSugerida = computed(() => Math.max(0, ...trilhas.value.map(t => t.ordem)) + 1)

function abrirNovaTrilha() {
  trilhaEdit.value = null
  showTrilhaModal.value = true
}
function abrirEditarTrilha(t: Trilha) {
  trilhaEdit.value = t
  showTrilhaModal.value = true
}
async function aoSalvarTrilha(id?: string) {
  await loadTudo()
  if (id) selecao.value = id
}

const cardBase = 'rounded-lg bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <div class="p-4 sm:p-6 lg:p-8">
    <div class="max-w-[1500px] mx-auto space-y-5">

      <!-- Header -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div class="space-y-1">
          <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Aulas do App</h1>
          <p class="text-slate-500 dark:text-slate-400 text-sm">Trilhas e vídeos da página Aulas do app, separados por módulo.</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button @click="abrirNovaTrilha" type="button"
            class="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded text-sm font-semibold transition-colors">
            <i class="fa-solid fa-layer-group text-purple-600 dark:text-purple-400" aria-hidden="true" />
            <span>Nova trilha</span>
          </button>
          <button @click="abrirNovaAula" type="button"
            class="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded text-sm font-semibold transition-colors">
            <i class="fa-solid fa-plus text-purple-600 dark:text-purple-400" aria-hidden="true" />
            <span>Nova aula</span>
          </button>
          <button @click="refreshAll" :disabled="isRefreshing" type="button"
            class="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-sm font-semibold transition-colors">
            <i class="fa-solid fa-arrows-rotate" :class="{ 'animate-spin': isRefreshing }" aria-hidden="true" />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="space-y-4">
        <div class="h-20 rounded-lg bg-slate-100 dark:bg-white/5 animate-pulse" />
        <div class="h-96 rounded-lg bg-slate-100 dark:bg-white/5 animate-pulse" />
      </div>

      <template v-else>
        <!-- Números -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div :class="['p-4', cardBase]">
            <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Trilhas no app</p>
            <p class="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{{ trilhasAtivas.length }}</p>
          </div>
          <div :class="['p-4', cardBase]">
            <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Aulas no app</p>
            <p class="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{{ aulasVisiveis.length }}</p>
          </div>
          <div :class="['p-4', cardBase]">
            <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Gravadas</p>
            <p class="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{{ totalComVideo }} <span class="text-sm font-semibold text-slate-400">({{ pctGravado }}%)</span></p>
            <div class="h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden mt-2">
              <div class="h-full rounded-full bg-emerald-500" :style="{ width: pctGravado + '%' }" />
            </div>
          </div>
          <button type="button" @click="selecao = 'fila'" :class="['p-4 text-left hover:border-amber-300 dark:hover:border-amber-500/40 transition-colors', cardBase]">
            <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Falta gravar</p>
            <p class="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">{{ totalFila }}</p>
            <p class="text-[11px] text-slate-500 mt-0.5">Abrir a fila de gravação →</p>
          </button>
        </div>

        <div class="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] items-start">
          <!-- Coluna das trilhas -->
          <aside :class="['p-2 lg:sticky lg:top-4 max-h-[calc(100vh-2rem)] overflow-y-auto', cardBase]">
            <button
              type="button"
              @click="selecao = 'fila'"
              class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-colors"
              :class="selecao === 'fila' ? 'bg-amber-50 dark:bg-amber-500/10' : 'hover:bg-slate-50 dark:hover:bg-white/5'"
            >
              <span class="w-8 h-8 rounded-md flex items-center justify-center bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0"><i class="fa-solid fa-video text-sm" aria-hidden="true" /></span>
              <span class="flex-1 text-sm font-semibold text-slate-800 dark:text-white">Fila de gravação</span>
              <span class="text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400">{{ totalFila }}</span>
            </button>

            <div v-for="g in gruposComTrilhas" :key="g.id" class="mt-3">
              <p class="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{{ g.nome }}</p>
              <button
                v-for="t in g.trilhas"
                :key="t.id"
                type="button"
                @click="selecao = t.id; filtroVideo = 'todas'"
                class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-colors"
                :class="[selecao === t.id ? 'bg-purple-50 dark:bg-purple-500/10' : 'hover:bg-slate-50 dark:hover:bg-white/5', t.ativo ? '' : 'opacity-50']"
              >
                <span class="w-8 h-8 rounded-md flex items-center justify-center shrink-0" :class="[cor(t).bg, cor(t).text]"><i class="fa-solid text-sm" :class="t.icone" aria-hidden="true" /></span>
                <span class="flex-1 min-w-0">
                  <span class="flex items-center gap-1.5">
                    <span class="text-sm font-semibold text-slate-800 dark:text-white truncate">{{ t.nome }}</span>
                    <i v-if="!t.ativo" class="fa-solid fa-eye-slash text-[10px] text-red-500" title="Oculta no app" aria-hidden="true" />
                  </span>
                  <span class="flex items-center gap-1.5 mt-1">
                    <span class="flex-1 h-1 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden"><span class="block h-full rounded-full" :class="cor(t).solid" :style="{ width: contagem(t.id).pct + '%' }" /></span>
                    <span class="text-[10px] font-semibold tabular-nums text-slate-500">{{ contagem(t.id).com }}/{{ contagem(t.id).total }}</span>
                  </span>
                </span>
              </button>
            </div>
          </aside>

          <!-- Conteúdo -->
          <section class="min-w-0 space-y-4">
            <!-- ─── Fila de gravação ─── -->
            <template v-if="selecao === 'fila'">
              <div :class="['p-5', cardBase]">
                <p class="font-semibold text-slate-900 dark:text-white"><i class="fa-solid fa-video text-amber-500 mr-1.5" aria-hidden="true" />Fila de gravação</p>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Todas as aulas visíveis no app que ainda não têm vídeo, na ordem de cada trilha. Gravou? Clique em <strong>Adicionar vídeo</strong> e cole o link: a aula sai do "Em breve" na hora e os clientes recebem o aviso de aula nova.</p>
              </div>
              <div v-if="fila.length === 0" :class="['px-5 py-14 text-center', cardBase]">
                <i class="fa-solid fa-circle-check text-emerald-500 text-3xl mb-3 block" aria-hidden="true" />
                <p class="text-sm font-medium text-slate-700 dark:text-slate-300">Todas as aulas já têm vídeo.</p>
              </div>
              <div v-for="g in fila" :key="g.trilha.id" :class="['overflow-hidden', cardBase]">
                <div class="px-4 py-3 flex items-center gap-3 border-b border-slate-100 dark:border-white/5">
                  <span class="w-8 h-8 rounded-md flex items-center justify-center shrink-0" :class="[cor(g.trilha).bg, cor(g.trilha).text]"><i class="fa-solid text-sm" :class="g.trilha.icone" aria-hidden="true" /></span>
                  <p class="flex-1 text-sm font-semibold text-slate-900 dark:text-white">{{ g.trilha.nome }} <span class="font-normal text-slate-400">· {{ g.aulas.length }} a gravar</span></p>
                  <button type="button" @click="copiarRoteiro(g)" class="px-2.5 py-1.5 rounded text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800" title="Copia os títulos e descrições desta trilha para usar como roteiro">
                    <i class="fa-regular fa-copy mr-1" aria-hidden="true" />Copiar roteiro
                  </button>
                </div>
                <div v-for="a in g.aulas" :key="a.id" class="px-4 py-2.5 flex items-center gap-3 border-b border-slate-100 dark:border-white/5 last:border-b-0">
                  <span class="w-7 text-center text-xs font-bold text-slate-400 tabular-nums shrink-0">{{ a.ordem }}</span>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-slate-800 dark:text-white truncate">{{ a.titulo }}</p>
                    <p class="text-xs text-slate-500 truncate">
                      <span v-if="a.secao" class="font-semibold">{{ a.secao }} · </span>{{ descricaoLimpa(a.descricao) || 'Sem descrição' }}
                    </p>
                  </div>
                  <button type="button" @click="copiarTexto(a.titulo)" class="w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800" title="Copiar título">
                    <i class="fa-regular fa-copy text-sm" aria-hidden="true" />
                  </button>
                  <button type="button" @click="abrirEditarAula(a)" class="shrink-0 px-2.5 py-1.5 rounded text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white">
                    <i class="fa-solid fa-link mr-1" aria-hidden="true" />Adicionar vídeo
                  </button>
                </div>
              </div>
            </template>

            <!-- ─── Trilha ─── -->
            <template v-else-if="trilhaAtiva">
              <div :class="['p-5 flex flex-col sm:flex-row sm:items-center gap-4', cardBase]">
                <div class="w-12 h-12 rounded-lg flex items-center justify-center shrink-0" :class="cor(trilhaAtiva).bg">
                  <i class="fa-solid text-lg" :class="[trilhaAtiva.icone, cor(trilhaAtiva).text]" aria-hidden="true" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <p class="font-semibold text-slate-900 dark:text-white">{{ trilhaAtiva.nome }}</p>
                    <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold" :class="[cor(trilhaAtiva).bg, cor(trilhaAtiva).text]">
                      <span class="w-1.5 h-1.5 rounded-full" :class="cor(trilhaAtiva).dot" aria-hidden="true" />
                      {{ trilhaAtiva.nivel_label }}
                    </span>
                    <span class="text-[11px] text-slate-400">{{ GRUPOS.find(g => g.id === trilhaAtiva!.grupo)?.nome }}</span>
                    <span v-if="!trilhaAtiva.ativo" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400">
                      <i class="fa-solid fa-eye-slash" aria-hidden="true" /> Oculta no app
                    </span>
                  </div>
                  <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{{ trilhaAtiva.descricao || 'Sem descrição' }}</p>
                  <p class="text-[11px] text-slate-400 mt-1 tabular-nums">{{ contagem(trilhaAtiva.id).com }} de {{ contagem(trilhaAtiva.id).total }} aulas com vídeo</p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <button @click="abrirNovaAula" type="button"
                    class="inline-flex items-center gap-2 px-3 py-2 rounded text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors">
                    <i class="fa-solid fa-plus text-xs" aria-hidden="true" /> Aula
                  </button>
                  <button @click="abrirEditarTrilha(trilhaAtiva)" type="button"
                    class="inline-flex items-center gap-2 px-3 py-2 rounded text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <i class="fa-solid fa-pen-to-square text-xs" aria-hidden="true" /> Editar trilha
                  </button>
                </div>
              </div>

              <!-- Filtro -->
              <div class="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-lg w-fit">
                <button
                  v-for="f in [{ id: 'todas', t: 'Todas' }, { id: 'sem', t: 'Sem vídeo' }, { id: 'com', t: 'Com vídeo' }]"
                  :key="f.id"
                  type="button"
                  @click="filtroVideo = f.id as any"
                  class="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
                  :class="filtroVideo === f.id ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
                >{{ f.t }}</button>
              </div>

              <div v-if="aulasFiltradas.length === 0" :class="['px-5 py-14 text-center', cardBase]">
                <i class="fa-solid fa-circle-play text-slate-300 dark:text-slate-700 text-3xl mb-3 block" aria-hidden="true" />
                <p class="text-slate-600 dark:text-slate-400 text-sm font-medium">Nenhuma aula aqui</p>
                <p class="text-slate-400 dark:text-slate-600 text-xs mt-1">Clique em "+ Aula" para adicionar.</p>
              </div>

              <div v-for="(bloco, bi) in emBlocos(aulasFiltradas)" :key="`${bloco.secao}-${bi}`" :class="['overflow-hidden', cardBase]">
                <div v-if="bloco.secao || emBlocos(aulasFiltradas).length > 1" class="px-4 sm:px-5 py-2 bg-slate-50 dark:bg-white/[0.03] border-b border-slate-100 dark:border-white/5 flex items-center gap-2">
                  <span class="text-[11px] font-bold uppercase tracking-wider text-slate-500">{{ bloco.secao || 'Sem seção' }}</span>
                  <span class="text-[11px] text-slate-400">{{ bloco.itens.length }}</span>
                </div>
                <div
                  v-for="a in bloco.itens"
                  :key="a.id"
                  class="px-4 sm:px-5 py-3 flex items-center gap-3 border-b border-slate-100 dark:border-white/5 last:border-b-0"
                  :class="{ 'opacity-50': !a.ativo }"
                >
                  <!-- Setas de reordenação -->
                  <div class="flex flex-col shrink-0">
                    <button
                      @click="moverAula(a, -1)"
                      :disabled="filtroVideo !== 'todas' || aulasTrilhaAtiva[0]?.id === a.id || reordenando"
                      class="w-6 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-25 disabled:pointer-events-none transition-colors"
                      title="Mover para cima" type="button"
                    ><i class="fa-solid fa-chevron-up text-[10px]" aria-hidden="true" /></button>
                    <button
                      @click="moverAula(a, 1)"
                      :disabled="filtroVideo !== 'todas' || aulasTrilhaAtiva[aulasTrilhaAtiva.length - 1]?.id === a.id || reordenando"
                      class="w-6 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-25 disabled:pointer-events-none transition-colors"
                      title="Mover para baixo" type="button"
                    ><i class="fa-solid fa-chevron-down text-[10px]" aria-hidden="true" /></button>
                  </div>

                  <span class="w-7 text-center text-xs font-bold text-slate-400 tabular-nums shrink-0">{{ a.ordem }}</span>

                  <div class="w-9 h-9 rounded flex items-center justify-center shrink-0" :class="a.video_url ? 'bg-red-100 dark:bg-red-500/15' : 'bg-slate-100 dark:bg-white/5'">
                    <i class="text-sm" :class="a.video_url ? 'fa-brands fa-youtube text-red-500' : 'fa-solid fa-hourglass-half text-slate-400'" aria-hidden="true" />
                  </div>

                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-slate-800 dark:text-white truncate">{{ a.titulo }}</p>
                    <p class="text-xs text-slate-500 truncate">{{ descricaoLimpa(a.descricao) || a.video_url || 'Sem descrição' }}</p>
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
                    ><i class="fa-solid text-sm" :class="a.ativo ? 'fa-eye-slash' : 'fa-eye'" aria-hidden="true" /></button>
                    <button
                      @click="abrirEditarAula(a)"
                      class="w-8 h-8 flex items-center justify-center rounded hover:bg-blue-50 dark:hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 transition-colors"
                      title="Editar aula" type="button"
                    ><i class="fa-solid fa-pen-to-square text-sm" aria-hidden="true" /></button>
                    <button
                      @click="iniciarExclusao(a)"
                      class="w-8 h-8 flex items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 dark:text-red-400 transition-colors"
                      title="Excluir aula (apaga progresso dos clientes)" type="button"
                    ><i class="fa-solid fa-trash text-sm" aria-hidden="true" /></button>
                  </div>
                </div>
              </div>
            </template>
          </section>
        </div>
      </template>

      <!-- Modais -->
      <AdminSuporteAulaModal
        :show="showAulaModal"
        :trilhas="trilhas"
        :aula="aulaEdit"
        :trilha-id-padrao="trilhaAtiva?.id || trilhas[0]?.id"
        :ordem-sugerida="ordemSugerida"
        :secoes-por-trilha="secoesPorTrilha"
        @close="showAulaModal = false"
        @saved="loadTudo"
      />

      <AdminSuporteTrilhaModal
        :show="showTrilhaModal"
        :trilha="trilhaEdit"
        :ordem-sugerida="ordemTrilhaSugerida"
        @close="showTrilhaModal = false"
        @saved="aoSalvarTrilha"
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
