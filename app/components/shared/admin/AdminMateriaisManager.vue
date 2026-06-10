<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

interface Material {
  id: string
  titulo: string
  descricao: string | null
  tipo: 'imagem' | 'video' | 'pdf'
  arquivo_url: string
  arquivo_nome: string
  tamanho_bytes: number | null
  ordem: number
  ativo: boolean
}

const emit = defineEmits<{ 'count-change': [count: number] }>()

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

const materiais = ref<Material[]>([])
const loading = ref(true)
const enviando = ref(false)
const materialParaExcluir = ref<Material | null>(null)

const titulo = ref('')
const descricao = ref('')
const arquivo = ref<File | null>(null)
const inputArquivo = ref<HTMLInputElement | null>(null)

async function loadMateriais() {
  try {
    const resp = await $fetch<{ success: boolean; data?: Material[] }>('/api/admin/materiais/list', {
      headers: await useAdminAuthHeaders(),
    })
    materiais.value = resp.success && resp.data ? resp.data : []
    emit('count-change', materiais.value.length)
  } catch {
    toast?.error('Erro ao carregar materiais')
  }
}

onMounted(async () => {
  toast = await useToastSafe()
  loading.value = true
  await loadMateriais()
  loading.value = false
})

function aoEscolherArquivo(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0] ?? null
  arquivo.value = f
  if (f && !titulo.value.trim()) {
    titulo.value = f.name.replace(/\.[^.]+$/, '')
  }
}

const tipoDoArquivo = computed(() => {
  const mime = arquivo.value?.type || ''
  if (mime.startsWith('image/')) return 'Imagem'
  if (mime.startsWith('video/')) return 'Vídeo'
  if (mime === 'application/pdf') return 'PDF'
  return arquivo.value ? 'Formato não suportado' : ''
})

const arquivoValido = computed(() => {
  const mime = arquivo.value?.type || ''
  return mime.startsWith('image/') || mime.startsWith('video/') || mime === 'application/pdf'
})

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function enviar() {
  if (!arquivo.value || !arquivoValido.value || enviando.value) return
  if (arquivo.value.size > 100 * 1024 * 1024) {
    toast?.warning('Arquivo acima de 100 MB — para vídeos grandes, publique como aula no YouTube')
    return
  }
  enviando.value = true
  try {
    const form = new FormData()
    form.append('file', arquivo.value)
    form.append('titulo', titulo.value)
    form.append('descricao', descricao.value)

    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/materiais/upload', {
      method: 'POST',
      body: form,
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro')
    toast?.success('Material publicado para os parceiros!')
    titulo.value = ''
    descricao.value = ''
    arquivo.value = null
    if (inputArquivo.value) inputArquivo.value.value = ''
    await loadMateriais()
  } catch (err: any) {
    toast?.error(err?.data?.statusMessage || err?.message || 'Erro ao enviar material')
  } finally {
    enviando.value = false
  }
}

async function toggleAtivo(m: Material) {
  try {
    const resp = await $fetch<{ success: boolean }>('/api/admin/materiais/salvar', {
      method: 'POST',
      body: { id: m.id, ativo: !m.ativo },
      headers: await useAdminAuthHeaders(),
    })
    if (resp.success) m.ativo = !m.ativo
  } catch { toast?.error('Erro ao atualizar material') }
}

async function confirmExcluir() {
  if (!materialParaExcluir.value) return
  try {
    const resp = await $fetch<{ success: boolean }>('/api/admin/materiais/excluir', {
      method: 'POST', body: { id: materialParaExcluir.value.id }, headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error('Erro')
    toast?.success('Material excluído')
    await loadMateriais()
  } catch { toast?.error('Erro ao excluir material') }
  materialParaExcluir.value = null
}

const tipoBadge: Record<string, { label: string; icon: string; cls: string }> = {
  imagem: { label: 'Imagem', icon: 'fa-solid fa-image', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
  video: { label: 'Vídeo', icon: 'fa-solid fa-film', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400' },
  pdf: { label: 'PDF', icon: 'fa-solid fa-file-pdf', cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
}

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">

    <!-- Form de upload -->
    <div :class="['p-5 lg:col-span-2 h-fit', cardBase]">
      <h3 class="text-sm font-semibold text-slate-800 dark:text-white mb-1 flex items-center gap-2">
        <i class="fa-solid fa-cloud-arrow-up text-emerald-500" aria-hidden="true" />
        Publicar material de divulgação
      </h3>
      <p class="text-xs text-slate-400 dark:text-slate-600 mb-4">Imagens, vídeos e PDFs em alta qualidade, sem compressão — o parceiro baixa o arquivo original.</p>

      <form @submit.prevent="enviar" class="space-y-3">
        <!-- Arquivo -->
        <label
          class="block rounded-md border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-purple-400 dark:hover:border-purple-500/60 transition-colors cursor-pointer p-5 text-center"
        >
          <input
            ref="inputArquivo"
            type="file"
            accept="image/*,video/*,application/pdf"
            class="hidden"
            @change="aoEscolherArquivo"
          />
          <template v-if="arquivo">
            <i class="fa-solid fa-file-circle-check text-emerald-500 text-xl mb-1 block" aria-hidden="true" />
            <p class="text-sm font-medium text-slate-800 dark:text-white truncate">{{ arquivo.name }}</p>
            <p class="text-xs mt-0.5" :class="arquivoValido ? 'text-slate-400' : 'text-red-500 font-semibold'">
              {{ tipoDoArquivo }} · {{ formatBytes(arquivo.size) }}
            </p>
          </template>
          <template v-else>
            <i class="fa-solid fa-cloud-arrow-up text-slate-300 dark:text-slate-700 text-xl mb-1 block" aria-hidden="true" />
            <p class="text-sm font-medium text-slate-600 dark:text-slate-400">Clique para escolher o arquivo</p>
            <p class="text-xs text-slate-400 dark:text-slate-600 mt-0.5">Imagem, vídeo ou PDF · máx. 100 MB</p>
          </template>
        </label>

        <div>
          <label for="mat-titulo" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Título</label>
          <input id="mat-titulo" v-model="titulo" type="text" required placeholder="Ex.: Banner de divulgação Instagram"
            class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
        <div>
          <label for="mat-desc" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Descrição <span class="font-normal text-slate-400">(opcional)</span></label>
          <input id="mat-desc" v-model="descricao" type="text" placeholder="Onde e como usar este material"
            class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>

        <button
          type="submit"
          :disabled="!arquivo || !arquivoValido || !titulo.trim() || enviando"
          class="w-full px-4 py-2.5 rounded font-semibold text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors flex items-center justify-center gap-2"
        >
          <i v-if="enviando" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
          <i v-else class="fa-solid fa-cloud-arrow-up text-xs" aria-hidden="true" />
          {{ enviando ? 'Enviando…' : 'Publicar material' }}
        </button>
      </form>
    </div>

    <!-- Lista -->
    <div :class="['overflow-hidden lg:col-span-3', cardBase]">
      <div v-if="loading" class="p-5 space-y-3">
        <div v-for="i in 3" :key="i" class="h-16 bg-slate-100 dark:bg-white/5 rounded animate-pulse" />
      </div>
      <div v-else-if="materiais.length === 0" class="px-5 py-14 text-center">
        <i class="fa-solid fa-box-open text-slate-300 dark:text-slate-700 text-3xl mb-3 block" aria-hidden="true" />
        <p class="text-slate-600 dark:text-slate-400 text-sm font-medium">Nenhum material publicado</p>
        <p class="text-slate-400 dark:text-slate-600 text-xs mt-1">Os materiais aparecem na página "Materiais" do portal do parceiro.</p>
      </div>
      <div v-else class="divide-y divide-slate-100 dark:divide-white/5">
        <div
          v-for="m in materiais"
          :key="m.id"
          class="px-4 sm:px-5 py-3 flex items-center gap-3"
          :class="{ 'opacity-50': !m.ativo }"
        >
          <!-- Preview -->
          <div class="w-14 h-14 rounded overflow-hidden bg-slate-100 dark:bg-white/5 flex items-center justify-center shrink-0">
            <img v-if="m.tipo === 'imagem'" :src="m.arquivo_url" :alt="m.titulo" class="w-full h-full object-cover" loading="lazy" />
            <i v-else-if="m.tipo === 'video'" class="fa-solid fa-film text-purple-400 text-lg" aria-hidden="true" />
            <i v-else class="fa-solid fa-file-pdf text-red-400 text-lg" aria-hidden="true" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-slate-800 dark:text-white truncate">{{ m.titulo }}</p>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold" :class="tipoBadge[m.tipo]?.cls">
                <i :class="[tipoBadge[m.tipo]?.icon, 'text-[9px]']" aria-hidden="true" />
                {{ tipoBadge[m.tipo]?.label }}
              </span>
              <span class="text-[10px] text-slate-400 tabular-nums">{{ formatBytes(m.tamanho_bytes) }}</span>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <a
              :href="`${m.arquivo_url}?download=${encodeURIComponent(m.arquivo_nome)}`"
              class="w-8 h-8 flex items-center justify-center rounded hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-colors"
              title="Baixar arquivo"
              target="_blank"
              rel="noopener noreferrer"
            >
              <i class="fa-solid fa-download text-sm" aria-hidden="true" />
            </a>
            <button @click="toggleAtivo(m)" class="w-8 h-8 flex items-center justify-center rounded transition-colors" :class="m.ativo ? 'hover:bg-amber-50 dark:hover:bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'" :title="m.ativo ? 'Ocultar do portal' : 'Publicar no portal'" type="button">
              <i class="fa-solid text-sm" :class="m.ativo ? 'fa-eye-slash' : 'fa-eye'" aria-hidden="true" />
            </button>
            <button @click="materialParaExcluir = m" class="w-8 h-8 flex items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 dark:text-red-400 transition-colors" title="Excluir material" type="button">
              <i class="fa-solid fa-trash text-sm" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Confirmação de exclusão -->
    <AdminConfirmacaoModal
      :show="!!materialParaExcluir"
      title="Excluir material"
      message="O arquivo será removido do armazenamento e do portal do parceiro. Deseja excluir"
      :cliente-nome="materialParaExcluir?.titulo"
      confirm-label="Excluir"
      variant="danger"
      @close="materialParaExcluir = null"
      @confirm="confirmExcluir"
    />

  </div>
</template>
