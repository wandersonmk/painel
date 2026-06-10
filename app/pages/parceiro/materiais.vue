<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

definePageMeta({
  middleware: ['auth', 'parceiro'],
  layout: 'parceiro',
})

interface Material {
  id: string
  titulo: string
  descricao: string | null
  tipo: 'imagem' | 'video' | 'pdf'
  arquivo_url: string
  arquivo_nome: string
  tamanho_bytes: number | null
}

const materiais = ref<Material[]>([])
const loading = ref(true)
const busca = ref('')
const filtroTipo = ref<'todos' | 'imagem' | 'video' | 'pdf'>('todos')

onMounted(async () => {
  try {
    const supabase = useSupabaseClient()
    const { data } = await supabase
      .from('parceiro_materiais')
      .select('id, titulo, descricao, tipo, arquivo_url, arquivo_nome, tamanho_bytes')
      .order('ordem')
      .order('created_at', { ascending: false })
    materiais.value = (data || []) as Material[]
  } finally {
    loading.value = false
  }
})

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const filtrados = computed(() => {
  let lista = materiais.value
  if (filtroTipo.value !== 'todos') {
    lista = lista.filter(m => m.tipo === filtroTipo.value)
  }
  const termo = normalizar(busca.value.trim())
  if (termo) {
    lista = lista.filter(m =>
      normalizar(m.titulo).includes(termo)
      || (m.descricao && normalizar(m.descricao).includes(termo)),
    )
  }
  return lista
})

const chips = [
  { value: 'todos', label: 'Todos', icon: 'fa-box-open' },
  { value: 'imagem', label: 'Imagens', icon: 'fa-image' },
  { value: 'video', label: 'Vídeos', icon: 'fa-film' },
  { value: 'pdf', label: 'PDFs', icon: 'fa-file-pdf' },
] as const

function contagem(tipo: string) {
  if (tipo === 'todos') return materiais.value.length
  return materiais.value.filter(m => m.tipo === tipo).length
}

function urlDownload(m: Material) {
  return `${m.arquivo_url}?download=${encodeURIComponent(m.arquivo_nome)}`
}

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <div class="p-4 sm:p-6 md:p-8 space-y-6 max-w-[1200px] mx-auto w-full">

    <!-- Page Header -->
    <div>
      <h1 class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Materiais de Divulgação</h1>
      <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">Imagens, vídeos e PDFs prontos para você divulgar o Agzap — baixe em alta qualidade</p>
    </div>

    <!-- Busca + filtro por tipo -->
    <div class="flex flex-col sm:flex-row gap-3 sm:items-center">
      <div class="relative flex-1">
        <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" aria-hidden="true" />
        <input
          v-model="busca"
          type="search"
          placeholder="Pesquisar material…"
          class="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-full text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="chip in chips"
          :key="chip.value"
          @click="filtroTipo = chip.value"
          type="button"
          class="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full text-xs font-semibold border transition-colors"
          :class="filtroTipo === chip.value
            ? 'bg-purple-600 border-purple-600 text-white'
            : 'bg-white dark:bg-white/[0.04] border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20'"
        >
          <i class="fa-solid text-[10px]" :class="chip.icon" aria-hidden="true" />
          {{ chip.label }}
          <span
            class="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[10px] font-bold tabular-nums"
            :class="filtroTipo === chip.value ? 'bg-white/25 text-white' : 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400'"
          >{{ contagem(chip.value) }}</span>
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="i in 6" :key="i" class="aspect-video rounded-md bg-slate-100 dark:bg-white/5 animate-pulse border border-slate-200 dark:border-white/5" />
    </div>

    <!-- Vazio -->
    <div v-else-if="filtrados.length === 0" :class="['px-5 py-14 text-center', cardBase]">
      <i class="fa-solid fa-box-open text-slate-300 dark:text-slate-700 text-3xl mb-3 block" aria-hidden="true" />
      <p class="text-slate-600 dark:text-slate-400 text-sm font-medium">
        {{ materiais.length === 0 ? 'Nenhum material disponível ainda' : 'Nenhum material encontrado' }}
      </p>
      <p class="text-slate-400 dark:text-slate-600 text-xs mt-1">
        {{ materiais.length === 0 ? 'Em breve a Agzap vai publicar materiais de divulgação aqui.' : 'Tente outra palavra-chave ou filtro.' }}
      </p>
    </div>

    <!-- Grade de materiais -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="m in filtrados"
        :key="m.id"
        :class="['overflow-hidden flex flex-col group', cardBase]"
      >
        <!-- Preview -->
        <div class="aspect-video bg-slate-100 dark:bg-slate-950 relative overflow-hidden">
          <img
            v-if="m.tipo === 'imagem'"
            :src="m.arquivo_url"
            :alt="m.titulo"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
          <video
            v-else-if="m.tipo === 'video'"
            :src="m.arquivo_url"
            controls
            preload="metadata"
            class="w-full h-full object-contain bg-black"
          />
          <a
            v-else
            :href="m.arquivo_url"
            target="_blank"
            rel="noopener noreferrer"
            class="w-full h-full flex flex-col items-center justify-center gap-2 text-red-400 hover:text-red-500 transition-colors"
            :title="`Abrir ${m.titulo}`"
          >
            <i class="fa-solid fa-file-pdf text-4xl" aria-hidden="true" />
            <span class="text-xs font-medium text-slate-500">Clique para visualizar</span>
          </a>
        </div>

        <!-- Info + download -->
        <div class="p-4 flex-1 flex flex-col">
          <h3 class="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2">{{ m.titulo }}</h3>
          <p v-if="m.descricao" class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">{{ m.descricao }}</p>
          <div class="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between gap-2">
            <span class="text-[10px] text-slate-400 tabular-nums">{{ formatBytes(m.tamanho_bytes) }}</span>
            <a
              :href="urlDownload(m)"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors shadow shadow-purple-600/30"
              :download="m.arquivo_nome"
            >
              <i class="fa-solid fa-download text-[10px]" aria-hidden="true" />
              Baixar
            </a>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>
