<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'

/**
 * Editor de texto rico (WYSIWYG) que guarda o conteúdo no formato que o app
 * Agzap renderiza na descrição da aula:
 *   **negrito**      __sublinhado__      [texto](https://link)
 * O usuário vê negrito/sublinhado/link de verdade; o v-model é sempre a string
 * de marcação acima (compatível com o renderizador da página de Suporte do app).
 */
const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
}>(), { placeholder: '' })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const editorEl = ref<HTMLDivElement | null>(null)
const expandido = ref(false)
const vazio = ref(true)

// ───────── Marcação ⇄ HTML (espelha o renderDescricaoSegura do app) ─────────
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function marcacaoParaHtml(md: string): string {
  if (!md) return ''
  let h = escapeHtml(md)
  // link [rótulo](url) primeiro — rótulo pode conter ** ou __
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, rotulo, url) => `<a href="${url}">${rotulo}</a>`)
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  h = h.replace(/__([^_]+)__/g, '<u>$1</u>')
  h = h.replace(/\n/g, '<br>')
  return h
}

function serializar(node: Node): string {
  let out = ''
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent || ''
      return
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return
    const el = child as HTMLElement
    const tag = el.tagName.toLowerCase()
    if (tag === 'br') { out += '\n'; return }
    const dentro = serializar(el)
    if (tag === 'b' || tag === 'strong') out += dentro.trim() ? `**${dentro}**` : dentro
    else if (tag === 'u' || tag === 'ins') out += dentro.trim() ? `__${dentro}__` : dentro
    else if (tag === 'a') {
      const href = (el.getAttribute('href') || '').trim()
      out += href ? `[${dentro}](${href})` : dentro
    } else if (tag === 'div' || tag === 'p') {
      if (out && !out.endsWith('\n')) out += '\n'
      out += dentro
    } else {
      out += dentro // span/estilos desconhecidos: mantém só o texto/filhos
    }
  })
  return out
}

function htmlParaMarcacao(root: HTMLElement): string {
  return serializar(root)
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+$/g, '')
}

// ───────── Sincronização com o v-model ─────────
function emitir() {
  if (!editorEl.value) return
  const md = htmlParaMarcacao(editorEl.value)
  vazio.value = md.trim().length === 0
  if (md !== props.modelValue) emit('update:modelValue', md)
}

function carregar(valor: string) {
  if (!editorEl.value) return
  if (htmlParaMarcacao(editorEl.value) === valor) return
  editorEl.value.innerHTML = marcacaoParaHtml(valor || '')
  vazio.value = !(valor || '').trim()
}

onMounted(() => carregar(props.modelValue))
watch(() => props.modelValue, (v) => carregar(v || ''))

// ───────── Comandos de formatação ─────────
let comandosProntos = false
function prepararComandos() {
  if (comandosProntos) return
  // styleWithCSS=false → bold/underline geram <b>/<u> (e não <span style>)
  try { document.execCommand('styleWithCSS', false, 'false') } catch { /* noop */ }
  comandosProntos = true
}

function aplicar(comando: 'bold' | 'underline') {
  editorEl.value?.focus()
  prepararComandos()
  document.execCommand(comando)
  emitir()
}

// ───────── Tooltip: mostra o link embutido ao passar o mouse ─────────
const tooltipVisivel = ref(false)
const tooltipTexto = ref('')
const tooltipX = ref(0)
const tooltipY = ref(0)

function aoMover(e: MouseEvent) {
  const alvo = (e.target as HTMLElement | null)?.closest?.('a') as HTMLAnchorElement | null
  if (alvo && editorEl.value?.contains(alvo)) {
    tooltipTexto.value = alvo.getAttribute('href') || ''
    tooltipX.value = e.clientX
    tooltipY.value = e.clientY
    tooltipVisivel.value = true
  } else if (tooltipVisivel.value) {
    tooltipVisivel.value = false
  }
}
function esconderTooltip() { tooltipVisivel.value = false }

// ───────── Modal de link (criar / editar / orientar a selecionar) ─────────
type LinkModo = 'criar' | 'editar' | 'selecione'
const linkModalAberto = ref(false)
const linkModo = ref<LinkModo>('criar')
const linkTextoPreview = ref('')
const linkUrl = ref('')
const linkErro = ref('')
const urlInputEl = ref<HTMLInputElement | null>(null)
let rangeSalvo: Range | null = null
let anchorEdit: HTMLAnchorElement | null = null

// Acha um <a> que envolve a seleção/cursor (pra editar um link já existente).
function anchorDaSelecao(sel: Selection | null): HTMLAnchorElement | null {
  if (!sel || !sel.anchorNode || !editorEl.value) return null
  let el: HTMLElement | null = sel.anchorNode.nodeType === Node.TEXT_NODE
    ? sel.anchorNode.parentElement
    : (sel.anchorNode as HTMLElement)
  while (el && el !== editorEl.value) {
    if (el.tagName === 'A') return el as HTMLAnchorElement
    el = el.parentElement
  }
  return null
}

function abrirLink() {
  const sel = window.getSelection()
  rangeSalvo = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null
  const anchor = anchorDaSelecao(sel)
  const selecionado = sel ? sel.toString().trim() : ''
  linkErro.value = ''
  esconderTooltip()

  if (anchor) {
    // Já existe link no trecho → abre pra editar mostrando a URL atual.
    linkModo.value = 'editar'
    anchorEdit = anchor
    linkTextoPreview.value = anchor.textContent || ''
    linkUrl.value = anchor.getAttribute('href') || ''
  } else if (selecionado) {
    // Texto selecionado, sem link → criar.
    linkModo.value = 'criar'
    anchorEdit = null
    linkTextoPreview.value = selecionado
    linkUrl.value = ''
  } else {
    // Nada selecionado → orienta a selecionar primeiro.
    linkModo.value = 'selecione'
    anchorEdit = null
  }
  linkModalAberto.value = true
}

watch(linkModalAberto, async (aberto) => {
  if (!aberto) return
  await nextTick()
  urlInputEl.value?.focus()
  urlInputEl.value?.select()
})

function fecharLink() {
  linkModalAberto.value = false
  rangeSalvo = null
  anchorEdit = null
}

function confirmarLink() {
  let url = linkUrl.value.trim()
  if (!url) {
    linkErro.value = 'Informe o endereço do link.'
    urlInputEl.value?.focus()
    return
  }
  // Aceita colar sem protocolo: vira https:// automaticamente.
  if (!/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/+/, '')}`

  if (linkModo.value === 'editar' && anchorEdit) {
    anchorEdit.setAttribute('href', url)
  } else if (linkModo.value === 'criar') {
    editorEl.value?.focus()
    if (rangeSalvo) {
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(rangeSalvo)
    }
    prepararComandos()
    document.execCommand('createLink', false, url)
  }
  fecharLink()
  emitir()
}

// Remove o link mantendo o texto (modo editar).
function removerLink() {
  if (anchorEdit?.parentNode) {
    const pai = anchorEdit.parentNode
    while (anchorEdit.firstChild) pai.insertBefore(anchorEdit.firstChild, anchorEdit)
    pai.removeChild(anchorEdit)
  }
  fecharLink()
  emitir()
}

// Colar como texto puro evita herdar HTML sujo de outras páginas
function aoColar(e: ClipboardEvent) {
  e.preventDefault()
  const texto = e.clipboardData?.getData('text/plain') || ''
  document.execCommand('insertText', false, texto)
  emitir()
}

const btnCls = 'w-8 h-8 rounded-md inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors'
const modalInputCls = 'w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500'
</script>

<template>
  <Teleport to="body" :disabled="!expandido">
    <div :class="expandido ? 'fixed inset-0 z-[80] bg-white dark:bg-slate-900 flex flex-col p-4 sm:p-6' : 'relative'">
      <!-- Cabeçalho só no modo expandido -->
      <div v-if="expandido" class="flex items-center justify-between mb-3">
        <span class="text-sm font-bold text-slate-900 dark:text-white">Descrição da aula</span>
        <button
          type="button"
          @click="expandido = false"
          class="px-3 py-1.5 rounded-lg text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors inline-flex items-center gap-2"
        >
          <i class="fa-solid fa-compress text-xs" aria-hidden="true" />
          Concluir
        </button>
      </div>

      <div
        class="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900 focus-within:ring-2 focus-within:ring-purple-500"
        :class="expandido ? 'flex-1 flex flex-col min-h-0' : ''"
      >
        <!-- Barra de ferramentas -->
        <div class="flex items-center gap-0.5 px-1.5 py-1 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
          <button type="button" :class="btnCls" title="Negrito" @mousedown.prevent @click="aplicar('bold')">
            <i class="fa-solid fa-bold text-xs" aria-hidden="true" />
          </button>
          <button type="button" :class="btnCls" title="Sublinhado" @mousedown.prevent @click="aplicar('underline')">
            <i class="fa-solid fa-underline text-xs" aria-hidden="true" />
          </button>
          <button type="button" :class="btnCls" title="Inserir link em um texto" @mousedown.prevent @click="abrirLink">
            <i class="fa-solid fa-link text-xs" aria-hidden="true" />
          </button>

          <div class="flex-1" />

          <button
            type="button"
            :class="btnCls"
            :title="expandido ? 'Recolher' : 'Expandir para tela cheia'"
            @mousedown.prevent
            @click="expandido = !expandido"
          >
            <i class="fa-solid text-xs" :class="expandido ? 'fa-compress' : 'fa-expand'" aria-hidden="true" />
          </button>
        </div>

        <!-- Área editável -->
        <div
          ref="editorEl"
          contenteditable="true"
          role="textbox"
          aria-multiline="true"
          :data-placeholder="placeholder"
          :data-vazio="vazio ? 'true' : 'false'"
          class="app-rt-editor px-3 py-2.5 text-sm text-slate-900 dark:text-white leading-relaxed focus:outline-none overflow-y-auto whitespace-pre-wrap break-words"
          :class="expandido ? 'flex-1 min-h-0' : 'min-h-[120px] max-h-[260px]'"
          @input="emitir"
          @blur="emitir"
          @paste="aoColar"
          @mousemove="aoMover"
          @mouseleave="esconderTooltip"
        />
      </div>

      <p v-if="!expandido" class="text-[11px] mt-1 text-slate-400 dark:text-slate-500">
        Selecione um trecho e use <i class="fa-solid fa-bold" /> negrito, <i class="fa-solid fa-underline" /> sublinhado ou
        <i class="fa-solid fa-link" /> link. Clique em <i class="fa-solid fa-expand" /> para a tela cheia.
      </p>
    </div>
  </Teleport>

  <!-- Tooltip do link embutido (aparece ao passar o mouse sobre um link) -->
  <Teleport to="body">
    <div
      v-if="tooltipVisivel && tooltipTexto"
      class="fixed z-[85] pointer-events-none max-w-xs truncate px-2 py-1 rounded-md bg-slate-900 text-white text-[11px] shadow-lg ring-1 ring-white/10"
      :style="{ left: `${tooltipX + 12}px`, top: `${tooltipY + 18}px` }"
    >
      <i class="fa-solid fa-link mr-1 text-purple-300" aria-hidden="true" />{{ tooltipTexto }}
    </div>
  </Teleport>

  <!-- Modal de inserir / editar link (estilo do painel) -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="linkModalAberto"
        class="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        @click.self="fecharLink"
      >
        <div class="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div class="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
            <h3 class="text-base font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
              <i
                class="text-sm"
                :class="linkModo === 'selecione' ? 'fa-solid fa-circle-info text-amber-500' : 'fa-solid fa-link text-purple-500'"
                aria-hidden="true"
              />
              {{ linkModo === 'editar' ? 'Editar link' : linkModo === 'selecione' ? 'Selecione um texto' : 'Inserir link' }}
            </h3>
            <button type="button" @click="fecharLink" class="p-2 -mr-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500" aria-label="Fechar">
              <i class="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>

          <!-- Sem texto selecionado: orienta a selecionar primeiro -->
          <template v-if="linkModo === 'selecione'">
            <div class="p-5">
              <div class="flex items-start gap-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 p-3.5">
                <i class="fa-solid fa-arrow-pointer text-amber-500 mt-0.5" aria-hidden="true" />
                <p class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  Para incorporar um link, <strong>selecione primeiro o texto</strong> que vai virar link
                  — por exemplo <em>"clique aqui"</em> — e então clique de novo no botão
                  <i class="fa-solid fa-link text-xs text-purple-500" aria-hidden="true" />.
                </p>
              </div>
            </div>
            <div class="flex px-5 pb-5">
              <button
                type="button"
                @click="fecharLink"
                class="flex-1 px-4 py-2.5 rounded-lg font-semibold text-sm bg-purple-600 hover:bg-purple-700 text-white transition-colors"
              >
                Entendi
              </button>
            </div>
          </template>

          <!-- Criar / editar link -->
          <template v-else>
            <div class="p-5 space-y-3">
              <div>
                <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Texto do link</span>
                <div class="px-3 py-2 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-200 truncate">
                  {{ linkTextoPreview || '—' }}
                </div>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Endereço do link</label>
                <input
                  ref="urlInputEl"
                  v-model="linkUrl"
                  type="url"
                  inputmode="url"
                  placeholder="https://..."
                  :class="[modalInputCls, linkErro ? '!border-red-400 focus:!ring-red-500' : '']"
                  @input="linkErro = ''"
                  @keyup.enter="confirmarLink"
                  @keyup.esc="fecharLink"
                />
                <p v-if="linkErro" class="text-[11px] mt-1 text-red-500">{{ linkErro }}</p>
              </div>
            </div>

            <div class="flex gap-2 px-5 pb-5">
              <button
                v-if="linkModo === 'editar'"
                type="button"
                @click="removerLink"
                title="Remover o link (mantém o texto)"
                class="px-3 py-2.5 rounded-lg font-semibold text-sm border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors inline-flex items-center gap-2"
              >
                <i class="fa-solid fa-link-slash text-xs" aria-hidden="true" /> Remover
              </button>
              <button
                type="button"
                @click="fecharLink"
                class="flex-1 px-4 py-2.5 rounded-lg font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                @click="confirmarLink"
                class="flex-1 px-4 py-2.5 rounded-lg font-semibold text-sm bg-purple-600 hover:bg-purple-700 text-white transition-colors inline-flex items-center justify-center gap-2"
              >
                <i class="fa-solid fa-check text-xs" aria-hidden="true" /> {{ linkModo === 'editar' ? 'Salvar' : 'Inserir' }}
              </button>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.app-rt-editor[data-vazio='true']::before {
  content: attr(data-placeholder);
  color: rgb(148 163 184);
  pointer-events: none;
}
.app-rt-editor :deep(a) {
  color: rgb(124 58 237);
  text-decoration: underline;
  word-break: break-word;
}
.app-rt-editor :deep(strong),
.app-rt-editor :deep(b) {
  font-weight: 700;
}
.app-rt-editor :deep(u) {
  text-decoration: underline;
}
</style>
