<script lang="ts">
import { useAdminAuthHeaders } from '~/composables/useAdminAuthHeaders'

/**
 * Comprovante do PIX de um saque de afiliado: buscar (pelas rotas com login,
 * nunca pela URL pública do R2), ver dentro da página e baixar direto.
 *
 * Rotas:
 * - admin:    /api/admin/afiliados/saque-comprovante-download
 * - afiliado: /api/afiliado/saque-comprovante
 */
export interface ArquivoComprovante { blob: Blob; nome: string }

export async function buscarComprovante(rota: string, saqueId: string): Promise<ArquivoComprovante> {
  const resp = await $fetch.raw<Blob>(rota, {
    query: { saqueId },
    headers: await useAdminAuthHeaders(),
    responseType: 'blob',
  })
  const blob = resp._data
  if (!blob || !blob.size) throw new Error('Comprovante vazio.')
  const nome = /filename="([^"]+)"/.exec(resp.headers.get('content-disposition') || '')?.[1] || 'comprovante-saque'
  return { blob, nome }
}

/** Baixa por um link temporário com download: não abre aba nem página. */
export function salvarUrl(url: string, nome: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export async function baixarComprovante(rota: string, saqueId: string) {
  const { blob, nome } = await buscarComprovante(rota, saqueId)
  const url = URL.createObjectURL(blob)
  salvarUrl(url, nome)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function mensagemErroComprovante(e: any): string {
  const status = Number(e?.statusCode ?? e?.status ?? 0)
  if (status === 404) return 'Comprovante não encontrado.'
  if (status === 401 || status === 403) return 'Sua sessão expirou. Entre de novo para ver o comprovante.'
  return 'Não foi possível carregar o comprovante. Tente de novo.'
}
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

/**
 * Visualizador do comprovante dentro da página (imagem ou PDF).
 * Fonte: rota + saqueId (busca com login) ou um arquivo local (antes de pagar).
 */
const props = defineProps<{
  show: boolean
  rota?: string
  saqueId?: string | null
  arquivo?: ArquivoComprovante | null
  subtitulo?: string | null
}>()
const emit = defineEmits<{ close: [] }>()

const carregando = ref(false)
const erro = ref('')
const url = ref<string | null>(null)
const nome = ref('')
const tipo = ref('')
const mostraPdf = ref(true)
let geracao = 0

const ehImagem = computed(() => tipo.value.startsWith('image/'))
const ehPdf = computed(() => tipo.value === 'application/pdf')

function tipoDe(blob: Blob, nomeArquivo: string) {
  if (blob.type) return blob.type.toLowerCase()
  const ext = nomeArquivo.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return ''
}

function limpar() {
  geracao++
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = null
  nome.value = ''
  tipo.value = ''
  erro.value = ''
  carregando.value = false
}

function abrir(arq: ArquivoComprovante) {
  tipo.value = tipoDe(arq.blob, arq.nome)
  nome.value = arq.nome
  // Celular (Android/iOS) não mostra PDF dentro da página: aí fica só o Baixar.
  mostraPdf.value = (navigator as any).pdfViewerEnabled !== false
  url.value = URL.createObjectURL(arq.blob)
}

async function carregar() {
  limpar()
  const g = geracao
  if (props.arquivo) {
    abrir(props.arquivo)
    return
  }
  if (!props.rota || !props.saqueId) {
    erro.value = 'Comprovante não encontrado.'
    return
  }
  carregando.value = true
  try {
    const arq = await buscarComprovante(props.rota, props.saqueId)
    if (g !== geracao) return
    abrir(arq)
  } catch (e: any) {
    if (g !== geracao) return
    erro.value = mensagemErroComprovante(e)
  } finally {
    if (g === geracao) carregando.value = false
  }
}

watch(
  () => [props.show, props.saqueId, props.arquivo] as const,
  ([aberto]) => {
    if (aberto) carregar()
    else limpar()
  },
  { immediate: true },
)
onBeforeUnmount(limpar)

/** Baixar reaproveita o arquivo já carregado (nada de buscar de novo). */
function baixar() {
  if (url.value) salvarUrl(url.value, nome.value || 'comprovante-saque')
}
</script>

<template>
  <BaseModal :show="show" title="Comprovante do saque" max-width="max-w-4xl" @close="emit('close')">
    <div class="space-y-3">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0 text-xs text-slate-500 dark:text-slate-400">
        <i class="fa-solid shrink-0" :class="ehPdf ? 'fa-file-pdf' : 'fa-file-image'" aria-hidden="true" />
        <span class="min-w-0 truncate text-slate-700 dark:text-slate-300">{{ nome || (carregando ? 'Carregando…' : 'Comprovante') }}</span>
        <span v-if="subtitulo" class="shrink-0">· {{ subtitulo }}</span>
      </div>

      <div class="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 min-h-[40vh] flex items-center justify-center overflow-hidden">
        <div v-if="carregando" class="flex flex-col items-center gap-2 py-10 text-sm text-slate-500 dark:text-slate-400">
          <i class="fa-solid fa-circle-notch animate-spin text-xl text-purple-500" aria-hidden="true" />
          Carregando comprovante…
        </div>

        <div v-else-if="erro" class="flex flex-col items-center gap-3 px-4 py-10 text-center">
          <i class="fa-solid fa-circle-exclamation text-2xl text-red-500 dark:text-red-400" aria-hidden="true" />
          <p class="text-sm text-slate-600 dark:text-slate-300">{{ erro }}</p>
          <button
            v-if="!arquivo && rota && saqueId"
            type="button"
            class="text-xs font-normal text-purple-600 dark:text-purple-400 hover:underline"
            @click="carregar"
          >
            Tentar de novo
          </button>
        </div>

        <img
          v-else-if="url && ehImagem"
          :src="url"
          alt="Comprovante do PIX"
          class="block w-auto max-w-full max-h-[65vh] object-contain mx-auto"
        >

        <template v-else-if="url && ehPdf">
          <iframe v-if="mostraPdf" :src="url" title="Comprovante em PDF" class="block w-full h-[65vh] bg-white" />
          <div v-else class="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <i class="fa-solid fa-file-pdf text-3xl text-red-500 dark:text-red-400" aria-hidden="true" />
            <p class="text-sm text-slate-600 dark:text-slate-300">Este navegador não mostra PDF dentro da página. Use o botão Baixar para abrir o arquivo.</p>
          </div>
        </template>

        <div v-else-if="url" class="flex flex-col items-center gap-3 px-4 py-10 text-center">
          <i class="fa-solid fa-file text-3xl text-slate-400" aria-hidden="true" />
          <p class="text-sm text-slate-600 dark:text-slate-300">Não dá para mostrar este arquivo aqui. Use o botão Baixar.</p>
        </div>
      </div>

      <p v-if="url && ehPdf && mostraPdf" class="text-[11px] text-slate-400 dark:text-slate-500">
        Se o PDF não aparecer, use o botão Baixar.
      </p>

      <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
        <button
          type="button"
          class="px-4 py-2.5 rounded text-sm font-normal border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          @click="emit('close')"
        >
          Fechar
        </button>
        <button
          type="button"
          :disabled="!url"
          class="px-4 py-2.5 rounded text-sm font-normal bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white transition-colors inline-flex items-center justify-center gap-2"
          @click="baixar"
        >
          <i class="fa-solid fa-download text-xs" aria-hidden="true" />
          Baixar
        </button>
      </div>
    </div>
  </BaseModal>
</template>
