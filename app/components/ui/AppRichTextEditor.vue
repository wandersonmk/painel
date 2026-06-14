<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

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

function inserirLink() {
  editorEl.value?.focus()
  const sel = window.getSelection()
  const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null
  const selecionado = sel ? sel.toString().trim() : ''

  const url = window.prompt('Cole o endereço do link (começando com https://):', 'https://')?.trim()
  if (!url) return
  if (!/^https?:\/\//i.test(url)) {
    window.alert('O link precisa começar com http:// ou https://')
    return
  }

  editorEl.value?.focus()
  if (range && sel) { sel.removeAllRanges(); sel.addRange(range) }
  prepararComandos()

  if (selecionado) {
    document.execCommand('createLink', false, url)
  } else {
    const texto = window.prompt('Texto que vai aparecer no link (ex.: clique aqui):', 'clique aqui')?.trim() || url
    document.execCommand('insertHTML', false, `<a href="${url}">${escapeHtml(texto)}</a>`)
  }
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
          <button type="button" :class="btnCls" title="Inserir link em um texto" @mousedown.prevent @click="inserirLink">
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
        />
      </div>

      <p v-if="!expandido" class="text-[11px] mt-1 text-slate-400 dark:text-slate-500">
        Selecione um trecho e use <i class="fa-solid fa-bold" /> negrito, <i class="fa-solid fa-underline" /> sublinhado ou
        <i class="fa-solid fa-link" /> link. Clique em <i class="fa-solid fa-expand" /> para a tela cheia.
      </p>
    </div>
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
