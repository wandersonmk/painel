<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface ModeloForm {
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
}

const props = defineProps<{
  show: boolean
  /** null = criar novo modelo */
  modelo: ModeloForm | null
  ordemSugerida?: number
}>()

const emit = defineEmits<{ close: []; saved: [] }>()

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

const nome = ref('')
const segmento = ref('')
const icone = ref('fa-robot')
const cor = ref('violet')
const descricao = ref('')
const personalidade = ref('')
const instrucao = ref('')
const requerApi = ref(false)
const videoUrl = ref('')
const ordem = ref(1)
const ativo = ref(true)
const saving = ref(false)
const showPreview = ref(false)

watch(() => props.show, (aberto) => {
  if (!aberto) return
  showPreview.value = false
  if (props.modelo) {
    nome.value = props.modelo.nome
    segmento.value = props.modelo.segmento || ''
    icone.value = props.modelo.icone || 'fa-robot'
    cor.value = props.modelo.cor || 'violet'
    descricao.value = props.modelo.descricao || ''
    personalidade.value = props.modelo.personalidade || ''
    instrucao.value = props.modelo.instrucao_principal || ''
    requerApi.value = props.modelo.requer_api
    videoUrl.value = props.modelo.integracao_video_url || ''
    ordem.value = props.modelo.ordem
    ativo.value = props.modelo.ativo
  } else {
    nome.value = ''
    segmento.value = ''
    icone.value = 'fa-robot'
    cor.value = 'violet'
    descricao.value = ''
    personalidade.value = ''
    instrucao.value = ''
    requerApi.value = false
    videoUrl.value = ''
    ordem.value = props.ordemSugerida ?? 1
    ativo.value = true
  }
})

const corAtiva = computed(() => corDoAssistente(cor.value))

// ───────── Pré-visualização do vídeo de integração (mesma lógica do player do app) ─────────
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
    case 'vazio': return { texto: 'Cole o link do vídeo que ensina o cliente a configurar a integração.', cls: 'text-slate-400 dark:text-slate-500' }
    case 'youtube': return { texto: 'YouTube reconhecido ✓ (não listados também funcionam)', cls: 'text-emerald-600 dark:text-emerald-400' }
    case 'arquivo': return { texto: 'Arquivo de vídeo direto reconhecido ✓', cls: 'text-emerald-600 dark:text-emerald-400' }
    case 'iframe': return { texto: 'Link não reconhecido como YouTube — o app exibirá como iframe genérico. Confira a pré-visualização.', cls: 'text-amber-600 dark:text-amber-400' }
    case 'invalido': return { texto: 'Isso não parece uma URL válida (precisa começar com https://).', cls: 'text-red-500 dark:text-red-400' }
  }
})

watch(videoUrl, () => { showPreview.value = false })
// Ao desmarcar a integração, fecha a pré-visualização (o valor é mantido)
watch(requerApi, (v) => { if (!v) showPreview.value = false })

// ───────── Salvar ─────────
const podeSalvar = computed(() => {
  if (!nome.value.trim() || !instrucao.value.trim() || saving.value) return false
  if (requerApi.value) {
    if (!videoUrl.value.trim()) return false
    if (videoInfo.value.tipo === 'invalido') return false
  }
  return true
})

async function salvar() {
  if (!podeSalvar.value) return
  saving.value = true
  toast = toast || await useToastSafe()
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/assistentes/salvar', {
      method: 'POST',
      body: {
        id: props.modelo?.id,
        nome: nome.value,
        segmento: segmento.value,
        icone: icone.value,
        cor: cor.value,
        descricao: descricao.value,
        personalidade: personalidade.value,
        instrucaoPrincipal: instrucao.value,
        requerApi: requerApi.value,
        // mantém o link salvo mesmo que a integração esteja momentaneamente desmarcada
        integracaoVideoUrl: requerApi.value ? videoUrl.value : null,
        ordem: ordem.value,
        ativo: ativo.value,
      },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro ao salvar')
    toast?.success(props.modelo ? 'Modelo atualizado' : 'Modelo criado')
    emit('saved')
    emit('close')
  } catch (err: any) {
    toast?.error(err?.data?.statusMessage || err?.message || 'Erro ao salvar o modelo')
  } finally {
    saving.value = false
  }
}

const inputCls = 'w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500'
const labelCls = 'block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1'
</script>

<template>
  <BaseModal :show="show" :title="modelo ? 'Editar modelo' : 'Novo modelo de assistente'" max-width="max-w-2xl" @close="emit('close')">
    <form @submit.prevent="salvar" class="space-y-4 max-h-[72vh] overflow-y-auto pr-1">

      <!-- slug (somente leitura na edição — é a referência do app) -->
      <div v-if="modelo" class="px-3 py-2 rounded bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex items-center gap-2">
        <i class="fa-solid fa-link text-slate-400 text-xs" aria-hidden="true" />
        <span class="text-xs text-slate-500 dark:text-slate-400">Slug (fixo): <code class="font-mono font-semibold text-slate-700 dark:text-slate-300">{{ modelo.slug }}</code></span>
      </div>

      <!-- Preview do cabeçalho do card -->
      <div class="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02]">
        <div class="w-11 h-11 rounded-lg flex items-center justify-center shrink-0" :class="corAtiva.soft">
          <i class="fa-solid text-lg" :class="[icone, corAtiva.text]" aria-hidden="true" />
        </div>
        <div class="min-w-0">
          <p class="font-semibold text-slate-900 dark:text-white truncate">{{ nome || 'Nome do assistente' }}</p>
          <span v-if="segmento" class="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold" :class="[corAtiva.soft, corAtiva.text]">{{ segmento }}</span>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label for="am-nome" :class="labelCls">Nome</label>
          <input id="am-nome" v-model="nome" type="text" required placeholder="Ex.: Assistente para Pet Shop" :class="inputCls" />
        </div>
        <div>
          <label for="am-seg" :class="labelCls">Segmento <span class="font-normal text-slate-400">(selo)</span></label>
          <input id="am-seg" v-model="segmento" type="text" placeholder="Ex.: Pet Shop" :class="inputCls" />
        </div>
      </div>

      <!-- Ícone -->
      <div>
        <label :class="labelCls">Ícone</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="ic in ASSISTENTE_ICONES"
            :key="ic"
            type="button"
            @click="icone = ic"
            class="w-9 h-9 rounded-lg flex items-center justify-center border transition-colors"
            :class="icone === ic
              ? [corAtiva.soft, corAtiva.text, 'border-current']
              : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'"
            :title="ic"
          >
            <i class="fa-solid text-sm" :class="ic" aria-hidden="true" />
          </button>
        </div>
      </div>

      <!-- Cor -->
      <div>
        <label :class="labelCls">Cor</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="c in ASSISTENTE_CORES"
            :key="c.key"
            type="button"
            @click="cor = c.key"
            class="w-7 h-7 rounded-full transition-transform hover:scale-110 ring-offset-2 ring-offset-white dark:ring-offset-slate-900"
            :class="[c.swatch, cor === c.key ? 'ring-2 ring-slate-900 dark:ring-white scale-110' : '']"
            :title="c.label"
            :aria-label="c.label"
          />
        </div>
      </div>

      <div>
        <label for="am-desc" :class="labelCls">Descrição curta <span class="font-normal text-slate-400">(aparece no card)</span></label>
        <textarea id="am-desc" v-model="descricao" rows="2" placeholder="Resumo do que o assistente faz" :class="[inputCls, 'resize-none']" />
      </div>

      <div>
        <label for="am-pers" :class="labelCls">Personalidade <span class="font-normal text-slate-400">(opcional)</span></label>
        <textarea id="am-pers" v-model="personalidade" rows="3" placeholder="Tom de voz e postura do assistente" :class="[inputCls, 'resize-none']" />
      </div>

      <div>
        <label for="am-inst" :class="labelCls">Instrução principal <span class="font-normal text-slate-400">(prompt que o cliente vai aplicar)</span></label>
        <textarea id="am-inst" v-model="instrucao" rows="8" required placeholder="As instruções completas do assistente…" :class="[inputCls, 'resize-y font-mono text-xs leading-relaxed']" />
      </div>

      <!-- Integração via API -->
      <div class="rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden">
        <button
          type="button"
          @click="requerApi = !requerApi"
          class="w-full flex items-center justify-between gap-3 px-4 py-3 transition-colors"
          :class="requerApi ? 'bg-purple-50 dark:bg-purple-500/10' : 'bg-slate-50 dark:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/[0.04]'"
        >
          <span class="flex items-center gap-2.5 text-left">
            <i class="fa-solid fa-plug text-sm" :class="requerApi ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400'" aria-hidden="true" />
            <span>
              <span class="block text-sm font-semibold text-slate-800 dark:text-slate-100">Tem integração via API</span>
              <span class="block text-xs text-slate-500 dark:text-slate-400">Marque se este assistente precisa conectar uma API externa</span>
            </span>
          </span>
          <span
            class="relative w-10 h-6 rounded-full transition-colors shrink-0"
            :class="requerApi ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-600'"
          >
            <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform" :class="requerApi ? 'translate-x-4' : ''" />
          </span>
        </button>

        <!-- Campo de vídeo: só aparece quando requer integração -->
        <div v-if="requerApi" class="p-4 border-t border-slate-200 dark:border-white/10 space-y-2">
          <label for="am-video" :class="labelCls">
            URL do vídeo de configuração <span class="text-red-500">*</span>
          </label>
          <div class="flex gap-2">
            <input id="am-video" v-model="videoUrl" type="text" placeholder="https://youtube.com/watch?v=…" :class="inputCls" />
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
          <p class="text-[11px]" :class="videoHint.cls">{{ videoHint.texto }}</p>

          <div v-if="showPreview && videoInfo.embedUrl" class="mt-2 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-black aspect-video">
            <video v-if="videoInfo.tipo === 'arquivo'" :src="videoInfo.embedUrl" controls class="w-full h-full" />
            <iframe
              v-else
              :src="videoInfo.embedUrl"
              class="w-full h-full"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
              title="Pré-visualização do vídeo de integração"
            />
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="am-ordem" :class="labelCls">Posição</label>
          <input id="am-ordem" v-model.number="ordem" type="number" min="0" :class="[inputCls, 'text-center tabular-nums']" />
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
            {{ ativo ? 'Visível' : 'Oculto' }}
          </button>
        </div>
      </div>

      <div class="flex gap-2 pt-1">
        <button type="button" @click="emit('close')"
          class="flex-1 px-4 py-2.5 rounded-lg font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
          Cancelar
        </button>
        <button type="submit" :disabled="!podeSalvar"
          class="flex-1 px-4 py-2.5 rounded-lg font-semibold text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white transition-colors flex items-center justify-center gap-2">
          <i v-if="saving" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
          {{ saving ? 'Salvando…' : (modelo ? 'Salvar alterações' : 'Criar modelo') }}
        </button>
      </div>
    </form>
  </BaseModal>
</template>
