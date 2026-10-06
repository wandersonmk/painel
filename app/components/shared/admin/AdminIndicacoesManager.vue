<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { formatarDocumento } from '~~/shared/utils/documento'
import { formatPhoneSemDdiBrasil, whatsappLink } from '~/utils/phone'

/**
 * Consulta de indicação de parceiro. Quando um cliente pede assinatura, o
 * admin digita o CPF, CNPJ ou telefone e vê se algum parceiro registrou esse
 * cliente na cartela (e quando). Sem registro = cliente livre.
 *
 * Embaixo, os últimos registros de todos os parceiros.
 */
const emit = defineEmits<{ 'count-change': [total: number] }>()

type Via = 'documento' | 'telefone'

interface RegistroConsulta {
  id: string
  documento: string
  documento_tipo: 'cpf' | 'cnpj'
  nome_cliente: string
  telefone: string
  observacao: string | null
  created_at: string
  updated_at: string
  encontrado_por: Via[]
  parceiro: { id: string; nome: string; email: string | null; telefone: string | null; ativo: boolean } | null
  conta: { id: string; nome: string | null; created_at: string } | null
}

interface ContaAgzap {
  id: string
  nome: string | null
  responsavel: string | null
  whatsapp: string | null
  created_at: string
  subscription_status: string | null
  ativo: boolean | null
  encontrado_por: Via[]
  parceiro_vinculado: string | null
}

interface ResultadoConsulta {
  busca: { documento: { valor: string; tipo: 'cpf' | 'cnpj' } | null; telefone: string | null }
  indicacoes: RegistroConsulta[]
  contas: ContaAgzap[]
}

interface RegistroRecente {
  id: string
  documento: string
  documento_tipo: 'cpf' | 'cnpj'
  nome_cliente: string
  telefone: string
  observacao: string | null
  created_at: string
  tem_conta_agzap: boolean
  parceiro: { id: string; nome: string; ativo: boolean } | null
}

const toast = useToast()

// ───────── Consulta ─────────
const termo = ref('')
const consultando = ref(false)
const erroConsulta = ref('')
const resultado = ref<ResultadoConsulta | null>(null)
const campoBusca = ref<HTMLInputElement | null>(null)

async function consultar() {
  const q = termo.value.trim()
  if (!q || consultando.value) return
  consultando.value = true
  erroConsulta.value = ''
  try {
    const resp = await $fetch<{ success: boolean; data?: ResultadoConsulta; error?: string }>(
      '/api/admin/indicacoes/consultar',
      { query: { q }, headers: await useAdminAuthHeaders() },
    )
    if (!resp.success || !resp.data) {
      resultado.value = null
      erroConsulta.value = resp.error || 'Não foi possível consultar.'
      return
    }
    resultado.value = resp.data
  }
  catch (err: any) {
    resultado.value = null
    erroConsulta.value = String(err?.data?.statusMessage || err?.message || 'Não foi possível consultar.')
  }
  finally {
    consultando.value = false
  }
}

function limparConsulta() {
  termo.value = ''
  resultado.value = null
  erroConsulta.value = ''
  campoBusca.value?.focus()
}

const parceirosDistintos = computed(() =>
  new Set((resultado.value?.indicacoes ?? []).map(i => i.parceiro?.id ?? '?')).size,
)

const descricaoBusca = computed(() => {
  const b = resultado.value?.busca
  if (!b) return ''
  const partes: string[] = []
  if (b.documento) partes.push(`${b.documento.tipo.toUpperCase()} ${formatarDocumento(b.documento.valor)}`)
  if (b.telefone) partes.push(`telefone ${formatPhoneSemDdiBrasil(b.telefone)} (com e sem o 9º dígito)`)
  return partes.join(' e ')
})

function rotuloVia(via: Via[]) {
  if (via.length === 2) return 'Bateu pelo documento e pelo telefone'
  return via[0] === 'documento' ? 'Bateu pelo documento' : 'Bateu pelo telefone'
}

const STATUS_ASSINATURA: Record<string, { texto: string; cls: string }> = {
  active: { texto: 'Assinatura ativa', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  trial: { texto: 'Em teste', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  canceled: { texto: 'Assinatura cancelada', cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
  expired: { texto: 'Assinatura vencida', cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
}
function statusConta(c: ContaAgzap) {
  return STATUS_ASSINATURA[c.subscription_status ?? '']
    ?? { texto: c.subscription_status || 'Status não informado', cls: 'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-400' }
}

// ───────── Registros recentes ─────────
const recentes = ref<RegistroRecente[]>([])
const total = ref(0)
const limite = ref(0)
const parceiros = ref<Array<{ id: string; nome: string; ativo: boolean }>>([])
const filtroParceiro = ref('')
const filtroTexto = ref('')
const carregandoRecentes = ref(false)
const erroRecentes = ref('')

async function carregar() {
  carregandoRecentes.value = true
  erroRecentes.value = ''
  try {
    const resp = await $fetch<{
      success: boolean
      error?: string
      data?: { total: number; limite: number; parceiros: typeof parceiros.value; indicacoes: RegistroRecente[] }
    }>('/api/admin/indicacoes/recentes', {
      query: filtroParceiro.value ? { parceiroId: filtroParceiro.value } : {},
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Não foi possível carregar os registros.')
    recentes.value = resp.data.indicacoes
    total.value = resp.data.total
    limite.value = resp.data.limite
    parceiros.value = resp.data.parceiros
    if (!filtroParceiro.value) emit('count-change', resp.data.total)
  }
  catch (err: any) {
    erroRecentes.value = String(err?.data?.statusMessage || err?.message || err)
  }
  finally {
    carregandoRecentes.value = false
  }
}

defineExpose({ carregar })
onMounted(carregar)

function semAcento(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const recentesFiltrados = computed(() => {
  const t = semAcento(filtroTexto.value.trim())
  if (!t) return recentes.value
  const alnum = filtroTexto.value.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  return recentes.value.filter(r =>
    semAcento(r.nome_cliente).includes(t)
    || semAcento(r.parceiro?.nome ?? '').includes(t)
    || (alnum.length >= 3 && (r.documento.includes(alnum) || r.telefone.includes(alnum))),
  )
})

function consultarRegistro(r: RegistroRecente) {
  termo.value = formatarDocumento(r.documento)
  consultar()
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ───────── Remover registro ─────────
interface AlvoRemocao {
  id: string
  nome_cliente: string
  documento: string
  documento_tipo: 'cpf' | 'cnpj'
  parceiro_nome: string
  created_at: string
}
const alvoRemocao = ref<AlvoRemocao | null>(null)
const motivoRemocao = ref('')
const removendo = ref(false)
const erroRemocao = ref('')

function pedirRemocao(r: RegistroConsulta | RegistroRecente) {
  alvoRemocao.value = {
    id: r.id,
    nome_cliente: r.nome_cliente,
    documento: r.documento,
    documento_tipo: r.documento_tipo,
    parceiro_nome: r.parceiro?.nome ?? 'parceiro',
    created_at: r.created_at,
  }
  motivoRemocao.value = ''
  erroRemocao.value = ''
}

async function confirmarRemocao() {
  if (!alvoRemocao.value || removendo.value) return
  removendo.value = true
  erroRemocao.value = ''
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/indicacoes/excluir', {
      method: 'POST',
      body: { id: alvoRemocao.value.id, motivo: motivoRemocao.value },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) {
      erroRemocao.value = resp.error || 'Não foi possível remover.'
      return
    }
    toast.success('Registro de indicação removido')
    alvoRemocao.value = null
    await Promise.all([carregar(), resultado.value ? consultar() : Promise.resolve()])
  }
  catch (err: any) {
    erroRemocao.value = String(err?.data?.statusMessage || err?.message || 'Não foi possível remover.')
  }
  finally {
    removendo.value = false
  }
}

function fmtDataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}
function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <div class="space-y-6">

    <!-- ═════════ Consulta ═════════ -->
    <div :class="[cardBase, 'p-5 sm:p-6 space-y-5']">
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded bg-purple-100 dark:bg-purple-500/15 border border-purple-200 dark:border-purple-500/20 flex items-center justify-center shrink-0">
          <i class="fa-solid fa-magnifying-glass text-purple-600 dark:text-purple-400" aria-hidden="true" />
        </div>
        <div>
          <h2 class="text-base font-bold text-slate-900 dark:text-white">Consultar indicação</h2>
          <p class="text-sm text-slate-500 dark:text-slate-400">
            Cliente pediu assinatura? Digite o CPF, CNPJ ou telefone dele para ver se algum parceiro registrou a indicação.
          </p>
        </div>
      </div>

      <form class="flex flex-col sm:flex-row gap-2" @submit.prevent="consultar">
        <div class="relative flex-1">
          <i class="fa-solid fa-id-card absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" aria-hidden="true" />
          <input
            ref="campoBusca"
            v-model="termo"
            type="search"
            maxlength="40"
            autocomplete="off"
            placeholder="CPF, CNPJ ou telefone (ex.: 12.345.678/0001-90 ou (11) 99999-9999)"
            class="w-full pl-10 pr-3 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white placeholder:text-slate-400 tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
        </div>
        <button
          type="submit"
          :disabled="!termo.trim() || consultando"
          class="inline-flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-sm font-semibold transition-colors"
        >
          <i class="fa-solid text-xs" :class="consultando ? 'fa-circle-notch animate-spin' : 'fa-magnifying-glass'" aria-hidden="true" />
          {{ consultando ? 'Consultando…' : 'Consultar' }}
        </button>
        <button
          v-if="resultado || erroConsulta"
          type="button"
          class="inline-flex items-center justify-center gap-2 px-4 py-3 rounded text-sm font-semibold text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          @click="limparConsulta"
        >
          <i class="fa-solid fa-xmark text-xs" aria-hidden="true" />
          Limpar
        </button>
      </form>

      <div
        v-if="erroConsulta"
        class="rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-2"
        role="alert"
      >
        <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
        {{ erroConsulta }}
      </div>

      <template v-if="resultado">
        <!-- Veredito -->
        <div
          v-if="!resultado.indicacoes.length"
          class="rounded-md border px-5 py-4 flex items-start gap-3 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20"
        >
          <i class="fa-solid fa-circle-check text-emerald-600 dark:text-emerald-400 text-xl mt-0.5" aria-hidden="true" />
          <div>
            <p class="text-base font-bold text-emerald-800 dark:text-emerald-300">Livre: nenhum parceiro registrou esse cliente.</p>
            <p class="text-xs text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">Busca por {{ descricaoBusca }}.</p>
          </div>
        </div>
        <div
          v-else
          class="rounded-md border px-5 py-4 flex items-start gap-3 bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/20"
        >
          <i class="fa-solid fa-handshake text-purple-600 dark:text-purple-400 text-xl mt-0.5" aria-hidden="true" />
          <div class="min-w-0">
            <p class="text-base font-bold text-purple-900 dark:text-purple-200">
              Indicação de {{ resultado.indicacoes[0]!.parceiro?.nome ?? 'parceiro removido' }}
            </p>
            <p class="text-sm text-purple-800/90 dark:text-purple-300/90">
              Registrada em {{ fmtDataHora(resultado.indicacoes[0]!.created_at) }}
              <span v-if="resultado.indicacoes.length > 1">· {{ resultado.indicacoes.length }} registros batem com essa busca</span>
            </p>
            <p class="text-xs text-purple-700/70 dark:text-purple-400/70 mt-0.5">Busca por {{ descricaoBusca }}.</p>
          </div>
        </div>

        <div
          v-if="parceirosDistintos > 1"
          class="rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2"
        >
          <i class="fa-solid fa-triangle-exclamation mt-0.5" aria-hidden="true" />
          <span>
            Registros de <strong>{{ parceirosDistintos }} parceiros diferentes</strong> batem com essa busca
            (um pelo documento, outro pelo telefone). O mais antigo aparece primeiro.
          </span>
        </div>

        <div class="grid gap-4 lg:grid-cols-2 items-start">
          <!-- Registros de parceiros -->
          <section class="space-y-3 min-w-0">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <i class="fa-solid fa-address-card text-purple-500" aria-hidden="true" />
              Registros de parceiros ({{ resultado.indicacoes.length }})
            </h3>
            <p v-if="!resultado.indicacoes.length" class="text-sm text-slate-400 dark:text-slate-500 rounded-md border border-dashed border-slate-200 dark:border-white/10 px-4 py-6 text-center">
              Nenhum registro.
            </p>
            <article
              v-for="(r, idx) in resultado.indicacoes"
              :key="r.id"
              class="rounded-md border p-4 space-y-3"
              :class="idx === 0
                ? 'border-purple-300 dark:border-purple-500/40 bg-white dark:bg-slate-900'
                : 'border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900'"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-bold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                    {{ r.parceiro?.nome ?? 'Parceiro removido' }}
                    <span v-if="idx === 0 && resultado.indicacoes.length > 1" class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300">Mais antigo</span>
                    <span v-if="r.parceiro && !r.parceiro.ativo" class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300">Suspenso</span>
                  </p>
                  <p class="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                    <span v-if="r.parceiro?.email" class="truncate"><i class="fa-solid fa-envelope text-[10px] mr-1" aria-hidden="true" />{{ r.parceiro.email }}</span>
                    <a
                      v-if="r.parceiro?.telefone && whatsappLink(r.parceiro.telefone)"
                      :href="whatsappLink(r.parceiro.telefone)!"
                      target="_blank"
                      rel="noopener"
                      class="hover:text-emerald-600 dark:hover:text-emerald-400 tabular-nums"
                    ><i class="fa-brands fa-whatsapp text-emerald-500 mr-1" aria-hidden="true" />{{ formatPhoneSemDdiBrasil(r.parceiro.telefone) }}</a>
                    <span v-if="!r.parceiro?.email && !r.parceiro?.telefone">Contato do parceiro não informado</span>
                  </p>
                </div>
                <button
                  type="button"
                  class="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  title="Remover este registro"
                  @click="pedirRemocao(r)"
                >
                  <i class="fa-solid fa-trash text-[10px]" aria-hidden="true" />
                  Remover
                </button>
              </div>

              <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Registrado em</dt>
                  <dd class="font-semibold text-slate-900 dark:text-white tabular-nums">{{ fmtDataHora(r.created_at) }}</dd>
                </div>
                <div>
                  <dt class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cliente informado</dt>
                  <dd class="text-slate-800 dark:text-slate-200 break-words">{{ r.nome_cliente }}</dd>
                </div>
                <div>
                  <dt class="text-[10px] font-bold uppercase tracking-wider text-slate-400">{{ r.documento_tipo.toUpperCase() }}</dt>
                  <dd class="text-slate-800 dark:text-slate-200 tabular-nums">{{ formatarDocumento(r.documento) }}</dd>
                </div>
                <div>
                  <dt class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Telefone informado</dt>
                  <dd class="text-slate-800 dark:text-slate-200 tabular-nums">{{ formatPhoneSemDdiBrasil(r.telefone) }}</dd>
                </div>
              </dl>

              <p v-if="r.observacao" class="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-white/[0.03] rounded px-3 py-2 break-words">
                <span class="font-semibold">Observação do parceiro:</span> {{ r.observacao }}
              </p>

              <div class="flex flex-wrap items-center gap-2 text-[11px]">
                <span class="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 font-semibold">{{ rotuloVia(r.encontrado_por) }}</span>
                <span v-if="r.updated_at && Date.parse(r.updated_at) - Date.parse(r.created_at) > 1000" class="text-slate-400">
                  Nome/observação editados em {{ fmtDataHora(r.updated_at) }}
                </span>
              </div>

              <p
                v-if="r.conta && Date.parse(r.conta.created_at) < Date.parse(r.created_at)"
                class="text-xs rounded px-3 py-2 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 flex items-start gap-1.5"
              >
                <i class="fa-solid fa-clock-rotate-left text-[10px] mt-0.5" aria-hidden="true" />
                <span>A conta na Agzap ({{ r.conta.nome || 'sem nome' }}) foi criada em {{ fmtDataHora(r.conta.created_at) }}, <strong>antes</strong> deste registro.</span>
              </p>
              <p
                v-else-if="r.conta"
                class="text-xs rounded px-3 py-2 bg-slate-50 dark:bg-white/[0.03] text-slate-600 dark:text-slate-400 flex items-start gap-1.5"
              >
                <i class="fa-solid fa-circle-info text-[10px] mt-0.5" aria-hidden="true" />
                <span>A conta na Agzap ({{ r.conta.nome || 'sem nome' }}) foi criada em {{ fmtDataHora(r.conta.created_at) }}, depois deste registro.</span>
              </p>
            </article>
          </section>

          <!-- Contas na Agzap -->
          <section class="space-y-3 min-w-0">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <i class="fa-solid fa-building text-sky-500" aria-hidden="true" />
              Contas na Agzap ({{ resultado.contas.length }})
            </h3>
            <p v-if="!resultado.contas.length" class="text-sm text-slate-400 dark:text-slate-500 rounded-md border border-dashed border-slate-200 dark:border-white/10 px-4 py-6 text-center">
              Nenhuma conta na Agzap com esse CPF/CNPJ ou telefone.
            </p>
            <article
              v-for="c in resultado.contas"
              :key="c.id"
              class="rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-4 space-y-2.5"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-bold text-slate-900 dark:text-white break-words">{{ c.nome || 'Sem nome' }}</p>
                  <p v-if="c.responsavel" class="text-xs text-slate-500 dark:text-slate-400">Responsável: {{ c.responsavel }}</p>
                </div>
                <span class="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" :class="statusConta(c).cls">
                  {{ statusConta(c).texto }}
                </span>
              </div>
              <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Conta criada em</dt>
                  <dd class="text-slate-800 dark:text-slate-200 tabular-nums">{{ fmtDataHora(c.created_at) }}</dd>
                </div>
                <div>
                  <dt class="text-[10px] font-bold uppercase tracking-wider text-slate-400">WhatsApp da conta</dt>
                  <dd class="text-slate-800 dark:text-slate-200 tabular-nums">{{ formatPhoneSemDdiBrasil(c.whatsapp) || '—' }}</dd>
                </div>
                <div class="sm:col-span-2">
                  <dt class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Parceiro na carteira</dt>
                  <dd class="text-slate-800 dark:text-slate-200">{{ c.parceiro_vinculado || 'Nenhum parceiro vinculado' }}</dd>
                </div>
              </dl>
              <span class="inline-block px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 font-semibold text-[11px]">{{ rotuloVia(c.encontrado_por) }}</span>
            </article>
          </section>
        </div>
      </template>
    </div>

    <!-- ═════════ Registros recentes ═════════ -->
    <div :class="[cardBase, 'overflow-hidden']">
      <div class="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-white/5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-bold text-slate-900 dark:text-white">Registros dos parceiros</h2>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">
            <template v-if="!carregandoRecentes">
              {{ total }} registro{{ total === 1 ? '' : 's' }}{{ filtroParceiro ? ' deste parceiro' : ' no total' }}
              <span v-if="total > recentes.length"> · mostrando os {{ recentes.length }} mais recentes</span>
            </template>
            <template v-else>Carregando…</template>
          </p>
        </div>
        <div class="flex flex-col sm:flex-row gap-2">
          <select
            v-model="filtroParceiro"
            class="px-3 py-2 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-full text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            @change="carregar"
          >
            <option value="">Todos os parceiros</option>
            <option v-for="p in parceiros" :key="p.id" :value="p.id">{{ p.nome }}{{ p.ativo ? '' : ' (suspenso)' }}</option>
          </select>
          <div class="relative">
            <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" aria-hidden="true" />
            <input
              v-model="filtroTexto"
              type="search"
              placeholder="Filtrar por cliente, parceiro, CPF/CNPJ…"
              class="w-full sm:w-72 pl-8 pr-3 py-2 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-full text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
          </div>
        </div>
      </div>

      <div v-if="erroRecentes" class="m-4 p-3 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm">
        {{ erroRecentes }}
      </div>

      <div v-if="carregandoRecentes && !recentes.length" class="p-5 space-y-3">
        <div v-for="i in 3" :key="i" class="h-4 bg-slate-100 dark:bg-white/5 rounded animate-pulse" :class="i === 2 ? 'w-2/3' : 'w-full'" />
      </div>

      <div v-else-if="!recentesFiltrados.length" class="px-5 py-12 text-center">
        <i class="fa-solid fa-address-card text-slate-300 dark:text-slate-700 text-2xl mb-2 block" aria-hidden="true" />
        <p class="text-slate-500 text-sm">
          {{ recentes.length ? 'Nenhum registro com esse filtro' : 'Nenhum parceiro registrou indicações ainda' }}
        </p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-200 dark:border-white/5 bg-slate-50/60 dark:bg-white/[0.02]">
              <th class="text-left px-3 sm:px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Registrado em</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Parceiro</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cliente</th>
              <th class="hidden md:table-cell text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">CPF / CNPJ</th>
              <th class="hidden lg:table-cell text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Telefone</th>
              <th class="hidden sm:table-cell text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Conta na Agzap</th>
              <th class="text-right px-3 sm:px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-white/5">
            <tr v-for="r in recentesFiltrados" :key="r.id" class="hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors">
              <td class="px-3 sm:px-5 py-3 whitespace-nowrap tabular-nums text-xs text-slate-600 dark:text-slate-400">{{ fmtDataHora(r.created_at) }}</td>
              <td class="px-4 py-3">
                <span class="font-semibold text-slate-800 dark:text-slate-200">{{ r.parceiro?.nome ?? 'Parceiro removido' }}</span>
                <span v-if="r.parceiro && !r.parceiro.ativo" class="ml-1 text-[10px] font-bold uppercase text-slate-400">suspenso</span>
              </td>
              <td class="px-4 py-3">
                <p class="text-slate-900 dark:text-white break-words">{{ r.nome_cliente }}</p>
                <p class="md:hidden text-xs text-slate-500 tabular-nums">{{ formatarDocumento(r.documento) }}</p>
              </td>
              <td class="hidden md:table-cell px-4 py-3 whitespace-nowrap">
                <span class="text-[10px] font-bold uppercase text-slate-400 mr-1">{{ r.documento_tipo }}</span>
                <span class="tabular-nums text-slate-700 dark:text-slate-300">{{ formatarDocumento(r.documento) }}</span>
              </td>
              <td class="hidden lg:table-cell px-4 py-3 whitespace-nowrap tabular-nums text-slate-700 dark:text-slate-300">{{ formatPhoneSemDdiBrasil(r.telefone) }}</td>
              <td class="hidden sm:table-cell px-4 py-3">
                <span
                  class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
                  :class="r.tem_conta_agzap
                    ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400'"
                >{{ r.tem_conta_agzap ? 'Tem conta' : 'Ainda não' }}</span>
              </td>
              <td class="px-3 sm:px-5 py-3">
                <div class="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    class="w-8 h-8 rounded flex items-center justify-center text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                    title="Abrir na consulta"
                    aria-label="Abrir na consulta"
                    @click="consultarRegistro(r)"
                  >
                    <i class="fa-solid fa-magnifying-glass text-xs" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="w-8 h-8 rounded flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    title="Remover registro"
                    aria-label="Remover registro"
                    @click="pedirRemocao(r)"
                  >
                    <i class="fa-solid fa-trash text-xs" aria-hidden="true" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ═════════ Modal: remover registro ═════════ -->
    <BaseModal :show="!!alvoRemocao" title="Remover registro de indicação" max-width="max-w-lg" @close="alvoRemocao = null">
      <div v-if="alvoRemocao" class="space-y-4">
        <p class="text-sm text-slate-600 dark:text-slate-400">
          Remover o registro de <strong class="text-slate-900 dark:text-white">{{ alvoRemocao.nome_cliente }}</strong>
          ({{ alvoRemocao.documento_tipo.toUpperCase() }} {{ formatarDocumento(alvoRemocao.documento) }}),
          feito por <strong class="text-slate-900 dark:text-white">{{ alvoRemocao.parceiro_nome }}</strong>
          em {{ fmtData(alvoRemocao.created_at) }}?
        </p>
        <ul class="rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-3.5 py-3 space-y-1.5 text-xs text-amber-800 dark:text-amber-300">
          <li class="flex items-start gap-1.5">
            <i class="fa-solid fa-unlock text-[10px] mt-0.5" aria-hidden="true" />
            <span>O registro some da cartela do parceiro e o CPF/CNPJ fica livre para outro parceiro registrar.</span>
          </li>
          <li class="flex items-start gap-1.5">
            <i class="fa-solid fa-equals text-[10px] mt-0.5" aria-hidden="true" />
            <span>Não mexe na conta do cliente, na carteira nem nos créditos do parceiro.</span>
          </li>
          <li class="flex items-start gap-1.5">
            <i class="fa-solid fa-clipboard-list text-[10px] mt-0.5" aria-hidden="true" />
            <span>Uma cópia do registro e o motivo ficam na auditoria do parceiro.</span>
          </li>
        </ul>
        <div>
          <label for="rem-motivo" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Motivo <span class="font-normal text-slate-400">(opcional)</span>
          </label>
          <input
            id="rem-motivo"
            v-model="motivoRemocao"
            type="text"
            maxlength="300"
            placeholder="Ex.: registrado por engano, cliente veio direto"
            class="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
        </div>
        <p v-if="erroRemocao" class="text-xs text-red-600 dark:text-red-400" role="alert">{{ erroRemocao }}</p>
        <div class="flex gap-2">
          <button
            type="button"
            :disabled="removendo"
            class="flex-1 px-4 py-2.5 rounded font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            @click="alvoRemocao = null"
          >
            Manter
          </button>
          <button
            type="button"
            :disabled="removendo"
            class="flex-1 px-4 py-2.5 rounded font-semibold text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white transition-colors flex items-center justify-center gap-2"
            @click="confirmarRemocao"
          >
            <i v-if="removendo" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
            {{ removendo ? 'Removendo…' : 'Remover registro' }}
          </button>
        </div>
      </div>
    </BaseModal>
  </div>
</template>
