<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { formatarDocumento } from '~~/shared/utils/documento'
import {
  ROTULO_TIPO_CHAVE_PIX,
  abrirLinkNoClique,
  erroAfiliado,
  formatarChavePix,
  idCurtoSaque,
  linkAvisoSaqueWhatsApp,
} from '~/composables/useAfiliado'
import type { DadosAvisoSaque } from '~/composables/useAfiliado'
import ComprovanteSaqueModal, { baixarComprovante as baixarArquivoComprovante, mensagemErroComprovante } from '~/components/shared/ComprovanteSaqueModal.vue'

definePageMeta({
  middleware: ['auth', 'afiliado'],
  layout: 'afiliado',
})

useHead({ title: 'Ganhos e saque · Portal do Afiliado' })

/**
 * Ganhos e saque: extrato das comissões, saldo por situação e o pedido de
 * saque por PIX (cai em até 48 horas na chave do próprio afiliado).
 */
type StatusComissao = 'retido' | 'disponivel' | 'em_saque' | 'sacado' | 'cancelado' | 'estornado'

interface Comissao {
  id: string
  cliente: string
  conexao: number
  tipo: 'primeira' | 'recorrente'
  percentual: number
  valor_base: number
  valor: number
  meses: number
  origem_pagamento: 'stripe_invoice' | 'pix_admin'
  status: StatusComissao
  liberar_em: string
  liberado_em: string | null
  motivo_estorno: string | null
  created_at: string
}

interface Saque {
  id: string
  valor: number
  chave_pix: string
  chave_pix_tipo: string | null
  titular_nome?: string | null
  titular_documento?: string | null
  status: 'solicitado' | 'pago' | 'recusado'
  solicitado_em: string
  prazo_em: string
  pago_em: string | null
  comprovante: string | null
  /** Arquivo do PIX (imagem ou PDF) anexado pela Agzap; só vem em saque pago. */
  comprovante_url?: string | null
  recusa_motivo: string | null
}

interface Ganhos {
  comissoes: Comissao[]
  saques: Saque[]
  config: { saque_minimo: number; prazo_saque_horas: number }
  recebimento: {
    completo: boolean
    faltando: string[]
    nome: string
    documento: string | null
    chave_pix: string | null
    chave_pix_tipo: string | null
  }
  afiliado?: DadosAvisoSaque['afiliado']
  saque_aberto: boolean
  totais: { retido: number; disponivel: number; em_saque: number; sacado: number }
}

const toast = useToast()
const dados = ref<Ganhos | null>(null)
const carregando = ref(true)
const erro = ref<string | null>(null)

async function carregar() {
  carregando.value = true
  erro.value = null
  try {
    const resp = await $fetch<{ success: boolean; data?: Ganhos; error?: string }>('/api/afiliado/ganhos', {
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Não foi possível carregar seus ganhos.')
    dados.value = resp.data
  }
  catch (e: any) {
    // Servidor fora (500/503): mensagem legível em vez de "Server Error".
    const status = Number(e?.statusCode ?? e?.status ?? 0)
    erro.value = status >= 500
      ? 'Não foi possível carregar seus ganhos agora. Tente de novo em instantes.'
      : erroAfiliado(e, 'Não foi possível carregar seus ganhos.')
  }
  finally {
    carregando.value = false
  }
}

onMounted(carregar)

const totais = computed(() => dados.value?.totais ?? { retido: 0, disponivel: 0, em_saque: 0, sacado: 0 })
const prazoHoras = computed(() => dados.value?.config.prazo_saque_horas ?? 48)
const recebimento = computed(() => dados.value?.recebimento ?? null)

// ───────── Saque ─────────
/** Por que o botão está desligado (null = pode sacar). */
const bloqueioSaque = computed<null | { texto: string; link?: boolean }>(() => {
  const d = dados.value
  if (!d) return { texto: 'Carregando…' }
  if (d.saque_aberto) return { texto: 'Você já tem um saque aguardando pagamento. Um novo pedido só depois que ele for pago ou recusado.' }
  if (!d.recebimento.completo) return { texto: 'Complete seus dados para receber antes de sacar.', link: true }
  if (d.totais.disponivel <= 0) {
    return d.totais.retido > 0
      ? { texto: `Nada disponível agora. ${fmtBRL(d.totais.retido)} ainda está retido e fica disponível no fim da retenção.` }
      : { texto: 'Nada disponível para saque agora.' }
  }
  if (d.totais.disponivel < d.config.saque_minimo) return { texto: `O saque mínimo é de ${fmtBRL(d.config.saque_minimo)}.` }
  return null
})

/** O saque que está aguardando pagamento (no máximo um por afiliado). */
const saqueAberto = computed(() => dados.value?.saques.find(s => s.status === 'solicitado') ?? null)

const mostrarConfirmacao = ref(false)
const enviandoSaque = ref(false)

function abrirConfirmacao() {
  if (bloqueioSaque.value || enviandoSaque.value) return
  mostrarConfirmacao.value = true
}

// Pedido enviado: modal de confirmação com o aviso opcional pelo WhatsApp.
const saqueEnviado = ref<DadosAvisoSaque | null>(null)
const linkSaqueEnviado = computed(() => (saqueEnviado.value ? linkAvisoSaqueWhatsApp(saqueEnviado.value) : '#'))

type RespostaSaque = {
  success: boolean
  error?: string
  data?: DadosAvisoSaque['saque'] & { afiliado: DadosAvisoSaque['afiliado'] }
}

async function confirmarSaque() {
  if (enviandoSaque.value) return
  enviandoSaque.value = true
  try {
    const resp = await $fetch<RespostaSaque>('/api/afiliado/saque', {
      method: 'POST',
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success || !resp.data) {
      toast.error(resp.error || 'Não foi possível pedir o saque.')
      mostrarConfirmacao.value = false
      await carregar()
      return
    }
    const { afiliado, ...saque } = resp.data
    mostrarConfirmacao.value = false
    saqueEnviado.value = { saque, afiliado }
    await carregar()
  }
  catch (e: any) {
    toast.error(erroAfiliado(e, 'Não foi possível pedir o saque.'))
    mostrarConfirmacao.value = false
    await carregar()
  }
  finally {
    enviandoSaque.value = false
  }
}

function avisoAberto() {
  toast.success('Abrimos o WhatsApp com o seu pedido. É só enviar a mensagem.')
}

function enviarPeloWhatsApp(evento: MouseEvent) {
  if (!saqueEnviado.value) return
  abrirLinkNoClique(evento, linkSaqueEnviado.value)
  // Fecha depois do clique terminar: se o window.open foi barrado, o próprio
  // <a> ainda precisa existir (com o href) para abrir a conversa.
  setTimeout(() => { saqueEnviado.value = null }, 0)
  avisoAberto()
}

// Para quem disse "Agora não" e mudou de ideia: o mesmo aviso, do saque aberto.
const linkSaqueAberto = computed(() => {
  const s = saqueAberto.value
  const a = dados.value?.afiliado
  if (!s || !a) return null
  return linkAvisoSaqueWhatsApp({ saque: s, afiliado: a })
})

function avisarSaqueAberto(evento: MouseEvent) {
  if (!linkSaqueAberto.value) return
  abrirLinkNoClique(evento, linkSaqueAberto.value)
  avisoAberto()
}

// ───────── Extrato ─────────
const PAGINA = 50
const limiteExtrato = ref(PAGINA)
const comissoes = computed(() => dados.value?.comissoes ?? [])
const extratoVisivel = computed(() => comissoes.value.slice(0, limiteExtrato.value))
const saques = computed(() => dados.value?.saques ?? [])

// ───────── Formatação ─────────
const TZ = 'America/Sao_Paulo'
function fmtBRL(v: number | null | undefined) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)
}
function fmtPct(v: number | null | undefined) {
  return `${(v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
}
function fmtData(s: string | null | undefined) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ })
}
function fmtDiaMes(s: string | null | undefined) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: TZ })
}
function fmtDiaMesHora(s: string | null | undefined) {
  if (!s) return '—'
  const d = new Date(s)
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
  return `${fmtDiaMes(s)} ${hora}`
}

function rotuloTipo(c: Comissao) {
  const base = c.tipo === 'primeira' ? '1º pagamento' : 'recorrente'
  if (c.meses > 1) return `${base} · ${c.meses === 12 ? 'ano inteiro' : `${c.meses} meses`}`
  return base
}

const STATUS_COMISSAO: Record<StatusComissao, { label: string; cls: string }> = {
  retido: { label: 'Retido', cls: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20' },
  disponivel: { label: 'Disponível', cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' },
  em_saque: { label: 'Em saque', cls: 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-500/20' },
  sacado: { label: 'Sacado', cls: 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/20' },
  cancelado: { label: 'Cancelado', cls: 'bg-slate-200 dark:bg-slate-500/20 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600' },
  estornado: { label: 'Estornado', cls: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20' },
}

function rotuloStatus(c: Comissao) {
  if (c.status === 'retido') return `Retido até ${fmtDiaMes(c.liberar_em)}`
  return STATUS_COMISSAO[c.status]?.label ?? c.status
}

const STATUS_SAQUE: Record<Saque['status'], string> = {
  solicitado: 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-500/20',
  pago: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
  recusado: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20',
}

function rotuloSaque(s: Saque) {
  if (s.status === 'solicitado') return `Aguardando pagamento · até ${fmtDiaMesHora(s.prazo_em)}`
  if (s.status === 'pago') return `Pago em ${fmtDiaMes(s.pago_em)}`
  return `Recusado${s.recusa_motivo ? `: ${s.recusa_motivo}` : ''}`
}

function ehLink(s: string | null) {
  return !!s && /^https?:\/\//i.test(s.trim())
}

// Comprovante do PIX: ver dentro da página e baixar direto, sempre pela rota
// com login (o arquivo fica no R2, outra origem; nada de abrir aba).
const ROTA_COMPROVANTE = '/api/afiliado/saque-comprovante'

const baixandoId = ref<string | null>(null)
async function baixarComprovante(s: Saque) {
  if (baixandoId.value) return
  baixandoId.value = s.id
  try {
    await baixarArquivoComprovante(ROTA_COMPROVANTE, s.id)
  }
  catch (e: any) {
    toast.error(mensagemErroComprovante(e))
  }
  finally {
    baixandoId.value = null
  }
}

const visualizando = ref<{ saqueId: string; subtitulo: string } | null>(null)
function verComprovante(s: Saque) {
  visualizando.value = { saqueId: s.id, subtitulo: `${fmtBRL(s.valor)} · pago em ${fmtDiaMes(s.pago_em)}` }
}

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <div class="p-4 sm:p-6 md:p-8 space-y-6 w-full">

    <!-- Cabeçalho -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Ganhos e saque</h1>
        <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
          Cada pagamento da sua rede gera uma comissão. Depois da retenção ela fica disponível e você saca por PIX quando quiser.
        </p>
      </div>
      <button
        type="button"
        :disabled="carregando"
        class="inline-flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 hover:border-purple-300 dark:hover:border-purple-500/40 disabled:opacity-50 text-slate-700 dark:text-slate-200 rounded text-sm font-normal transition-colors"
        @click="carregar"
      >
        <i class="fa-solid fa-arrows-rotate text-sm" :class="{ 'animate-spin': carregando }" aria-hidden="true" />
        <span class="hidden sm:inline">Atualizar</span>
      </button>
    </div>

    <div v-if="erro" class="p-4 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
      <span class="min-w-0 flex-1">{{ erro }}</span>
      <button type="button" :disabled="carregando" class="shrink-0 text-xs underline disabled:opacity-50" @click="carregar">Tentar de novo</button>
    </div>

    <!-- Saldos -->
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <div :class="[cardBase, 'p-4 min-w-0']">
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <span class="text-[11px] uppercase tracking-wider text-amber-600 dark:text-amber-400 truncate">Retido</span>
          <i class="fa-solid fa-hourglass-half text-amber-500 text-xs shrink-0" aria-hidden="true" />
        </div>
        <p class="text-2xl font-medium tabular-nums text-slate-900 dark:text-white leading-tight">
          <span v-if="carregando && !dados" class="inline-block h-7 w-24 rounded bg-slate-100 dark:bg-white/10 animate-pulse align-middle" />
          <template v-else>{{ fmtBRL(totais.retido) }}</template>
        </p>
        <p class="text-[11px] text-slate-400 dark:text-slate-500 truncate">7 dias no PIX, 15 no cartão</p>
      </div>

      <div :class="[cardBase, 'p-4 min-w-0']">
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <span class="text-[11px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 truncate">Disponível para saque</span>
          <i class="fa-solid fa-wallet text-emerald-500 text-xs shrink-0" aria-hidden="true" />
        </div>
        <p class="text-2xl font-medium tabular-nums text-slate-900 dark:text-white leading-tight">
          <span v-if="carregando && !dados" class="inline-block h-7 w-24 rounded bg-slate-100 dark:bg-white/10 animate-pulse align-middle" />
          <template v-else>{{ fmtBRL(totais.disponivel) }}</template>
        </p>
        <p class="text-[11px] text-slate-400 dark:text-slate-500 truncate">
          {{ totais.disponivel > 0 ? 'pode sacar agora' : saqueAberto ? 'foi tudo para o saque pedido' : 'nada liberado ainda' }}
        </p>
      </div>

      <div :class="[cardBase, 'p-4 min-w-0']">
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <span class="text-[11px] uppercase tracking-wider text-sky-600 dark:text-sky-400 truncate">Em saque</span>
          <i class="fa-solid fa-money-bill-transfer text-sky-500 text-xs shrink-0" aria-hidden="true" />
        </div>
        <p class="text-2xl font-medium tabular-nums text-slate-900 dark:text-white leading-tight">
          <span v-if="carregando && !dados" class="inline-block h-7 w-24 rounded bg-slate-100 dark:bg-white/10 animate-pulse align-middle" />
          <template v-else>{{ fmtBRL(totais.em_saque) }}</template>
        </p>
        <p v-if="saqueAberto" class="text-[11px] text-sky-600 dark:text-sky-400 truncate">aguardando pagamento · pedido {{ fmtDiaMesHora(saqueAberto.solicitado_em) }}</p>
        <p v-else class="text-[11px] text-slate-400 dark:text-slate-500 truncate">PIX em até {{ prazoHoras }} horas</p>
      </div>

      <div :class="[cardBase, 'p-4 min-w-0']">
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <span class="text-[11px] uppercase tracking-wider text-purple-600 dark:text-purple-300 truncate">Sacado</span>
          <i class="fa-solid fa-circle-check text-purple-500 text-xs shrink-0" aria-hidden="true" />
        </div>
        <p class="text-2xl font-medium tabular-nums text-slate-900 dark:text-white leading-tight">
          <span v-if="carregando && !dados" class="inline-block h-7 w-24 rounded bg-slate-100 dark:bg-white/10 animate-pulse align-middle" />
          <template v-else>{{ fmtBRL(totais.sacado) }}</template>
        </p>
        <p class="text-[11px] text-slate-400 dark:text-slate-500 truncate">já caiu na sua conta</p>
      </div>
    </div>

    <!-- Pedir saque -->
    <div :class="[cardBase, 'p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-4']">
      <div class="flex items-start gap-3 min-w-0 flex-1">
        <span class="w-10 h-10 rounded bg-purple-600 text-white flex items-center justify-center shrink-0">
          <i class="fa-solid fa-money-bill-transfer" aria-hidden="true" />
        </span>
        <div class="min-w-0">
          <p class="text-sm text-slate-900 dark:text-white">Saque por PIX</p>
          <p v-if="recebimento?.completo" class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-all">
            Vai para a chave {{ ROTULO_TIPO_CHAVE_PIX[recebimento.chave_pix_tipo ?? ''] ?? '' }}
            <span class="text-slate-700 dark:text-slate-200">{{ formatarChavePix(recebimento.chave_pix, recebimento.chave_pix_tipo) }}</span>,
            em nome de {{ recebimento.nome }}. Cai em até {{ prazoHoras }} horas.
          </p>
          <p v-else-if="dados" class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            O PIX cai em até {{ prazoHoras }} horas, na sua chave.
          </p>
          <!-- Saque aguardando pagamento -->
          <div
            v-if="saqueAberto"
            class="mt-2.5 rounded-md border border-sky-200 dark:border-sky-500/20 bg-sky-50 dark:bg-sky-500/10 px-3 py-2.5 text-xs text-sky-800 dark:text-sky-200 space-y-0.5"
          >
            <p class="flex items-start gap-1.5">
              <i class="fa-solid fa-clock text-[10px] mt-0.5" aria-hidden="true" />
              <span>
                Saque de <span class="tabular-nums text-sky-950 dark:text-white">{{ fmtBRL(saqueAberto.valor) }}</span>
                pedido em <span class="tabular-nums">{{ fmtDiaMesHora(saqueAberto.solicitado_em) }}</span>
              </span>
            </p>
            <p class="pl-4">
              Aguardando pagamento (até {{ prazoHoras }} h) · cai até <span class="tabular-nums">{{ fmtDiaMesHora(saqueAberto.prazo_em) }}</span>
              <span class="text-sky-600/80 dark:text-sky-300/70"> · pedido #{{ idCurtoSaque(saqueAberto.id) }}</span>
            </p>
            <p class="pl-4 text-sky-700/80 dark:text-sky-300/70">Um novo saque só depois que este for pago ou recusado.</p>
            <a
              v-if="linkSaqueAberto"
              :href="linkSaqueAberto"
              target="_blank"
              rel="noopener noreferrer"
              class="ml-4 mt-1 inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 hover:underline"
              @click="avisarSaqueAberto"
            >
              <i class="fa-brands fa-whatsapp" aria-hidden="true" />
              Avisar a Agzap pelo WhatsApp
            </a>
          </div>
          <p v-else-if="bloqueioSaque && dados" class="text-xs mt-1.5 flex items-start gap-1.5" :class="bloqueioSaque.link ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'">
            <i class="fa-solid fa-circle-info text-[10px] mt-0.5" aria-hidden="true" />
            <span>
              {{ bloqueioSaque.texto }}
              <NuxtLink v-if="bloqueioSaque.link" to="/afiliado/dados" class="text-purple-600 dark:text-purple-400 hover:underline whitespace-nowrap">
                Dados para receber
              </NuxtLink>
            </span>
          </p>
        </div>
      </div>
      <button
        type="button"
        :disabled="!!bloqueioSaque || carregando || enviandoSaque"
        :title="bloqueioSaque?.texto"
        class="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm font-normal transition-colors shadow-lg shadow-purple-600/30 dark:shadow-purple-600/20 whitespace-nowrap"
        @click="abrirConfirmacao"
      >
        <i class="fa-solid text-xs" :class="saqueAberto ? 'fa-clock' : 'fa-arrow-up-from-bracket'" aria-hidden="true" />
        <template v-if="saqueAberto">Saque aguardando pagamento</template>
        <template v-else>Solicitar saque de {{ fmtBRL(totais.disponivel) }}</template>
      </button>
    </div>

    <!-- Saques -->
    <div v-if="saques.length" :class="['overflow-hidden', cardBase]">
      <div class="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-white/5">
        <h2 class="text-sm text-slate-900 dark:text-white">Seus saques</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-200 dark:border-white/5 bg-slate-50/60 dark:bg-white/[0.02]">
              <th class="text-left px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-normal text-slate-500 uppercase tracking-wider whitespace-nowrap">Pedido em</th>
              <th class="text-right px-3 sm:px-4 py-3 text-[11px] sm:text-xs font-normal text-slate-500 uppercase tracking-wider">Valor</th>
              <th class="hidden md:table-cell text-left px-4 py-3 text-xs font-normal text-slate-500 uppercase tracking-wider">Chave PIX</th>
              <th class="text-left px-3 sm:px-4 py-3 text-[11px] sm:text-xs font-normal text-slate-500 uppercase tracking-wider">Situação</th>
              <th class="hidden lg:table-cell text-left px-4 py-3 text-xs font-normal text-slate-500 uppercase tracking-wider">Comprovante</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-white/5">
            <tr v-for="s in saques" :key="s.id" class="hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors">
              <td class="px-3 sm:px-5 py-2.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap tabular-nums">{{ fmtDiaMesHora(s.solicitado_em) }}</td>
              <td class="px-3 sm:px-4 py-2.5 text-right text-sm tabular-nums text-slate-900 dark:text-white whitespace-nowrap">{{ fmtBRL(s.valor) }}</td>
              <td class="hidden md:table-cell px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                <span class="text-slate-400">{{ ROTULO_TIPO_CHAVE_PIX[s.chave_pix_tipo ?? ''] ?? '' }}</span>
                {{ formatarChavePix(s.chave_pix, s.chave_pix_tipo) }}
              </td>
              <td class="px-3 sm:px-4 py-2.5">
                <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs border" :class="STATUS_SAQUE[s.status]">
                  {{ rotuloSaque(s) }}
                </span>
                <!-- Celular: comprovante abaixo -->
                <div v-if="s.comprovante_url || s.comprovante" class="lg:hidden text-[11px] text-slate-500 mt-1 space-y-0.5">
                  <div v-if="s.comprovante_url" class="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <button type="button" class="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 hover:underline" @click="verComprovante(s)">
                      <i class="fa-solid fa-file-invoice text-[10px]" aria-hidden="true" />Ver comprovante
                    </button>
                    <button
                      type="button"
                      :disabled="baixandoId === s.id"
                      class="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 hover:underline disabled:opacity-60"
                      @click="baixarComprovante(s)"
                    >
                      <i class="fa-solid text-[10px]" :class="baixandoId === s.id ? 'fa-circle-notch animate-spin' : 'fa-download'" aria-hidden="true" />{{ baixandoId === s.id ? 'Baixando…' : 'Baixar' }}
                    </button>
                  </div>
                  <p v-if="s.comprovante" class="break-all">
                    <a v-if="ehLink(s.comprovante)" :href="s.comprovante.trim()" target="_blank" rel="noopener noreferrer" class="text-purple-600 dark:text-purple-400 hover:underline">{{ s.comprovante_url ? 'Abrir link do PIX' : 'Ver comprovante' }}</a>
                    <template v-else>{{ s.comprovante_url ? 'ID do PIX: ' : '' }}{{ s.comprovante }}</template>
                  </p>
                </div>
              </td>
              <td class="hidden lg:table-cell px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400 max-w-[320px]">
                <div v-if="s.comprovante_url || s.comprovante" class="space-y-0.5">
                  <div v-if="s.comprovante_url" class="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <button type="button" class="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 hover:underline" @click="verComprovante(s)">
                      <i class="fa-solid fa-file-invoice text-[10px]" aria-hidden="true" />Ver comprovante
                    </button>
                    <button
                      type="button"
                      :disabled="baixandoId === s.id"
                      class="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 hover:underline disabled:opacity-60"
                      @click="baixarComprovante(s)"
                    >
                      <i class="fa-solid text-[10px]" :class="baixandoId === s.id ? 'fa-circle-notch animate-spin' : 'fa-download'" aria-hidden="true" />{{ baixandoId === s.id ? 'Baixando…' : 'Baixar' }}
                    </button>
                  </div>
                  <p v-if="s.comprovante">
                    <a v-if="ehLink(s.comprovante)" :href="s.comprovante.trim()" target="_blank" rel="noopener noreferrer" class="text-purple-600 dark:text-purple-400 hover:underline">
                      <i class="fa-solid fa-arrow-up-right-from-square text-[10px] mr-1" aria-hidden="true" />{{ s.comprovante_url ? 'Abrir link do PIX' : 'Ver comprovante' }}
                    </a>
                    <span v-else class="break-words">{{ s.comprovante_url ? 'ID do PIX: ' : '' }}{{ s.comprovante }}</span>
                  </p>
                </div>
                <span v-else class="text-slate-400">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Extrato -->
    <div :class="['overflow-hidden', cardBase]">
      <div class="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-white/5 flex items-center justify-between gap-2">
        <h2 class="text-sm text-slate-900 dark:text-white">Extrato de comissões</h2>
        <span v-if="comissoes.length" class="text-xs text-slate-400 tabular-nums">{{ comissoes.length }} {{ comissoes.length === 1 ? 'lançamento' : 'lançamentos' }}</span>
      </div>

      <div v-if="carregando && !dados" class="p-5 space-y-3">
        <div v-for="i in 4" :key="i" class="h-4 bg-slate-100 dark:bg-white/5 rounded animate-pulse" :class="i % 2 ? 'w-3/4' : 'w-1/2'" />
      </div>

      <div v-else-if="!comissoes.length" class="px-5 py-12 text-center">
        <i class="fa-solid fa-receipt text-slate-300 dark:text-slate-700 text-3xl mb-2 block" aria-hidden="true" />
        <p class="text-slate-600 dark:text-slate-300 text-sm">Nenhuma comissão ainda</p>
        <p class="text-slate-400 dark:text-slate-500 text-xs mt-1">Quando alguém da sua rede pagar, a comissão aparece aqui.</p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-200 dark:border-white/5 bg-slate-50/60 dark:bg-white/[0.02]">
              <th class="text-left px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-normal text-slate-500 uppercase tracking-wider">Data</th>
              <th class="text-left px-3 sm:px-4 py-3 text-[11px] sm:text-xs font-normal text-slate-500 uppercase tracking-wider">Cliente</th>
              <th class="hidden md:table-cell text-center px-4 py-3 text-xs font-normal text-slate-500 uppercase tracking-wider">Conexão</th>
              <th class="hidden lg:table-cell text-left px-4 py-3 text-xs font-normal text-slate-500 uppercase tracking-wider">Tipo</th>
              <th class="hidden lg:table-cell text-right px-4 py-3 text-xs font-normal text-slate-500 uppercase tracking-wider">%</th>
              <th class="text-right px-3 sm:px-4 py-3 text-[11px] sm:text-xs font-normal text-slate-500 uppercase tracking-wider">Valor</th>
              <th class="hidden md:table-cell text-left px-4 py-3 text-xs font-normal text-slate-500 uppercase tracking-wider whitespace-nowrap">Pagou com</th>
              <th class="hidden sm:table-cell text-left px-4 py-3 text-xs font-normal text-slate-500 uppercase tracking-wider">Situação</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-white/5">
            <tr v-for="c in extratoVisivel" :key="c.id" class="hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors">
              <td class="px-3 sm:px-5 py-2.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap tabular-nums">{{ fmtData(c.created_at) }}</td>
              <td class="px-3 sm:px-4 py-2.5">
                <p class="text-sm text-slate-800 dark:text-white truncate max-w-[220px]">{{ c.cliente }}</p>
                <!-- Celular: o que as colunas escondem -->
                <p class="sm:hidden mt-0.5 text-[11px] text-slate-500">{{ c.conexao }}ª · {{ rotuloTipo(c) }} · {{ rotuloStatus(c) }}</p>
              </td>
              <td class="hidden md:table-cell px-4 py-2.5 text-center">
                <span class="px-1.5 py-0.5 rounded text-[10px] tabular-nums bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-500/20">{{ c.conexao }}ª</span>
              </td>
              <td class="hidden lg:table-cell px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">{{ rotuloTipo(c) }}</td>
              <td class="hidden lg:table-cell px-4 py-2.5 text-right text-xs tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                {{ fmtPct(c.percentual) }}
                <span v-if="c.meses > 1" class="block text-[10px] text-slate-400">somando {{ c.meses }} meses</span>
              </td>
              <td class="px-3 sm:px-4 py-2.5 text-right text-sm tabular-nums whitespace-nowrap" :class="c.status === 'cancelado' || c.status === 'estornado' ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-white'">
                {{ fmtBRL(c.valor) }}
              </td>
              <td class="hidden md:table-cell px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                <i class="fa-solid text-[10px] mr-1 text-slate-400" :class="c.origem_pagamento === 'stripe_invoice' ? 'fa-credit-card' : 'fa-qrcode'" aria-hidden="true" />
                {{ c.origem_pagamento === 'stripe_invoice' ? 'Cartão' : 'PIX' }}
              </td>
              <td class="hidden sm:table-cell px-4 py-2.5">
                <span
                  class="inline-flex items-center px-2.5 py-1 rounded-full text-xs border whitespace-nowrap"
                  :class="STATUS_COMISSAO[c.status]?.cls"
                  :title="c.motivo_estorno || undefined"
                >{{ rotuloStatus(c) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="comissoes.length > limiteExtrato" class="px-5 py-3 border-t border-slate-100 dark:border-white/5 text-center">
          <button type="button" class="text-xs text-purple-600 dark:text-purple-400 hover:underline" @click="limiteExtrato += PAGINA">
            Mostrar mais ({{ comissoes.length - limiteExtrato }} restantes)
          </button>
        </div>
      </div>
    </div>

    <p class="text-xs text-slate-400 dark:text-slate-600 flex items-start gap-1.5">
      <i class="fa-solid fa-circle-info text-[10px] mt-0.5" aria-hidden="true" />
      <span>
        A comissão fica retida 7 dias quando o cliente paga por PIX e 15 dias no cartão. Se o cliente deixar de pagar nesse período, ela é cancelada.
        Plano pago adiantado (6 ou 12 meses) gera um lançamento só, com o total.
      </span>
    </p>

    <!-- Confirmar saque -->
    <BaseModal :show="mostrarConfirmacao" title="Confirmar saque" @close="mostrarConfirmacao = false">
      <div class="space-y-4">
        <div class="text-center">
          <p class="text-xs text-slate-500 dark:text-slate-400">Valor do saque</p>
          <p class="text-3xl font-medium tabular-nums text-slate-900 dark:text-white mt-1">{{ fmtBRL(totais.disponivel) }}</p>
        </div>

        <dl v-if="recebimento" class="rounded-md bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 divide-y divide-slate-200 dark:divide-white/10 text-sm">
          <div class="px-4 py-2.5 flex items-center justify-between gap-3">
            <dt class="text-slate-500 dark:text-slate-400 text-xs">Chave PIX ({{ ROTULO_TIPO_CHAVE_PIX[recebimento.chave_pix_tipo ?? ''] ?? '—' }})</dt>
            <dd class="text-slate-900 dark:text-white text-right break-all">{{ formatarChavePix(recebimento.chave_pix, recebimento.chave_pix_tipo) }}</dd>
          </div>
          <div class="px-4 py-2.5 flex items-center justify-between gap-3">
            <dt class="text-slate-500 dark:text-slate-400 text-xs">Titular</dt>
            <dd class="text-slate-900 dark:text-white text-right">{{ recebimento.nome }}</dd>
          </div>
          <div class="px-4 py-2.5 flex items-center justify-between gap-3">
            <dt class="text-slate-500 dark:text-slate-400 text-xs">CPF/CNPJ</dt>
            <dd class="text-slate-900 dark:text-white text-right tabular-nums">{{ formatarDocumento(recebimento.documento) }}</dd>
          </div>
        </dl>

        <p class="text-sm text-slate-600 dark:text-slate-400 flex items-start gap-2">
          <i class="fa-solid fa-clock text-purple-500 text-xs mt-1" aria-hidden="true" />
          <span>O pedido vai direto para o painel da Agzap e o PIX cai em até {{ prazoHoras }} horas. Pode cair antes.</span>
        </p>

        <div class="flex gap-2 pt-1">
          <button
            type="button"
            :disabled="enviandoSaque"
            class="flex-1 px-4 py-2.5 rounded font-normal text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            @click="mostrarConfirmacao = false"
          >
            Cancelar
          </button>
          <button
            type="button"
            :disabled="enviandoSaque"
            class="flex-1 px-4 py-2.5 rounded font-normal text-sm text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            @click="confirmarSaque"
          >
            <i v-if="enviandoSaque" class="fa-solid fa-spinner animate-spin text-xs" aria-hidden="true" />
            {{ enviandoSaque ? 'Pedindo…' : 'Confirmar saque' }}
          </button>
        </div>
      </div>
    </BaseModal>

    <!-- Pedido enviado + aviso opcional pelo WhatsApp -->
    <BaseModal :show="!!saqueEnviado" title="Pedido de saque enviado" @close="saqueEnviado = null">
      <div v-if="saqueEnviado" class="space-y-4">
        <div class="text-center">
          <div class="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center mx-auto mb-3">
            <i class="fa-solid fa-check text-emerald-600 dark:text-emerald-400 text-2xl" aria-hidden="true" />
          </div>
          <p class="text-sm text-slate-700 dark:text-slate-200">Pedido de saque enviado ✓</p>
          <p class="text-3xl font-medium tabular-nums text-slate-900 dark:text-white mt-1">{{ fmtBRL(saqueEnviado.saque.valor) }}</p>
          <p class="text-sm text-slate-600 dark:text-slate-400 mt-2">
            A Agzap paga por PIX em até {{ prazoHoras }} horas.
          </p>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1 tabular-nums">
            Pedido #{{ idCurtoSaque(saqueEnviado.saque.id) }} · {{ fmtDiaMesHora(saqueEnviado.saque.solicitado_em) }}
          </p>
        </div>

        <div class="rounded-md bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 px-4 py-3">
          <p class="text-sm text-slate-900 dark:text-white">Quer avisar também pelo WhatsApp da Agzap?</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            O pedido já chegou no painel da Agzap. A mensagem é opcional: ela sai do seu WhatsApp, já com os dados do pedido e do seu PIX.
          </p>
        </div>

        <div class="flex flex-col-reverse sm:flex-row gap-2">
          <button
            type="button"
            class="sm:flex-1 px-4 py-2.5 rounded font-normal text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            @click="saqueEnviado = null"
          >
            Agora não
          </button>
          <a
            :href="linkSaqueEnviado"
            target="_blank"
            rel="noopener noreferrer"
            class="sm:flex-1 px-4 py-2.5 rounded font-normal text-sm text-white bg-emerald-600 hover:bg-emerald-700 inline-flex items-center justify-center gap-2"
            @click="enviarPeloWhatsApp"
          >
            <i class="fa-brands fa-whatsapp text-base" aria-hidden="true" />
            Enviar pelo WhatsApp
          </a>
        </div>
      </div>
    </BaseModal>

    <!-- Comprovante do PIX dentro da página -->
    <ComprovanteSaqueModal
      :show="!!visualizando"
      :rota="ROTA_COMPROVANTE"
      :saque-id="visualizando?.saqueId ?? null"
      :subtitulo="visualizando?.subtitulo ?? null"
      @close="visualizando = null"
    />
  </div>
</template>
