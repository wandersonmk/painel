<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface TrilhaOption {
  id: string
  nome: string
  nivel_label: string
}

interface AulaForm {
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

const props = defineProps<{
  show: boolean
  trilhas: TrilhaOption[]
  /** null = criar nova aula */
  aula: AulaForm | null
  /** trilha pré-selecionada e ordem sugerida ao criar */
  trilhaIdPadrao?: string
  ordemSugerida?: number
}>()

const emit = defineEmits<{ close: []; saved: [] }>()

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

const trilhaId = ref('')
const titulo = ref('')
const descricao = ref('')
const videoUrl = ref('')
const thumbnailUrl = ref('')
const duracaoMin = ref(0)
const duracaoSeg = ref(0)
const ordem = ref(1)
const ativo = ref(true)
const saving = ref(false)
const showPreview = ref(false)

watch(() => props.show, (aberto) => {
  if (!aberto) return
  showPreview.value = false
  if (props.aula) {
    trilhaId.value = props.aula.trilha_id
    titulo.value = props.aula.titulo
    descricao.value = props.aula.descricao || ''
    videoUrl.value = props.aula.video_url || ''
    thumbnailUrl.value = props.aula.thumbnail_url || ''
    duracaoMin.value = Math.floor(props.aula.duracao_segundos / 60)
    duracaoSeg.value = props.aula.duracao_segundos % 60
    ordem.value = props.aula.ordem
    ativo.value = props.aula.ativo
  } else {
    trilhaId.value = props.trilhaIdPadrao || props.trilhas[0]?.id || ''
    titulo.value = ''
    descricao.value = ''
    videoUrl.value = ''
    thumbnailUrl.value = ''
    duracaoMin.value = 0
    duracaoSeg.value = 0
    ordem.value = props.ordemSugerida ?? 1
    ativo.value = true
  }
})

// ───────── Detecção do formato do vídeo (mesma lógica do player do app) ─────────
const YT_REGEX = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/

const videoInfo = computed(() => {
  const u = videoUrl.value.trim()
  if (!u) return { tipo: 'vazio' as const, embedUrl: '' }
  const yt = u.match(YT_REGEX)
  if (yt) return { tipo: 'youtube' as const, embedUrl: `https://www.youtube.com/embed/${yt[1]}` }
  if (!/^https?:\/\//i.test(u)) return { tipo: 'invalido' as const, embedUrl: '' }
  if (/\.(mp4|webm|ogg|mov|m3u8)(\?.*)?$/i.test(u)) return { tipo: 'arquivo' as const, embedUrl: u }
  return { tipo: 'iframe' as const, embedUrl: u }
})

const videoHint = computed(() => {
  switch (videoInfo.value.tipo) {
    case 'vazio': return { texto: 'Sem vídeo — o app mostra a capa "Em breve".', cls: 'text-slate-400 dark:text-slate-500' }
    case 'youtube': return { texto: 'YouTube reconhecido ✓ (não listados também funcionam)', cls: 'text-emerald-600 dark:text-emerald-400' }
    case 'arquivo': return { texto: 'Arquivo de vídeo direto reconhecido ✓', cls: 'text-emerald-600 dark:text-emerald-400' }
    case 'iframe': return { texto: 'Link não reconhecido como YouTube — o app vai exibir como iframe genérico. Confira a pré-visualização.', cls: 'text-amber-600 dark:text-amber-400' }
    case 'invalido': return { texto: 'Isso não parece uma URL válida (precisa começar com https://).', cls: 'text-red-500 dark:text-red-400' }
  }
})

watch(videoUrl, () => { showPreview.value = false })

// ───────── Salvar ─────────
const podeSalvar = computed(() =>
  titulo.value.trim().length > 0
  && trilhaId.value
  && videoInfo.value.tipo !== 'invalido'
  && !saving.value,
)

async function salvar() {
  if (!podeSalvar.value) return
  saving.value = true
  toast = toast || await useToastSafe()
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/suporte/aula-salvar', {
      method: 'POST',
      body: {
        id: props.aula?.id,
        trilhaId: trilhaId.value,
        titulo: titulo.value,
        descricao: descricao.value,
        videoUrl: videoUrl.value,
        thumbnailUrl: thumbnailUrl.value,
        duracaoSegundos: (Number(duracaoMin.value) || 0) * 60 + (Number(duracaoSeg.value) || 0),
        ordem: ordem.value,
        ativo: ativo.value,
      },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro ao salvar')
    toast?.success(props.aula ? 'Aula atualizada' : 'Aula criada')
    emit('saved')
    emit('close')
  } catch (err: any) {
    toast?.error(err?.data?.statusMessage || err?.message || 'Erro ao salvar aula')
  } finally {
    saving.value = false
  }
}

const inputCls = 'w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500'
const labelCls = 'block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1'
</script>

<template>
  <BaseModal :show="show" :title="aula ? 'Editar aula' : 'Nova aula'" max-width="max-w-2xl" @close="emit('close')">
    <form @submit.prevent="salvar" class="space-y-4 max-h-[70vh] overflow-y-auto pr-1">

      <!-- Trilha (escolhível só na criação — mover aula de trilha bagunça a sequência) -->
      <div>
        <label for="sa-trilha" :class="labelCls">Trilha</label>
        <select id="sa-trilha" v-model="trilhaId" :disabled="!!aula" :class="[inputCls, aula ? 'opacity-60 cursor-not-allowed' : '']">
          <option v-for="t in trilhas" :key="t.id" :value="t.id">{{ t.nome }} ({{ t.nivel_label }})</option>
        </select>
      </div>

      <div>
        <label for="sa-titulo" :class="labelCls">Título</label>
        <input id="sa-titulo" v-model="titulo" type="text" required placeholder="Ex.: Como conectar o WhatsApp" :class="inputCls" />
      </div>

      <div>
        <label for="sa-desc" :class="labelCls">Descrição <span class="font-normal text-slate-400">(opcional)</span></label>
        <textarea id="sa-desc" v-model="descricao" rows="2" placeholder="O que o cliente vai aprender nesta aula" :class="[inputCls, 'resize-none']" />
      </div>

      <!-- Link do vídeo + preview -->
      <div>
        <label for="sa-url" :class="labelCls">Link do vídeo</label>
        <div class="flex gap-2">
          <input id="sa-url" v-model="videoUrl" type="text" placeholder="https://youtube.com/watch?v=… (vazio = capa Em breve)" :class="inputCls" />
          <button
            type="button"
            :disabled="!videoInfo.embedUrl"
            @click="showPreview = !showPreview"
            class="shrink-0 px-3 py-2 rounded text-sm font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
            :title="showPreview ? 'Fechar pré-visualização' : 'Pré-visualizar vídeo'"
          >
            <i class="fa-solid text-xs" :class="showPreview ? 'fa-eye-slash' : 'fa-play'" aria-hidden="true" />
            <span class="hidden sm:inline">{{ showPreview ? 'Fechar' : 'Testar' }}</span>
          </button>
        </div>
        <p class="text-[11px] mt-1" :class="videoHint.cls">{{ videoHint.texto }}</p>

        <div v-if="showPreview && videoInfo.embedUrl" class="mt-2 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-black aspect-video">
          <video v-if="videoInfo.tipo === 'arquivo'" :src="videoInfo.embedUrl" controls class="w-full h-full" />
          <iframe
            v-else
            :src="videoInfo.embedUrl"
            class="w-full h-full"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            title="Pré-visualização do vídeo"
          />
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="col-span-2">
          <label :class="labelCls">Duração (min : seg)</label>
          <div class="flex items-center gap-1.5">
            <input v-model.number="duracaoMin" type="number" min="0" max="999" aria-label="Minutos" :class="[inputCls, 'text-center tabular-nums']" />
            <span class="text-slate-400 font-bold">:</span>
            <input v-model.number="duracaoSeg" type="number" min="0" max="59" aria-label="Segundos" :class="[inputCls, 'text-center tabular-nums']" />
          </div>
        </div>
        <div>
          <label for="sa-ordem" :class="labelCls">Posição</label>
          <input id="sa-ordem" v-model.number="ordem" type="number" min="0" :class="[inputCls, 'text-center tabular-nums']" />
        </div>
        <div>
          <label :class="labelCls">Visível no app</label>
          <button
            type="button"
            @click="ativo = !ativo"
            class="w-full px-3 py-2 rounded text-sm font-semibold border transition-colors inline-flex items-center justify-center gap-2"
            :class="ativo
              ? 'border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400'"
          >
            <i class="fa-solid text-xs" :class="ativo ? 'fa-eye' : 'fa-eye-slash'" aria-hidden="true" />
            {{ ativo ? 'Ativa' : 'Oculta' }}
          </button>
        </div>
      </div>

      <div>
        <label for="sa-thumb" :class="labelCls">Thumbnail <span class="font-normal text-slate-400">(opcional — URL de imagem)</span></label>
        <input id="sa-thumb" v-model="thumbnailUrl" type="text" placeholder="https://…/capa.png" :class="inputCls" />
      </div>

      <div class="flex gap-2 pt-1">
        <button type="button" @click="emit('close')"
          class="flex-1 px-4 py-2.5 rounded-lg font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
          Cancelar
        </button>
        <button type="submit" :disabled="!podeSalvar"
          class="flex-1 px-4 py-2.5 rounded-lg font-semibold text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white transition-colors flex items-center justify-center gap-2">
          <i v-if="saving" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
          {{ saving ? 'Salvando…' : (aula ? 'Salvar alterações' : 'Criar aula') }}
        </button>
      </div>
    </form>
  </BaseModal>
</template>
