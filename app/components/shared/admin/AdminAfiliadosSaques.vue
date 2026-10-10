<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { formatarDocumento } from '~~/shared/utils/documento'
import { formatPhoneSemDdiBrasil, whatsappLink } from '~/utils/phone'
import ComprovanteSaqueModal, { baixarComprovante as baixarArquivoComprovante, mensagemErroComprovante } from '~/components/shared/ComprovanteSaqueModal.vue'
import type { ArquivoComprovante } from '~/components/shared/ComprovanteSaqueModal.vue'

/**
 * Aba "Saques" da página /afiliados. O afiliado pede, a Agzap paga por PIX
 * (no prazo configurado, padrão 48 horas) numa chave no nome dele. Aqui o
 * admin marca como pago (com comprovante opcional) ou recusa (com motivo).
 */
type Filtro = 'abertos' | 'pagos' | 'recusados' | 'todos'
type StatusSaque = 'solicitado' | 'pago' | 'recusado'

interface SaqueAdmin {
  id: string
  afiliado_id: string
  afiliado_nome: string | null
  afiliado_email: string | null
  afiliado_ativo: boolean | null
  afiliado_telefone?: string | null
  afiliado_codigo?: string | null
  valor: number
  chave_pix: string
  chave_pix_tipo: string | null
  titular_nome: string
  titular_documento: string
  status: StatusSaque
  solicitado_em: string
  prazo_em: string
  pago_em: string | null
  comprovante: string | null
  /** Arquivo do PIX (imagem ou PDF) no R2. */
  comprovante_url?: string | null
  recusa_motivo: string | null
}

interface Contagem { abertos: number; pagos: number; recusados: number; todos: number }

const emit = defineEmits<{
  alterado: []
  contagem: [abertos: number]
}>()

const toast = useToast()

const FILTROS: Array<{ valor: Filtro; rotulo: string }> = [
  { valor: 'abertos', rotulo: 'Abertos' },
  { valor: 'pagos', rotulo: 'Pagos' },
  { valor: 'recusados', rotulo: 'Recusados' },
  { valor: 'todos', rotulo: 'Todos' },
]

const filtro = ref<Filtro>('abertos')
const saques = ref<SaqueAdmin[]>([])
const contagem = ref<Contagem>({ abertos: 0, pagos: 0, recusados: 0, todos: 0 })
const prazoHoras = ref(48)
const truncado = ref(false)
const carregando = ref(true)
const erro = ref('')

// Trocar de filtro rápido não deixa uma resposta antiga sobrescrever a nova.
let pedidoAtual = 0

async function carregar() {
  const pedido = ++pedidoAtual
  carregando.value = true
  erro.value = ''
  try {
    const resp = await $fetch<{
      success: boolean
      error?: string
      data?: { saques: SaqueAdmin[]; contagem: Contagem; truncado: boolean; prazo_saque_horas: number }
    }>('/api/admin/afiliados/saques', {
      query: { status: filtro.value },
      headers: await useAdminAuthHeaders(),
    })
    if (pedido !== pedidoAtual) return
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Não foi possível carregar os saques.')
    saques.value = resp.data.saques
    contagem.value = resp.data.contagem
    truncado.value = resp.data.truncado
    prazoHoras.value = resp.data.prazo_saque_horas
    emit('contagem', resp.data.contagem.abertos)
  } catch (e: any) {
    if (pedido !== pedidoAtual) return
    erro.value = e?.data?.statusMessage || e?.message || 'Não foi possível carregar os saques.'
  } finally {
    if (pedido === pedidoAtual) carregando.value = false
  }
}

watch(filtro, carregar)

// Relógio da tela: o prazo fica vermelho quando passa, sem precisar recarregar.
const agora = ref(Date.now())
let relogio: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  carregar()
  relogio = setInterval(() => { agora.value = Date.now() }, 60_000)
})
onBeforeUnmount(() => {
  if (relogio) clearInterval(relogio)
  limparAnexo()
})

defineExpose({ carregar })

// ───────── Copiar chave / documento ─────────
const copiado = ref<string | null>(null)
async function copiarTexto(chave: string, texto: string, aviso: string) {
  try {
    await navigator.clipboard.writeText(texto)
    copiado.value = chave
    toast.success(aviso)
    setTimeout(() => { if (copiado.value === chave) copiado.value = null }, 2000)
  } catch {
    toast.error('Não foi possível copiar')
  }
}
function copiarChave(s: SaqueAdmin) {
  return copiarTexto(s.id, s.chave_pix, 'Chave PIX copiada')
}
function copiarDocumento(s: SaqueAdmin) {
  return copiarTexto(`${s.id}:doc`, String(s.titular_documento || '').replace(/\D/g, ''), 'CPF/CNPJ copiado')
}

/** Tira o saque da lista na hora (sem esperar o recarregar): não dá para clicar de novo nele. */
function aplicarLocal(id: string, status: StatusSaque) {
  if (filtro.value === 'abertos') {
    saques.value = saques.value.filter(x => x.id !== id)
  } else {
    saques.value = saques.value.map(x => (x.id === id ? { ...x, status } : x))
  }
  const c = contagem.value
  if (c.abertos > 0) {
    contagem.value = {
      ...c,
      abertos: c.abertos - 1,
      pagos: c.pagos + (status === 'pago' ? 1 : 0),
      recusados: c.recusados + (status === 'recusado' ? 1 : 0),
    }
    emit('contagem', contagem.value.abertos)
  }
}

// ───────── Arquivo do comprovante (R2) ─────────
// A Vercel corta corpo acima de 4,5 MB: imagem é reduzida aqui no navegador
// (lado maior até 1600 px, JPEG ~0,8, alvo abaixo de 1,5 MB) e PDF vai até 4 MB.
const ACEITA = 'image/jpeg,image/png,image/webp,application/pdf'
const LIMITE_ARQUIVO = 4 * 1024 * 1024
const ALVO_IMAGEM = 1.5 * 1024 * 1024
const LADO_MAX = 1600

type TipoAnexo = 'imagem' | 'pdf'

function fmtTamanho(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function tipoDoArquivo(file: File): TipoAnexo | null {
  const t = (file.type || '').toLowerCase()
  if (t === 'application/pdf') return 'pdf'
  if (['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(t)) return 'imagem'
  if (!t) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (ext === 'pdf') return 'pdf'
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'imagem'
  }
  return null
}

function carregarImagem(arquivo: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir esta imagem. Tente outro arquivo.')) }
    img.src = url
  })
}

/** Imagem já leve vai como está; senão vira JPEG menor (fundo branco para PNG transparente). */
async function reduzirImagem(file: File): Promise<Blob> {
  const img = await carregarImagem(file)
  const w0 = img.naturalWidth
  const h0 = img.naturalHeight
  if (!w0 || !h0) throw new Error('Não foi possível abrir esta imagem. Tente outro arquivo.')
  if (Math.max(w0, h0) <= LADO_MAX && file.size <= ALVO_IMAGEM) return file

  let lado = LADO_MAX
  let qualidade = 0.8
  let saida: Blob | null = null
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const escala = Math.min(1, lado / Math.max(w0, h0))
    const w = Math.max(1, Math.round(w0 * escala))
    const h = Math.max(1, Math.round(h0 * escala))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Não foi possível preparar a imagem neste navegador.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    saida = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', qualidade))
    if (!saida) throw new Error('Não foi possível preparar a imagem neste navegador.')
    if (saida.size <= ALVO_IMAGEM) break
    lado = Math.round(lado * 0.8)
    qualidade = Math.max(0.6, qualidade - 0.1)
  }
  return saida as Blob
}

async function prepararArquivo(file: File): Promise<{ blob: Blob; nome: string; tipo: TipoAnexo }> {
  const tipo = tipoDoArquivo(file)
  if (!tipo) throw new Error('Formato não aceito. Envie uma imagem (JPG, PNG ou WEBP) ou um PDF.')
  if (tipo === 'pdf') {
    if (file.size > LIMITE_ARQUIVO) {
      throw new Error(`Este PDF tem ${fmtTamanho(file.size)} e o limite é 4 MB. Envie um PDF menor ou um print do comprovante.`)
    }
    return { blob: file, nome: file.name || 'comprovante.pdf', tipo }
  }
  const blob = await reduzirImagem(file)
  if (blob.size > LIMITE_ARQUIVO) throw new Error('A imagem continua grande demais mesmo reduzida. Envie um print menor.')
  const base = (file.name || '').replace(/\.[^.]+$/, '') || 'comprovante'
  return { blob, nome: blob === file ? (file.name || `${base}.jpg`) : `${base}.jpg`, tipo }
}

/** Sobe o arquivo (multipart) com progresso. Saque já pago: o servidor grava na hora. */
async function enviarComprovante(
  saqueId: string,
  arquivo: Blob,
  nome: string,
  aoProgredir?: (pct: number) => void,
  sinal?: AbortSignal,
): Promise<{ url: string; salvo: boolean }> {
  const headers = await useAdminAuthHeaders()
  const form = new FormData()
  form.append('saqueId', saqueId)
  form.append('arquivo', arquivo, nome)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/admin/afiliados/saque-comprovante')
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    xhr.responseType = 'json'
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && aoProgredir) aoProgredir(Math.min(100, Math.round((e.loaded / e.total) * 100)))
    }
    xhr.onload = () => {
      const r = xhr.response as any
      if (xhr.status === 413) return reject(new Error('O arquivo é grande demais para enviar. O limite é 4 MB.'))
      if (xhr.status >= 400) return reject(new Error(r?.statusMessage || r?.message || 'Não foi possível enviar o comprovante.'))
      if (!r?.success || !r?.data?.url) return reject(new Error(r?.error || 'Não foi possível enviar o comprovante.'))
      resolve({ url: String(r.data.url), salvo: !!r.data.salvo })
    }
    xhr.onerror = () => reject(new Error('Falha de conexão ao enviar o comprovante. Tente de novo.'))
    xhr.onabort = () => reject(new Error('Envio cancelado.'))
    sinal?.addEventListener('abort', () => xhr.abort())
    xhr.send(form)
  })
}

// Anexo do modal "Marcar saque como pago": sobe ao escolher, a URL vai no confirmar.
interface Anexo { nome: string; tipo: TipoAnexo; tamanho: number; previa: string | null; url: string | null; arquivo: ArquivoComprovante }
const anexo = ref<Anexo | null>(null)
const enviandoAnexo = ref(false)
const progressoAnexo = ref(0)
const erroAnexo = ref('')
const arrastando = ref(false)
const inputAnexo = ref<HTMLInputElement | null>(null)
let envioAnexo: AbortController | null = null
let geracaoAnexo = 0

function limparAnexo() {
  geracaoAnexo++
  envioAnexo?.abort()
  envioAnexo = null
  if (anexo.value?.previa) URL.revokeObjectURL(anexo.value.previa)
  anexo.value = null
  enviandoAnexo.value = false
  progressoAnexo.value = 0
  erroAnexo.value = ''
  arrastando.value = false
}

async function anexarNoModal(file: File | null | undefined) {
  const s = alvoPagar.value
  if (!file || !s || pagando.value) return
  limparAnexo()
  const geracao = geracaoAnexo
  enviandoAnexo.value = true
  try {
    const preparado = await prepararArquivo(file)
    if (geracao !== geracaoAnexo) return
    const controle = new AbortController()
    envioAnexo = controle
    anexo.value = {
      nome: preparado.nome,
      tipo: preparado.tipo,
      tamanho: preparado.blob.size,
      previa: preparado.tipo === 'imagem' ? URL.createObjectURL(preparado.blob) : null,
      url: null,
      // Arquivo local: o "ver" do modal mostra este, sem abrir a URL pública.
      arquivo: { blob: preparado.blob, nome: preparado.nome },
    }
    const r = await enviarComprovante(s.id, preparado.blob, preparado.nome, (pct) => {
      if (geracao === geracaoAnexo) progressoAnexo.value = pct
    }, controle.signal)
    if (geracao !== geracaoAnexo || !anexo.value) return
    anexo.value = { ...anexo.value, url: r.url }
    envioAnexo = null
    enviandoAnexo.value = false
  } catch (e: any) {
    if (geracao !== geracaoAnexo) return
    const msg = e?.message || 'Não foi possível enviar o comprovante.'
    limparAnexo()
    erroAnexo.value = msg
  }
}

function aoEscolherNoModal(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  anexarNoModal(file)
}
function aoSoltarNoModal(e: DragEvent) {
  arrastando.value = false
  anexarNoModal(e.dataTransfer?.files?.[0])
}

// Anexar (ou trocar) depois, num saque que já está pago: o servidor grava direto.
const alvoAnexoDepois = ref<SaqueAdmin | null>(null)
const anexandoId = ref<string | null>(null)
const progressoDepois = ref(0)
const inputAnexoDepois = ref<HTMLInputElement | null>(null)

function escolherAnexoDepois(s: SaqueAdmin) {
  if (anexandoId.value) return
  alvoAnexoDepois.value = s
  inputAnexoDepois.value?.click()
}

async function aoEscolherDepois(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const s = alvoAnexoDepois.value
  alvoAnexoDepois.value = null
  if (!file || !s || anexandoId.value) return
  anexandoId.value = s.id
  progressoDepois.value = 0
  try {
    const preparado = await prepararArquivo(file)
    const r = await enviarComprovante(s.id, preparado.blob, preparado.nome, (pct) => { progressoDepois.value = pct })
    if (!r.salvo) throw new Error('O arquivo foi enviado, mas não ficou gravado no saque. Tente de novo.')
    saques.value = saques.value.map(x => (x.id === s.id ? { ...x, comprovante_url: r.url } : x))
    toast.success(s.comprovante_url ? 'Comprovante trocado' : 'Comprovante anexado')
  } catch (err: any) {
    toast.error(err?.message || 'Não foi possível anexar o comprovante')
  } finally {
    anexandoId.value = null
  }
}

// ───────── Ver / baixar o comprovante (pela rota com login, nunca pela URL pública) ─────────
const ROTA_COMPROVANTE = '/api/admin/afiliados/saque-comprovante-download'

// "Baixar" da lista: busca o arquivo e baixa por link temporário, sem abrir aba.
const baixandoId = ref<string | null>(null)
async function baixarComprovante(s: SaqueAdmin) {
  if (baixandoId.value) return
  baixandoId.value = s.id
  try {
    await baixarArquivoComprovante(ROTA_COMPROVANTE, s.id)
  } catch (e: any) {
    toast.error(mensagemErroComprovante(e))
  } finally {
    baixandoId.value = null
  }
}

// Visualizador dentro da página: saque pago (rota) ou o arquivo local do modal de pagar.
const visualizador = ref<{ saqueId: string | null; arquivo: ArquivoComprovante | null; subtitulo: string } | null>(null)
function verComprovante(s: SaqueAdmin) {
  const partes = [s.afiliado_nome || 'Afiliado', fmtBRL(s.valor)]
  if (s.pago_em) partes.push(`pago em ${fmtDiaHora(s.pago_em)}`)
  visualizador.value = { saqueId: s.id, arquivo: null, subtitulo: partes.join(' · ') }
}
function verAnexoLocal() {
  const a = anexo.value
  if (!a) return
  visualizador.value = { saqueId: null, arquivo: a.arquivo, subtitulo: 'Ainda não confirmado' }
}

// ───────── Marcar como pago ─────────
const alvoPagar = ref<SaqueAdmin | null>(null)
const comprovante = ref('')
const pagando = ref(false)

function abrirPagar(s: SaqueAdmin) {
  limparAnexo()
  alvoPagar.value = s
  comprovante.value = ''
}
function fecharPagar() {
  if (pagando.value) return
  limparAnexo()
  alvoPagar.value = null
}

async function confirmarPagamento() {
  const s = alvoPagar.value
  if (!s || pagando.value || enviandoAnexo.value) return
  pagando.value = true
  try {
    const resp = await $fetch<{ success: boolean; error?: string; aviso?: string }>('/api/admin/afiliados/saque-pagar', {
      method: 'POST',
      body: {
        saqueId: s.id,
        comprovante: comprovante.value.trim() || undefined,
        comprovanteUrl: anexo.value?.url || undefined,
      },
      headers: await useAdminAuthHeaders(),
    })
    pagando.value = false
    limparAnexo()
    alvoPagar.value = null
    if (!resp.success) {
      // Outro admin (ou outra aba) já tratou o saque: avisa e mostra o estado atual.
      toast.error(resp.error || 'Não foi possível marcar como pago')
    } else {
      aplicarLocal(s.id, 'pago')
      if (resp.aviso) toast.warning(resp.aviso)
      else toast.success(`Saque de ${fmtBRL(s.valor)} para ${s.afiliado_nome || 'o afiliado'} marcado como pago`)
    }
    await carregar()
    emit('alterado')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.message || 'Não foi possível marcar como pago')
  } finally {
    pagando.value = false
  }
}

// ───────── Recusar ─────────
const alvoRecusar = ref<SaqueAdmin | null>(null)
const motivoRecusa = ref('')
const recusando = ref(false)

function abrirRecusar(s: SaqueAdmin) {
  alvoRecusar.value = s
  motivoRecusa.value = ''
}
function fecharRecusar() {
  if (recusando.value) return
  alvoRecusar.value = null
}

async function confirmarRecusa() {
  const s = alvoRecusar.value
  const motivo = motivoRecusa.value.trim()
  if (!s || recusando.value || motivo.length < 3) return
  recusando.value = true
  try {
    const resp = await $fetch<{ success: boolean; error?: string; aviso?: string }>('/api/admin/afiliados/saque-recusar', {
      method: 'POST',
      body: { saqueId: s.id, motivo },
      headers: await useAdminAuthHeaders(),
    })
    recusando.value = false
    alvoRecusar.value = null
    if (!resp.success) {
      toast.error(resp.error || 'Não foi possível recusar o saque')
    } else {
      aplicarLocal(s.id, 'recusado')
      if (resp.aviso) toast.warning(resp.aviso)
      else toast.success(`Saque recusado. ${fmtBRL(s.valor)} voltou para o disponível de ${s.afiliado_nome || 'o afiliado'}`)
    }
    await carregar()
    emit('alterado')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.message || 'Não foi possível recusar o saque')
  } finally {
    recusando.value = false
  }
}

// ───────── Formatação ─────────
function fmtBRL(v: number | null | undefined) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0))
}
function fmtDiaHora(s: string | null) {
  if (!s) return '—'
  const d = new Date(s)
  const dia = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${dia} ${hora}`
}

const TIPOS_CHAVE: Record<string, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  telefone: 'Telefone',
  aleatoria: 'Aleatória',
}
function rotuloTipoChave(tipo: string | null) {
  return tipo ? (TIPOS_CHAVE[tipo] ?? tipo) : 'Chave'
}
function chaveFormatada(s: SaqueAdmin) {
  if (s.chave_pix_tipo === 'cpf' || s.chave_pix_tipo === 'cnpj') return formatarDocumento(s.chave_pix)
  if (s.chave_pix_tipo === 'telefone') return formatPhoneSemDdiBrasil(s.chave_pix) || s.chave_pix
  return s.chave_pix
}
function tipoDocumento(doc: string) {
  const d = String(doc || '').replace(/[^0-9A-Za-z]/g, '')
  return d.length === 11 ? 'CPF' : d.length === 14 ? 'CNPJ' : 'Doc.'
}
function prazoVencido(s: SaqueAdmin) {
  return s.status === 'solicitado' && new Date(s.prazo_em).getTime() < agora.value
}

const SITUACOES: Record<StatusSaque, { rotulo: string; cls: string }> = {
  solicitado: { rotulo: 'Aberto', cls: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  pago: { rotulo: 'Pago', cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  recusado: { rotulo: 'Recusado', cls: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400' },
}

const vazioTexto = computed(() => ({
  abertos: 'Nenhum saque aguardando pagamento',
  pagos: 'Nenhum saque pago ainda',
  recusados: 'Nenhum saque recusado',
  todos: 'Nenhum afiliado pediu saque ainda',
}[filtro.value]))

// Linhas recolhidas: abrir mostra chave PIX, titular, datas e as ações.
const abertos = ref(new Set<string>())
function alternar(id: string) {
  if (abertos.value.has(id)) abertos.value.delete(id)
  else abertos.value.add(id)
}

const cardBase = 'rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none'
const colHead = 'text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider'
const rotuloCampo = 'text-[11px] text-slate-500 dark:text-slate-400'
const inputBase = 'w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500'
</script>

<template>
  <div class="space-y-4">

    <!-- Como funciona -->
    <div class="rounded-md bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 px-4 py-2.5 text-xs text-purple-800 dark:text-purple-200 flex items-start gap-2">
      <i class="fa-solid fa-circle-info mt-0.5" aria-hidden="true" />
      <span class="min-w-0">
        O pedido de saque do afiliado cai aqui na hora, em Abertos (ele também pode avisar pelo WhatsApp, se quiser). A Agzap paga por PIX em até {{ prazoHoras }} horas,
        numa chave no nome, CPF ou CNPJ do próprio afiliado. Antes de pagar, confira se o nome do titular que o banco mostra é o do afiliado.
      </span>
    </div>

    <div :class="cardBase">
      <!-- Filtros -->
      <div class="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
        <button
          v-for="f in FILTROS"
          :key="f.valor"
          type="button"
          class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-normal border transition-colors"
          :class="filtro === f.valor
            ? 'bg-purple-600 border-purple-600 text-white'
            : 'bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-purple-300 dark:hover:border-purple-500/40'"
          :aria-pressed="filtro === f.valor"
          @click="filtro = f.valor"
        >
          {{ f.rotulo }}
          <span
            class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] tabular-nums"
            :class="filtro === f.valor ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400'"
          >{{ contagem[f.valor] }}</span>
        </button>
        <i v-if="carregando && saques.length" class="fa-solid fa-circle-notch animate-spin text-xs text-slate-400 ml-1" aria-hidden="true" />
      </div>

      <div v-if="erro" class="m-4 p-3 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-center justify-between gap-3">
        <span class="min-w-0">{{ erro }}</span>
        <button type="button" class="text-xs font-normal underline shrink-0" @click="carregar">Tentar de novo</button>
      </div>

      <div v-if="carregando && !saques.length" class="p-4 space-y-3">
        <div v-for="i in 3" :key="i" class="flex items-center gap-3">
          <div class="size-9 rounded-full bg-slate-100 dark:bg-white/5 animate-pulse shrink-0" />
          <div class="flex-1 space-y-1.5">
            <div class="h-3.5 rounded bg-slate-100 dark:bg-white/5 animate-pulse" :class="i === 2 ? 'w-1/3' : 'w-1/2'" />
            <div class="h-3 w-1/4 rounded bg-slate-100 dark:bg-white/5 animate-pulse" />
          </div>
        </div>
      </div>

      <div v-else-if="!saques.length && !erro" class="px-5 py-14 text-center">
        <i class="fa-solid fa-money-bill-transfer text-slate-300 dark:text-slate-700 text-3xl mb-3 block" aria-hidden="true" />
        <p class="text-slate-500 dark:text-slate-400 text-sm">{{ vazioTexto }}</p>
      </div>

      <template v-else-if="saques.length">
        <!-- Cabeçalho das colunas (telas largas) -->
        <div class="hidden lg:flex items-center gap-3 px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-white/[0.02]">
          <span :class="[colHead, 'flex-1 min-w-0 pl-12']">Afiliado</span>
          <span :class="[colHead, 'hidden xl:block w-28 shrink-0']">Pedido em</span>
          <span :class="[colHead, 'w-32 shrink-0']">Prazo</span>
          <span :class="[colHead, 'w-28 shrink-0 text-right']">Valor</span>
          <span :class="[colHead, 'w-24 shrink-0']">Situação</span>
          <span class="hidden xl:block w-[5.5rem] shrink-0" aria-hidden="true" />
          <span class="w-8 shrink-0" aria-hidden="true" />
        </div>

        <ul class="divide-y divide-slate-100 dark:divide-slate-800">
          <li v-for="s in saques" :key="s.id">
            <!-- Linha recolhida -->
            <div
              class="flex items-center gap-3 px-3 sm:px-4 py-3 cursor-pointer transition-colors"
              :class="abertos.has(s.id) ? 'bg-purple-50/40 dark:bg-purple-500/[0.04]' : 'hover:bg-slate-50/80 dark:hover:bg-white/[0.03]'"
              @click="alternar(s.id)"
            >
              <div
                class="size-9 rounded-full flex items-center justify-center shrink-0 text-xs"
                :class="s.status === 'pago'
                  ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : s.status === 'recusado'
                    ? 'bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400'
                    : 'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400'"
              >
                <i class="fa-solid" :class="s.status === 'pago' ? 'fa-check' : s.status === 'recusado' ? 'fa-xmark' : 'fa-money-bill-transfer'" aria-hidden="true" />
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 min-w-0">
                  <p class="text-sm font-medium text-slate-900 dark:text-white truncate">{{ s.afiliado_nome || 'Afiliado removido' }}</p>
                  <span v-if="s.afiliado_ativo === false" class="shrink-0 inline-flex px-1.5 py-0.5 rounded-full text-[10px] bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400">bloqueado</span>
                  <i v-if="s.comprovante_url" class="fa-solid fa-paperclip shrink-0 text-[10px] text-slate-400 dark:text-slate-500" title="Comprovante anexado" aria-label="Comprovante anexado" />
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400 truncate">{{ s.afiliado_email || '—' }}</p>
                <!-- O que não cabe nas colunas desta largura -->
                <div class="xl:hidden mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span class="lg:hidden inline-flex px-1.5 py-0.5 rounded-full text-[10px] whitespace-nowrap" :class="SITUACOES[s.status]?.cls">{{ SITUACOES[s.status]?.rotulo ?? s.status }}</span>
                  <span class="tabular-nums whitespace-nowrap">pedido {{ fmtDiaHora(s.solicitado_em) }}</span>
                  <span v-if="s.status === 'solicitado'" class="lg:hidden tabular-nums whitespace-nowrap" :class="prazoVencido(s) ? 'text-red-600 dark:text-red-400' : ''">
                    <i v-if="prazoVencido(s)" class="fa-solid fa-triangle-exclamation text-[9px] mr-0.5" aria-hidden="true" />prazo até {{ fmtDiaHora(s.prazo_em) }}
                  </span>
                </div>
              </div>

              <div class="hidden xl:block w-28 shrink-0 text-sm tabular-nums text-slate-600 dark:text-slate-400">{{ fmtDiaHora(s.solicitado_em) }}</div>

              <div class="hidden lg:block w-32 shrink-0 text-sm tabular-nums">
                <span v-if="s.status === 'solicitado'" :class="prazoVencido(s) ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'">
                  <i v-if="prazoVencido(s)" class="fa-solid fa-triangle-exclamation text-[10px] mr-1" aria-hidden="true" />até {{ fmtDiaHora(s.prazo_em) }}
                </span>
                <span v-else class="text-slate-400 dark:text-slate-500">até {{ fmtDiaHora(s.prazo_em) }}</span>
              </div>

              <div class="w-24 sm:w-28 shrink-0 text-right text-sm font-medium tabular-nums text-slate-900 dark:text-white">{{ fmtBRL(s.valor) }}</div>

              <div class="hidden lg:block w-24 shrink-0">
                <span class="inline-flex px-2 py-0.5 rounded-full text-[11px] whitespace-nowrap" :class="SITUACOES[s.status]?.cls">{{ SITUACOES[s.status]?.rotulo ?? s.status }}</span>
              </div>

              <button
                v-if="s.status === 'solicitado'"
                type="button"
                class="hidden xl:inline-flex w-[5.5rem] shrink-0 items-center justify-center gap-1.5 h-8 rounded-md text-xs font-normal bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                title="Marcar como pago"
                @click.stop="abrirPagar(s)"
              >
                <i class="fa-solid fa-check text-[10px]" aria-hidden="true" />
                Pagar
              </button>
              <span v-else class="hidden xl:block w-[5.5rem] shrink-0" aria-hidden="true" />

              <button
                type="button"
                class="size-8 shrink-0 rounded-md flex items-center justify-center text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                :aria-expanded="abertos.has(s.id)"
                :aria-label="abertos.has(s.id) ? 'Recolher saque' : 'Ver detalhes do saque'"
                @click.stop="alternar(s.id)"
              >
                <i class="fa-solid fa-chevron-down text-xs transition-transform duration-200" :class="{ 'rotate-180': abertos.has(s.id) }" aria-hidden="true" />
              </button>
            </div>

            <!-- Linha aberta -->
            <div v-if="abertos.has(s.id)" class="border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 px-3 sm:px-4 py-4">
              <dl class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div class="min-w-0">
                  <dt :class="rotuloCampo">Chave PIX ({{ rotuloTipoChave(s.chave_pix_tipo) }})</dt>
                  <dd class="flex items-center gap-1.5 min-w-0">
                    <span class="text-sm tabular-nums text-slate-800 dark:text-slate-200 break-all min-w-0">{{ chaveFormatada(s) }}</span>
                    <button
                      type="button"
                      class="shrink-0 size-7 rounded flex items-center justify-center transition-colors"
                      :class="copiado === s.id ? 'text-emerald-500' : 'text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-white/5'"
                      :title="copiado === s.id ? 'Copiada' : 'Copiar chave PIX'"
                      aria-label="Copiar chave PIX"
                      @click="copiarChave(s)"
                    >
                      <i class="fa-solid text-[11px]" :class="copiado === s.id ? 'fa-check' : 'fa-copy'" aria-hidden="true" />
                    </button>
                  </dd>
                </div>
                <div class="min-w-0">
                  <dt :class="rotuloCampo">Titular informado</dt>
                  <dd class="text-sm text-slate-800 dark:text-slate-200 break-words">{{ s.titular_nome }}</dd>
                  <dd class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    <span><span class="text-[10px] uppercase text-slate-400 mr-1">{{ tipoDocumento(s.titular_documento) }}</span>{{ formatarDocumento(s.titular_documento) }}</span>
                    <button
                      v-if="s.titular_documento"
                      type="button"
                      class="shrink-0 size-6 rounded flex items-center justify-center transition-colors"
                      :class="copiado === `${s.id}:doc` ? 'text-emerald-500' : 'text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-white/5'"
                      :title="copiado === `${s.id}:doc` ? 'Copiado' : 'Copiar CPF/CNPJ'"
                      aria-label="Copiar CPF/CNPJ"
                      @click="copiarDocumento(s)"
                    >
                      <i class="fa-solid text-[10px]" :class="copiado === `${s.id}:doc` ? 'fa-check' : 'fa-copy'" aria-hidden="true" />
                    </button>
                  </dd>
                </div>
                <div class="min-w-0">
                  <dt :class="rotuloCampo">Pedido em</dt>
                  <dd class="text-sm tabular-nums text-slate-800 dark:text-slate-200">{{ fmtDiaHora(s.solicitado_em) }}</dd>
                  <dt :class="[rotuloCampo, 'mt-2']">Prazo do PIX</dt>
                  <dd class="text-sm tabular-nums" :class="prazoVencido(s) ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'">
                    <i v-if="prazoVencido(s)" class="fa-solid fa-triangle-exclamation text-[10px] mr-1" aria-hidden="true" />até {{ fmtDiaHora(s.prazo_em) }}
                  </dd>
                </div>
                <div class="min-w-0">
                  <dt :class="rotuloCampo">Situação</dt>
                  <dd class="mt-0.5">
                    <span class="inline-flex px-2 py-0.5 rounded-full text-[11px] whitespace-nowrap" :class="SITUACOES[s.status]?.cls">{{ SITUACOES[s.status]?.rotulo ?? s.status }}</span>
                  </dd>
                  <dd v-if="s.status === 'pago' && s.pago_em" class="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">Pago em {{ fmtDiaHora(s.pago_em) }}</dd>
                  <dd v-if="s.status === 'pago' && s.comprovante" class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-all">Comprovante: {{ s.comprovante }}</dd>
                  <dd v-if="s.status === 'recusado' && s.recusa_motivo" class="text-xs text-slate-600 dark:text-slate-300 mt-1 break-words whitespace-pre-line">Motivo: {{ s.recusa_motivo }}</dd>
                </div>
              </dl>

              <!-- Contato do afiliado (para tirar dúvida sobre a chave antes de pagar) -->
              <p
                v-if="s.afiliado_codigo || s.afiliado_telefone"
                class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400"
              >
                <span v-if="s.afiliado_codigo">Código <span class="text-slate-700 dark:text-slate-300 tabular-nums">{{ s.afiliado_codigo }}</span></span>
                <a
                  v-if="s.afiliado_telefone && whatsappLink(s.afiliado_telefone)"
                  :href="whatsappLink(s.afiliado_telefone) || undefined"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline tabular-nums"
                  title="Abrir conversa com o afiliado no WhatsApp"
                >
                  <i class="fa-brands fa-whatsapp" aria-hidden="true" />
                  {{ formatPhoneSemDdiBrasil(s.afiliado_telefone) || s.afiliado_telefone }}
                </a>
              </p>

              <div v-if="s.status === 'solicitado'" class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-sm font-normal bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                  @click="abrirPagar(s)"
                >
                  <i class="fa-solid fa-check text-xs" aria-hidden="true" />
                  Marcar como pago
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-sm font-normal border border-red-200 dark:border-red-500/25 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  @click="abrirRecusar(s)"
                >
                  <i class="fa-solid fa-xmark text-xs" aria-hidden="true" />
                  Recusar
                </button>
              </div>

              <!-- Pago: ver, anexar ou trocar o arquivo do comprovante -->
              <div v-if="s.status === 'pago'" class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
                <template v-if="s.comprovante_url">
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-sm font-normal border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 hover:border-purple-300 dark:hover:border-purple-500/40 transition-colors"
                    @click="verComprovante(s)"
                  >
                    <i class="fa-solid fa-file-invoice text-xs" aria-hidden="true" />
                    Ver comprovante
                  </button>
                  <button
                    type="button"
                    :disabled="baixandoId === s.id"
                    class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-sm font-normal border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 hover:border-purple-300 dark:hover:border-purple-500/40 disabled:opacity-60 transition-colors"
                    @click="baixarComprovante(s)"
                  >
                    <i class="fa-solid text-xs" :class="baixandoId === s.id ? 'fa-circle-notch animate-spin' : 'fa-download'" aria-hidden="true" />
                    {{ baixandoId === s.id ? 'Baixando…' : 'Baixar' }}
                  </button>
                  <button
                    type="button"
                    :disabled="!!anexandoId"
                    class="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-md text-xs font-normal text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 disabled:opacity-50 transition-colors"
                    @click="escolherAnexoDepois(s)"
                  >
                    <i class="fa-solid text-[10px]" :class="anexandoId === s.id ? 'fa-circle-notch animate-spin' : 'fa-arrows-rotate'" aria-hidden="true" />
                    {{ anexandoId === s.id ? `Enviando… ${progressoDepois}%` : 'Trocar arquivo' }}
                  </button>
                </template>
                <template v-else>
                  <button
                    type="button"
                    :disabled="!!anexandoId"
                    class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-sm font-normal border border-purple-200 dark:border-purple-500/25 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-500/10 disabled:opacity-50 transition-colors"
                    @click="escolherAnexoDepois(s)"
                  >
                    <i class="fa-solid text-xs" :class="anexandoId === s.id ? 'fa-circle-notch animate-spin' : 'fa-paperclip'" aria-hidden="true" />
                    {{ anexandoId === s.id ? `Enviando… ${progressoDepois}%` : 'Anexar comprovante' }}
                  </button>
                  <span class="text-[11px] text-slate-400 dark:text-slate-500">Imagem ou PDF até 4 MB</span>
                </template>
              </div>
            </div>
          </li>
        </ul>
        <input ref="inputAnexoDepois" type="file" class="hidden" :accept="ACEITA" @change="aoEscolherDepois">
        <p v-if="truncado" class="px-4 py-3 text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800">
          Mostrando os 500 mais recentes.
        </p>
      </template>
    </div>

    <!-- ═════════ Modal: marcar como pago ═════════ -->
    <BaseModal :show="!!alvoPagar" title="Marcar saque como pago" max-width="max-w-lg" @close="fecharPagar">
      <!-- dragover/drop no form: soltar o arquivo fora da área não abre ele na aba -->
      <form v-if="alvoPagar" class="space-y-4" @submit.prevent="confirmarPagamento" @dragover.prevent @drop.prevent>
        <div class="rounded-md border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/5">
          <div class="px-4 py-3 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-[11px] text-slate-500 dark:text-slate-400">Afiliado</p>
              <p class="text-sm text-slate-900 dark:text-white truncate">{{ alvoPagar.afiliado_nome || 'Afiliado removido' }}</p>
              <p class="text-xs text-slate-500 dark:text-slate-400 truncate">{{ alvoPagar.afiliado_email }}</p>
            </div>
            <div class="text-right shrink-0">
              <p class="text-[11px] text-slate-500 dark:text-slate-400">Valor</p>
              <p class="text-xl font-medium text-slate-900 dark:text-white tabular-nums">{{ fmtBRL(alvoPagar.valor) }}</p>
            </div>
          </div>
          <div class="px-4 py-3 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-[11px] text-slate-500 dark:text-slate-400">Chave PIX ({{ rotuloTipoChave(alvoPagar.chave_pix_tipo) }})</p>
              <p class="text-sm text-slate-900 dark:text-white tabular-nums break-all">{{ chaveFormatada(alvoPagar) }}</p>
            </div>
            <button
              type="button"
              class="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-normal border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
              @click="copiarChave(alvoPagar)"
            >
              <i class="fa-solid text-[10px]" :class="copiado === alvoPagar.id ? 'fa-check text-emerald-500' : 'fa-copy'" aria-hidden="true" />
              {{ copiado === alvoPagar.id ? 'Copiada' : 'Copiar' }}
            </button>
          </div>
          <div class="px-4 py-3">
            <p class="text-[11px] text-slate-500 dark:text-slate-400">Titular informado pelo afiliado</p>
            <p class="text-sm text-slate-900 dark:text-white">{{ alvoPagar.titular_nome }}</p>
            <p class="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{{ tipoDocumento(alvoPagar.titular_documento) }} {{ formatarDocumento(alvoPagar.titular_documento) }}</p>
          </div>
        </div>

        <div class="rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-3.5 py-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
          <p class="flex items-start gap-1.5">
            <i class="fa-solid fa-triangle-exclamation text-[10px] mt-0.5" aria-hidden="true" />
            <span>Confira se o nome do titular que o banco mostra é o do afiliado.</span>
          </p>
          <p class="pl-4">Se o banco mostrar outro nome, não pague: recuse o saque e explique o motivo para ele corrigir a chave.</p>
        </div>

        <!-- Arquivo do comprovante: sobe na hora, a URL vai no "Confirmar pagamento" -->
        <div>
          <p class="text-sm text-slate-700 dark:text-slate-300 mb-1.5">
            Anexar comprovante <span class="text-slate-400">(imagem ou PDF, opcional)</span>
          </p>
          <input ref="inputAnexo" type="file" class="hidden" :accept="ACEITA" @change="aoEscolherNoModal">

          <button
            v-if="!anexo"
            type="button"
            :disabled="pagando || enviandoAnexo"
            class="w-full flex flex-col items-center justify-center gap-1 px-4 py-5 rounded-md border-2 border-dashed text-center transition-colors disabled:opacity-60 *:pointer-events-none"
            :class="arrastando
              ? 'border-purple-400 dark:border-purple-500/60 bg-purple-50 dark:bg-purple-500/10'
              : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-white/[0.02] hover:border-purple-300 dark:hover:border-purple-500/40'"
            @click="inputAnexo?.click()"
            @dragenter.prevent="arrastando = true"
            @dragover.prevent="arrastando = true"
            @dragleave.prevent="arrastando = false"
            @drop.prevent="aoSoltarNoModal"
          >
            <i
              class="fa-solid text-lg"
              :class="enviandoAnexo ? 'fa-circle-notch animate-spin text-purple-500' : 'fa-cloud-arrow-up text-slate-400 dark:text-slate-500'"
              aria-hidden="true"
            />
            <span v-if="enviandoAnexo" class="text-sm text-slate-600 dark:text-slate-300">Preparando o arquivo…</span>
            <span v-else class="text-sm text-slate-700 dark:text-slate-300">
              Arraste o arquivo aqui ou <span class="text-purple-600 dark:text-purple-400">escolha no computador</span>
            </span>
            <span class="text-[11px] text-slate-400 dark:text-slate-500">JPG, PNG, WEBP ou PDF até 4 MB. Imagens são reduzidas antes de enviar.</span>
          </button>

          <div v-else class="flex items-center gap-3 p-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <button
              v-if="anexo.previa"
              type="button"
              class="shrink-0 rounded"
              title="Ver o comprovante"
              aria-label="Ver o comprovante"
              @click="verAnexoLocal"
            >
              <img :src="anexo.previa" alt="Prévia do comprovante" class="size-14 rounded object-cover border border-slate-200 dark:border-slate-700">
            </button>
            <button
              v-else
              type="button"
              class="size-14 shrink-0 rounded flex items-center justify-center bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400"
              title="Ver o comprovante"
              aria-label="Ver o comprovante"
              @click="verAnexoLocal"
            >
              <i class="fa-solid fa-file-pdf text-xl" aria-hidden="true" />
            </button>

            <div class="min-w-0 flex-1">
              <p class="text-sm text-slate-800 dark:text-slate-200 truncate" :title="anexo.nome">{{ anexo.nome }}</p>
              <template v-if="enviandoAnexo">
                <p class="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">Enviando… {{ progressoAnexo }}%</p>
                <div class="mt-1 h-1 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                  <div class="h-full bg-purple-500 transition-all duration-200" :style="{ width: `${progressoAnexo}%` }" />
                </div>
              </template>
              <p v-else class="text-[11px] text-emerald-600 dark:text-emerald-400 tabular-nums">
                <i class="fa-solid fa-check text-[9px] mr-0.5" aria-hidden="true" />Enviado · {{ fmtTamanho(anexo.tamanho) }}
                <button
                  type="button"
                  class="ml-1 text-purple-600 dark:text-purple-400 hover:underline"
                  @click="verAnexoLocal"
                >ver</button>
              </p>
            </div>

            <button
              type="button"
              :disabled="pagando"
              class="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-normal border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-500/30 disabled:opacity-50 transition-colors"
              @click="limparAnexo"
            >
              <i class="fa-solid fa-trash-can text-[10px]" aria-hidden="true" />
              Remover
            </button>
          </div>
          <p v-if="erroAnexo" class="mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
            <i class="fa-solid fa-circle-exclamation text-[10px] mt-0.5" aria-hidden="true" />
            <span>{{ erroAnexo }}</span>
          </p>
        </div>

        <div>
          <label for="saque-comprovante" class="block text-sm text-slate-700 dark:text-slate-300 mb-1.5">
            Comprovante / ID do PIX <span class="text-slate-400">(opcional)</span>
          </label>
          <input
            id="saque-comprovante"
            v-model="comprovante"
            type="text"
            maxlength="300"
            placeholder="Ex.: E12345678202610091200abcdef123456"
            :class="inputBase"
          >
        </div>

        <div class="flex gap-2 pt-1">
          <button
            type="button"
            :disabled="pagando"
            class="flex-1 px-4 py-2.5 rounded text-sm font-normal border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            @click="fecharPagar"
          >
            Cancelar
          </button>
          <button
            type="submit"
            :disabled="pagando || enviandoAnexo"
            class="flex-1 px-4 py-2.5 rounded text-sm font-normal bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white transition-colors flex items-center justify-center gap-2"
          >
            <i v-if="pagando || enviandoAnexo" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
            {{ pagando ? 'Salvando…' : enviandoAnexo ? 'Enviando arquivo…' : 'Confirmar pagamento' }}
          </button>
        </div>
      </form>
    </BaseModal>

    <!-- ═════════ Modal: recusar ═════════ -->
    <BaseModal :show="!!alvoRecusar" title="Recusar saque" max-width="max-w-lg" @close="fecharRecusar">
      <form v-if="alvoRecusar" class="space-y-4" @submit.prevent="confirmarRecusa">
        <p class="text-sm text-slate-600 dark:text-slate-400">
          Recusar o saque de <span class="text-slate-900 dark:text-white tabular-nums">{{ fmtBRL(alvoRecusar.valor) }}</span>
          pedido por <span class="font-medium text-slate-900 dark:text-white">{{ alvoRecusar.afiliado_nome || 'afiliado removido' }}</span>?
        </p>
        <p class="text-xs text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
          <i class="fa-solid fa-circle-info text-[10px] mt-0.5" aria-hidden="true" />
          <span>O valor volta para o disponível do afiliado, e ele pode pedir de novo (por exemplo, com a chave PIX corrigida).</span>
        </p>
        <div>
          <label for="saque-motivo-recusa" class="block text-sm text-slate-700 dark:text-slate-300 mb-1.5">Motivo da recusa</label>
          <textarea
            id="saque-motivo-recusa"
            v-model="motivoRecusa"
            rows="3"
            maxlength="500"
            required
            placeholder="Ex.: a chave PIX está no nome de outra pessoa"
            :class="[inputBase, 'resize-none']"
          />
          <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Obrigatório. Escreva de um jeito que o afiliado entenda o que corrigir.</p>
        </div>
        <div class="flex gap-2 pt-1">
          <button
            type="button"
            :disabled="recusando"
            class="flex-1 px-4 py-2.5 rounded text-sm font-normal border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            @click="fecharRecusar"
          >
            Cancelar
          </button>
          <button
            type="submit"
            :disabled="recusando || motivoRecusa.trim().length < 3"
            class="flex-1 px-4 py-2.5 rounded text-sm font-normal bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white transition-colors flex items-center justify-center gap-2"
          >
            <i v-if="recusando" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
            {{ recusando ? 'Salvando…' : 'Recusar saque' }}
          </button>
        </div>
      </form>
    </BaseModal>

    <!-- ═════════ Modal: ver comprovante (fica por cima do modal de pagar) ═════════ -->
    <ComprovanteSaqueModal
      :show="!!visualizador"
      :rota="ROTA_COMPROVANTE"
      :saque-id="visualizador?.saqueId ?? null"
      :arquivo="visualizador?.arquivo ?? null"
      :subtitulo="visualizador?.subtitulo ?? null"
      @close="visualizador = null"
    />
  </div>
</template>
