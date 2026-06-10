<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

definePageMeta({
  middleware: ['auth', 'parceiro'],
  layout: 'parceiro',
})

interface Categoria {
  id: string
  nome: string
  ordem: number
}

interface Aula {
  id: string
  titulo: string
  descricao: string | null
  youtube_url: string
  ordem: number
  categoria_id: string | null
}

const { parceiro, checkParceiro } = useParceiro()

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

const categorias = ref<Categoria[]>([])
const aulas = ref<Aula[]>([])
const concluidas = ref<Set<string>>(new Set())
const loading = ref(true)
const busca = ref('')
const filtroModulo = ref('')

const aulaAberta = ref<Aula | null>(null)
const salvandoConclusao = ref(false)

// Módulos colapsáveis — nascem fechados
const expandidos = ref<Set<string>>(new Set())

onMounted(async () => {
  toast = await useToastSafe()
  try {
    const supabase = useSupabaseClient()
    const [, categoriasRes, aulasRes, concluidasRes] = await Promise.all([
      checkParceiro(),
      supabase.from('parceiro_aulas_categorias').select('id, nome, ordem').order('ordem').order('created_at'),
      supabase.from('parceiro_aulas').select('id, titulo, descricao, youtube_url, ordem, categoria_id').order('ordem').order('created_at'),
      supabase.from('parceiro_aulas_concluidas').select('aula_id'),
    ])
    categorias.value = (categoriasRes.data || []) as Categoria[]
    aulas.value = (aulasRes.data || []) as Aula[]
    concluidas.value = new Set(((concluidasRes.data || []) as Array<{ aula_id: string }>).map(c => c.aula_id))
  } finally {
    loading.value = false
  }
})

/** Extrai o ID do vídeo de qualquer formato de link do YouTube. */
function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/)
  return m?.[1] ?? null
}

function thumbnail(url: string): string | null {
  const id = youtubeId(url)
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null
}

/** Normaliza para busca sem acentos e sem caixa. */
function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const buscando = computed(() => busca.value.trim().length > 0)

const aulasFiltradas = computed(() => {
  const termo = normalizar(busca.value.trim())
  if (!termo) return []
  return aulas.value.filter(a =>
    normalizar(a.titulo).includes(termo)
    || (a.descricao && normalizar(a.descricao).includes(termo)),
  )
})

/** Módulos com suas aulas (na ordem), + "Outras aulas" para as sem módulo. */
const modulos = computed(() => {
  const lista: Array<{ key: string; nome: string; aulas: Aula[] }> = []
  for (const c of categorias.value) {
    const doModulo = aulas.value.filter(a => a.categoria_id === c.id)
    if (doModulo.length > 0) lista.push({ key: c.id, nome: c.nome, aulas: doModulo })
  }
  const semModulo = aulas.value.filter(a => !a.categoria_id || !categorias.value.some(c => c.id === a.categoria_id))
  if (semModulo.length > 0) lista.push({ key: 'outras', nome: 'Outras aulas', aulas: semModulo })
  return lista
})

const modulosVisiveis = computed(() => {
  if (!filtroModulo.value) return modulos.value
  return modulos.value.filter(m => m.key === filtroModulo.value)
})

function moduloAberto(key: string) {
  // Com filtro de módulo ativo, o módulo escolhido já abre sozinho
  return expandidos.value.has(key) || filtroModulo.value === key
}

function toggleModulo(key: string) {
  const novo = new Set(expandidos.value)
  if (novo.has(key)) novo.delete(key)
  else novo.add(key)
  expandidos.value = novo
}

function concluidasNoModulo(lista: Aula[]) {
  return lista.filter(a => concluidas.value.has(a.id)).length
}

// ───────── Carrossel com setas ─────────
const trilhos = ref<Record<string, HTMLElement | null>>({})

function setTrilho(key: string, el: unknown) {
  trilhos.value[key] = (el as HTMLElement) ?? null
}

function rolar(key: string, direcao: 1 | -1) {
  const el = trilhos.value[key]
  if (!el) return
  el.scrollBy({ left: direcao * el.clientWidth * 0.8, behavior: 'smooth' })
}

async function toggleConcluida(aula: Aula) {
  if (salvandoConclusao.value) return
  if (!parceiro.value?.id) {
    toast?.error('Não foi possível identificar seu cadastro de parceiro')
    return
  }
  salvandoConclusao.value = true
  try {
    const supabase = useSupabaseClient()
    if (concluidas.value.has(aula.id)) {
      const { error } = await supabase
        .from('parceiro_aulas_concluidas')
        .delete()
        .eq('aula_id', aula.id)
        .eq('parceiro_id', parceiro.value.id)
      if (error) throw error
      concluidas.value.delete(aula.id)
      concluidas.value = new Set(concluidas.value)
    } else {
      const { error } = await supabase
        .from('parceiro_aulas_concluidas')
        .insert({ aula_id: aula.id, parceiro_id: parceiro.value.id } as never)
      if (error) throw error
      concluidas.value = new Set(concluidas.value).add(aula.id)
      toast?.success('Aula concluída! 🎉')
    }
  } catch {
    toast?.error('Erro ao atualizar a aula')
  } finally {
    salvandoConclusao.value = false
  }
}

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <div class="p-4 sm:p-6 md:p-8 space-y-6 max-w-[1200px] mx-auto w-full">

    <!-- Page Header -->
    <div>
      <h1 class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Aulas</h1>
      <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">Aprenda a usar o Agzap e a apresentar para seus clientes</p>
    </div>

    <!-- Busca + filtro por módulo -->
    <div class="flex flex-col sm:flex-row gap-3">
      <div class="relative flex-1">
        <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" aria-hidden="true" />
        <input
          v-model="busca"
          type="search"
          placeholder="Pesquisar aula por palavra-chave…"
          class="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-full text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      <div class="relative w-full sm:w-64">
        <i class="fa-solid fa-layer-group absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" aria-hidden="true" />
        <select
          v-model="filtroModulo"
          class="w-full pl-9 pr-8 py-2.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-full text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none cursor-pointer"
        >
          <option value="">Todos os módulos</option>
          <option v-for="m in modulos" :key="m.key" :value="m.key">{{ m.nome }}</option>
        </select>
        <i class="fa-solid fa-chevron-down absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none" aria-hidden="true" />
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-4">
      <div v-for="i in 3" :key="i" class="h-16 rounded-md bg-slate-100 dark:bg-white/5 animate-pulse border border-slate-200 dark:border-white/5" />
    </div>

    <!-- Vazio geral -->
    <div v-else-if="aulas.length === 0" :class="['px-5 py-14 text-center', cardBase]">
      <i class="fa-solid fa-graduation-cap text-slate-300 dark:text-slate-700 text-3xl mb-3 block" aria-hidden="true" />
      <p class="text-slate-600 dark:text-slate-400 text-sm font-medium">Nenhuma aula disponível ainda</p>
      <p class="text-slate-400 dark:text-slate-600 text-xs mt-1">Em breve novos conteúdos serão publicados aqui.</p>
    </div>

    <!-- Resultado da busca (grade) -->
    <div v-else-if="buscando">
      <div class="flex items-center gap-2 mb-4">
        <h2 class="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Resultados para "{{ busca.trim() }}"
        </h2>
        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20">{{ aulasFiltradas.length }}</span>
      </div>

      <div v-if="aulasFiltradas.length === 0" :class="['px-5 py-12 text-center', cardBase]">
        <i class="fa-solid fa-magnifying-glass text-slate-300 dark:text-slate-700 text-2xl mb-2 block" aria-hidden="true" />
        <p class="text-slate-500 text-sm">Nenhuma aula encontrada</p>
        <p class="text-slate-400 dark:text-slate-600 text-xs mt-1">Tente outra palavra-chave.</p>
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <button
          v-for="aula in aulasFiltradas"
          :key="aula.id"
          @click="aulaAberta = aula"
          class="group text-left"
          type="button"
        >
          <div class="relative aspect-video rounded-lg overflow-hidden bg-slate-900 ring-1 ring-slate-200 dark:ring-white/10 group-hover:ring-2 group-hover:ring-purple-500 transition-all">
            <img v-if="thumbnail(aula.youtube_url)" :src="thumbnail(aula.youtube_url)!" :alt="aula.titulo" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
            <div class="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center">
              <span class="w-11 h-11 rounded-full bg-white/90 flex items-center justify-center shadow-lg opacity-90 group-hover:opacity-100 group-hover:scale-110 transition-all">
                <i class="fa-solid fa-play text-purple-700 text-sm ml-0.5" aria-hidden="true" />
              </span>
            </div>
            <span v-if="concluidas.has(aula.id)" class="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white shadow">
              <i class="fa-solid fa-check" aria-hidden="true" />
              Concluída
            </span>
          </div>
          <p class="text-sm font-semibold text-slate-800 dark:text-white mt-2 line-clamp-2">{{ aula.titulo }}</p>
        </button>
      </div>
    </div>

    <!-- Módulos (cards colapsáveis com carrossel de setas) -->
    <div v-else class="space-y-4">
      <section
        v-for="modulo in modulosVisiveis"
        :key="modulo.key"
        :class="['overflow-hidden', cardBase]"
      >
        <!-- Cabeçalho do módulo (clique para expandir) -->
        <button
          @click="toggleModulo(modulo.key)"
          class="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
          type="button"
          :aria-expanded="moduloAberto(modulo.key)"
        >
          <div class="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-500/15 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-layer-group text-purple-600 dark:text-purple-400 text-sm" aria-hidden="true" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h2 class="text-sm sm:text-base font-bold text-slate-900 dark:text-white">{{ modulo.nome }}</h2>
              <span
                v-if="concluidasNoModulo(modulo.aulas) === modulo.aulas.length"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              >
                <i class="fa-solid fa-trophy" aria-hidden="true" />
                Completo
              </span>
            </div>
            <div class="flex items-center gap-2 mt-1">
              <div class="h-1.5 w-28 sm:w-40 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                <div
                  class="h-full rounded-full bg-emerald-500 transition-all"
                  :style="{ width: `${(concluidasNoModulo(modulo.aulas) / modulo.aulas.length) * 100}%` }"
                />
              </div>
              <span class="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                {{ concluidasNoModulo(modulo.aulas) }}/{{ modulo.aulas.length }} aulas
              </span>
            </div>
          </div>
          <i
            class="fa-solid fa-chevron-down text-slate-400 text-sm transition-transform duration-200 shrink-0"
            :class="{ 'rotate-180': moduloAberto(modulo.key) }"
            aria-hidden="true"
          />
        </button>

        <!-- Conteúdo do módulo: carrossel com setas -->
        <div v-show="moduloAberto(modulo.key)" class="relative px-4 sm:px-5 pb-5 pt-1">
          <!-- Seta esquerda -->
          <button
            @click="rolar(modulo.key, -1)"
            class="hidden sm:flex absolute left-1 top-1/2 -translate-y-1/2 z-10 w-9 h-9 items-center justify-center rounded-full bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 hover:scale-110 transition-all"
            aria-label="Aulas anteriores"
            type="button"
          >
            <i class="fa-solid fa-chevron-left text-sm" aria-hidden="true" />
          </button>

          <!-- Trilho -->
          <div
            :ref="el => setTrilho(modulo.key, el)"
            class="flex gap-4 overflow-x-auto scroll-smooth snap-x sem-scrollbar"
          >
            <button
              v-for="aula in modulo.aulas"
              :key="aula.id"
              @click="aulaAberta = aula"
              class="group text-left w-52 sm:w-60 shrink-0 snap-start"
              type="button"
            >
              <div class="relative aspect-video rounded-lg overflow-hidden bg-slate-900 ring-1 ring-slate-200 dark:ring-white/10 group-hover:ring-2 group-hover:ring-purple-500 transition-all">
                <img v-if="thumbnail(aula.youtube_url)" :src="thumbnail(aula.youtube_url)!" :alt="aula.titulo" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <i class="fa-brands fa-youtube text-red-500 text-3xl" aria-hidden="true" />
                </div>
                <div class="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <span class="w-11 h-11 rounded-full bg-white/90 flex items-center justify-center shadow-lg opacity-90 group-hover:opacity-100 group-hover:scale-110 transition-all">
                    <i class="fa-solid fa-play text-purple-700 text-sm ml-0.5" aria-hidden="true" />
                  </span>
                </div>
                <span v-if="concluidas.has(aula.id)" class="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white shadow">
                  <i class="fa-solid fa-check" aria-hidden="true" />
                  Concluída
                </span>
              </div>
              <p class="text-sm font-semibold text-slate-800 dark:text-white mt-2 line-clamp-2 leading-snug">{{ aula.titulo }}</p>
            </button>
          </div>

          <!-- Seta direita -->
          <button
            @click="rolar(modulo.key, 1)"
            class="hidden sm:flex absolute right-1 top-1/2 -translate-y-1/2 z-10 w-9 h-9 items-center justify-center rounded-full bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 hover:scale-110 transition-all"
            aria-label="Próximas aulas"
            type="button"
          >
            <i class="fa-solid fa-chevron-right text-sm" aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>

    <!-- Player -->
    <BaseModal :show="!!aulaAberta" :title="aulaAberta?.titulo || ''" max-width="max-w-3xl" @close="aulaAberta = null">
      <div v-if="aulaAberta" class="space-y-4">
        <div class="aspect-video rounded-lg overflow-hidden bg-black">
          <iframe
            v-if="youtubeId(aulaAberta.youtube_url)"
            :src="`https://www.youtube.com/embed/${youtubeId(aulaAberta.youtube_url)}?autoplay=1`"
            :title="aulaAberta.titulo"
            class="w-full h-full"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
          />
          <a
            v-else
            :href="aulaAberta.youtube_url"
            target="_blank"
            rel="noopener noreferrer"
            class="w-full h-full flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"
          >
            <i class="fa-brands fa-youtube text-5xl" aria-hidden="true" />
          </a>
        </div>

        <p v-if="aulaAberta.descricao" class="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{{ aulaAberta.descricao }}</p>

        <div class="flex justify-end">
          <button
            @click="toggleConcluida(aulaAberta)"
            :disabled="salvandoConclusao"
            class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded text-sm font-semibold transition-colors disabled:opacity-50"
            :class="concluidas.has(aulaAberta.id)
              ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 hover:bg-emerald-200 dark:hover:bg-emerald-500/25'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30'"
            type="button"
          >
            <i v-if="salvandoConclusao" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
            <i v-else class="fa-solid text-xs" :class="concluidas.has(aulaAberta.id) ? 'fa-check-double' : 'fa-check'" aria-hidden="true" />
            {{ concluidas.has(aulaAberta.id) ? 'Concluída ✓ (clique para desmarcar)' : 'Marcar como concluída' }}
          </button>
        </div>
      </div>
    </BaseModal>

  </div>
</template>

<style scoped>
.sem-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.sem-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
