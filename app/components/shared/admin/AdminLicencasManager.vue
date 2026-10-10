<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { formatPhoneSemDdiBrasil, whatsappLink } from '~/utils/phone'
import AdminCobrancaAgzapModal from './AdminCobrancaAgzapModal.vue'
import AdminRenovarCortesiaModal from './AdminRenovarCortesiaModal.vue'

interface ClienteVinculado {
  vinculo_id: string
  empresa_id: string
  empresa_nome: string
  vinculado_em: string
  vencimento: string | null
  situacao: 'ativo' | 'vencido' | 'bloqueado_parceiro' | 'bloqueado_admin'
  cobranca_agzap: boolean
}

interface ParceiroLicencas {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  ativo: boolean
  // Parceria removida (09/10/2026): ≠ suspenso. Fica escondida e fora dos totais.
  removido_em?: string | null
  migrado_em: string | null
  saldos: { mensal_30d: number; anual_12m: number }
  clientes_total: number
  clientes_ativos: number
  clientes_vencidos: number
  clientes_bloqueados: number
  ultimo_consumo_em: string | null
  clientes: ClienteVinculado[]
}

interface Movimentacao {
  id: string
  parceiro_id: string
  tipo_credito: 'mensal_30d' | 'anual_12m'
  quantidade: number
  operacao: string
  empresa_nome: string | null
  referencia: string | null
  valor_pago: number | null
  descricao: string | null
  criado_por_papel: string
  created_at: string
}

interface Renovacao {
  id: string
  parceiro_id: string
  empresa_nome: string | null
  tipo_credito: string | null
  origem: 'parceiro' | 'admin'
  consumiu_credito: boolean
  vencimento_novo: string | null
  executado_em: string
}

interface Preco {
  id: string
  tipo_credito: 'mensal_30d' | 'anual_12m'
  quantidade_min: number
  preco_unitario: number
}

// O cadastro do parceiro (modais de editar/suspender/excluir) mora na página;
// aqui só disparamos a ação com o parceiro da linha.
const emit = defineEmits<{
  editar: [parceiro: ParceiroLicencas]
  suspender: [parceiro: ParceiroLicencas]
  excluir: [parceiro: ParceiroLicencas]
}>()

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

const parceiros = ref<ParceiroLicencas[]>([])
const movimentacoes = ref<Movimentacao[]>([])
const renovacoes = ref<Renovacao[]>([])
const precos = ref<Preco[]>([])
const loading = ref(true)
// Linhas abertas (cada parceiro começa recolhido).
const abertos = ref(new Set<string>())
// Parceiro com o modal do Termo aberto (aceite + comprovante em PDF).
const alvoTermos = ref<ParceiroLicencas | null>(null)

async function carregar() {
  try {
    const resp = await $fetch<{ success: boolean; data?: any; error?: string }>(
      '/api/admin/parceiros/licencas',
      { headers: await useAdminAuthHeaders() },
    )
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Erro')
    parceiros.value = resp.data.parceiros
    movimentacoes.value = resp.data.movimentacoes
    renovacoes.value = resp.data.renovacoes
    precos.value = resp.data.precos
  } catch {
    toast?.error('Erro ao carregar as licenças')
  }
}

onMounted(async () => {
  document.addEventListener('pointerdown', fecharMenuFora)
  document.addEventListener('keydown', fecharMenuEsc)
  toast = await useToastSafe()
  loading.value = true
  await carregar()
  loading.value = false
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', fecharMenuFora)
  document.removeEventListener('keydown', fecharMenuEsc)
})

defineExpose({ carregar })

function alternar(id: string) {
  if (abertos.value.has(id)) abertos.value.delete(id)
  else abertos.value.add(id)
}

// ───────── Resumo (recolhido) e busca ─────────
const resumoAberto = ref(false)
const busca = ref('')

// Parceria removida não é parceiro: fica fora da lista (a não ser que peça
// para ver) e fora dos totais.
const mostrarRemovidos = ref(false)
const naoRemovidos = computed(() => parceiros.value.filter(p => !p.removido_em))
const qtdRemovidos = computed(() => parceiros.value.length - naoRemovidos.value.length)
const visiveis = computed(() => mostrarRemovidos.value ? parceiros.value : naoRemovidos.value)

const totais = computed(() => {
  const t = { parceiros: 0, ativos: 0, suspensos: 0, mensal: 0, anual: 0, clientes: 0, clientesAtivos: 0, vencidos: 0, bloqueados: 0 }
  for (const p of naoRemovidos.value) {
    t.parceiros += 1
    if (p.ativo) t.ativos += 1
    else t.suspensos += 1
    t.mensal += Number(p.saldos?.mensal_30d ?? 0)
    t.anual += Number(p.saldos?.anual_12m ?? 0)
    t.clientes += p.clientes_total
    t.clientesAtivos += p.clientes_ativos
    t.vencidos += p.clientes_vencidos
    t.bloqueados += p.clientes_bloqueados
  }
  return t
})

const filtrados = computed(() => {
  const q = busca.value.trim().toLowerCase()
  if (!q) return visiveis.value
  const digitos = q.replace(/\D/g, '')
  return visiveis.value.filter(p =>
    p.nome.toLowerCase().includes(q)
    || (p.email || '').toLowerCase().includes(q)
    || (digitos.length >= 3 && (p.telefone || '').replace(/\D/g, '').includes(digitos)))
})

// ───────── Menu de ações ─────────
const menuAberto = ref<string | null>(null)

function alternarMenu(id: string) {
  menuAberto.value = menuAberto.value === id ? null : id
}
function fecharMenuFora(ev: Event) {
  if (!menuAberto.value) return
  const alvo = ev.target as HTMLElement | null
  if (alvo?.closest?.('[data-menu-parceiro]')) return
  menuAberto.value = null
}
function fecharMenuEsc(ev: KeyboardEvent) {
  if (ev.key === 'Escape') menuAberto.value = null
}
function acaoMenu(fn: () => void) {
  menuAberto.value = null
  fn()
}
function abrirTermos(p: ParceiroLicencas) {
  menuAberto.value = null
  alvoTermos.value = p
}

// ───────── Remover parceria ─────────
const alvoRemocao = ref<ParceiroLicencas | null>(null)

function abrirRemocao(p: ParceiroLicencas) {
  menuAberto.value = null
  alvoRemocao.value = p
}

async function aposRemocao() {
  const id = alvoRemocao.value?.id
  alvoRemocao.value = null
  if (id) abertos.value.delete(id)
  await carregar()
}

// ───────── Conceder créditos ─────────
const showCreditos = ref(false)
const alvoCredito = ref<ParceiroLicencas | null>(null)
const formTipo = ref<'mensal_30d' | 'anual_12m'>('mensal_30d')
const formOperacao = ref<'concessao_admin' | 'compra' | 'correcao'>('compra')
const formQuantidade = ref<number | null>(null)
const formReferencia = ref('')
const formDesconto = ref<number | null>(null)
const formValorPago = ref<number | null>(null)
const formHouveReembolso = ref(false)
const formDescricao = ref('')
const salvandoCredito = ref(false)
const idemCredito = ref('')

function novaChave() {
  const bruto = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return bruto.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60)
}

function abrirCreditos(p: ParceiroLicencas) {
  alvoCredito.value = p
  formTipo.value = 'mensal_30d'
  formOperacao.value = 'compra'
  formQuantidade.value = null
  formReferencia.value = ''
  formDesconto.value = null
  formValorPago.value = null
  formHouveReembolso.value = false
  formDescricao.value = ''
  idemCredito.value = novaChave()
  showCreditos.value = true
}

/** Preço da faixa que cobre a quantidade informada. */
const precoSugerido = computed(() => {
  const qtd = Math.abs(formQuantidade.value ?? 0)
  if (!qtd) return null
  const faixas = precos.value
    .filter(p => p.tipo_credito === formTipo.value && p.quantidade_min <= qtd)
    .sort((a, b) => b.quantidade_min - a.quantidade_min)
  const faixa = faixas[0]
  if (!faixa) return null
  return { unitario: Number(faixa.preco_unitario), total: Number(faixa.preco_unitario) * qtd }
})

const totalTabela = computed(() => precoSugerido.value?.total ?? 0)
const descontoAplicado = computed(() => Math.min(Number(formDesconto.value ?? 0), totalTabela.value))
const percentualDesconto = computed(() =>
  totalTabela.value > 0 && descontoAplicado.value > 0
    ? (descontoAplicado.value / totalTabela.value) * 100
    : 0)

const arred = (v: number) => Number(Math.max(0, v).toFixed(2))

// Trocar de operação zera dinheiro: o valor digitado numa compra não pode
// vazar escondido para uma correção — e agora o valor da correção decide de
// qual lote o crédito sai no financeiro.
watch(formOperacao, () => {
  formDesconto.value = null
  formValorPago.value = null
  formHouveReembolso.value = false
})

watch([formQuantidade, formOperacao], ([quantidade, operacao]) => {
  if (operacao === 'correcao' && Number(quantidade) < 0) return
  formHouveReembolso.value = false
  if (operacao !== 'compra') formValorPago.value = null
})

watch(formHouveReembolso, (houveReembolso) => {
  if (!houveReembolso && formOperacao.value === 'correcao') formValorPago.value = null
})

/**
 * Numa compra, o valor já vem preenchido pela tabela comercial — evita erro de
 * digitação. O admin pode sobrescrever se cobrou um valor diferente.
 */
watch([formQuantidade, formTipo, formOperacao], () => {
  if (formOperacao.value !== 'compra') {
    formDesconto.value = null
    return
  }
  formValorPago.value = totalTabela.value ? arred(totalTabela.value - descontoAplicado.value) : null
})

/**
 * Desconto e valor pago são o mesmo número visto de dois lados: mexer num
 * recalcula o outro. Cada watcher só escreve quando o valor muda de fato, o
 * que faz os dois convergirem sem laço infinito.
 *
 * O valor pago vai para o ledger já abatido — é ele que alimenta faturamento,
 * ticket médio e passivo. Sem isso a métrica mostraria a tabela, não a venda.
 */
watch(formDesconto, () => {
  if (formOperacao.value !== 'compra' || !totalTabela.value) return
  const alvo = arred(totalTabela.value - descontoAplicado.value)
  if (Number(formValorPago.value ?? -1) !== alvo) formValorPago.value = alvo
})

watch(formValorPago, () => {
  if (formOperacao.value !== 'compra' || !totalTabela.value || formValorPago.value === null) return
  const alvo = arred(totalTabela.value - Number(formValorPago.value))
  if (Number(formDesconto.value ?? 0) !== alvo) formDesconto.value = alvo || null
})

const podeSalvarCredito = computed(() => {
  const q = formQuantidade.value
  if (!q || !Number.isInteger(q) || q === 0) return false
  if (q < 0 && formOperacao.value !== 'correcao') return false
  if (formOperacao.value === 'correcao' && !formDescricao.value.trim()) return false
  if (formOperacao.value === 'correcao' && q < 0 && formHouveReembolso.value && !(Number(formValorPago.value) > 0)) return false
  return true
})

async function salvarCredito() {
  if (!alvoCredito.value || !podeSalvarCredito.value || salvandoCredito.value) return
  salvandoCredito.value = true

  // O desconto entra na descrição do lançamento: o valor_pago já vai abatido,
  // então sem esta linha ninguém saberia depois que houve desconto nem de
  // quanto era a tabela na época.
  const partes: string[] = []
  if (formOperacao.value === 'compra' && descontoAplicado.value > 0) {
    partes.push(`Desconto de ${fmtBRL(descontoAplicado.value)} sobre a tabela de ${fmtBRL(totalTabela.value)}`)
  }
  if (formDescricao.value.trim()) partes.push(formDescricao.value.trim())
  const descricaoFinal = partes.join(' · ').slice(0, 300)

  try {
    const resp = await $fetch<{ success: boolean; error?: string; data?: { saldo: number } }>(
      '/api/admin/parceiros/creditos',
      {
        method: 'POST',
        body: {
          parceiroId: alvoCredito.value.id,
          tipoCredito: formTipo.value,
          quantidade: formQuantidade.value,
          operacao: formOperacao.value,
          referencia: formReferencia.value,
          valorPago: formOperacao.value === 'correcao' && !formHouveReembolso.value
            ? null
            : formValorPago.value,
          houveReembolso: formOperacao.value === 'correcao' && formHouveReembolso.value,
          descricao: descricaoFinal,
          idempotencyKey: idemCredito.value,
        },
        headers: await useAdminAuthHeaders(),
      },
    )
    if (!resp.success) throw new Error(resp.error || 'Erro')
    toast?.success(`Saldo atualizado: ${resp.data?.saldo ?? '—'} créditos`)
    showCreditos.value = false
    await carregar()
  } catch (e: any) {
    toast?.error(e?.data?.statusMessage || e?.message || 'Erro ao lançar créditos')
  } finally {
    salvandoCredito.value = false
  }
}

// ───────── Cobrança Agzap ─────────
// O selo não troca mais no clique: abre a confirmação (o dono trocou sem
// querer em 09/10/2026). A gravação e o toast ficam no modal.
const alvoCobranca = ref<{ cliente: ClienteVinculado; parceiroNome: string } | null>(null)

function abrirCobranca(c: ClienteVinculado, p: ParceiroLicencas) {
  alvoCobranca.value = { cliente: c, parceiroNome: p.nome }
}

async function aposCobranca() {
  alvoCobranca.value = null
  await carregar()
}

// ───────── Renovar pela Agzap (cortesia, sem crédito do parceiro) ─────────
const alvoCortesia = ref<{ cliente: ClienteVinculado; parceiroNome: string } | null>(null)

function abrirCortesia(c: ClienteVinculado, p: ParceiroLicencas) {
  alvoCortesia.value = { cliente: c, parceiroNome: p.nome }
}

async function aposCortesia() {
  alvoCortesia.value = null
  await carregar()
}

// ───────── Helpers ─────────
function fmtBRL(v: number | null) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))
}
function fmtData(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function fmtDataHora(s: string) {
  return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`
}

const SITUACOES: Record<string, { label: string; cls: string }> = {
  ativo: { label: 'Ativo', cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  vencido: { label: 'Vencido', cls: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400' },
  bloqueado_parceiro: { label: 'Bloq. parceiro', cls: 'bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  bloqueado_admin: { label: 'Bloq. Agzap', cls: 'bg-slate-200 dark:bg-slate-500/20 text-slate-700 dark:text-slate-300' },
}

const OPERACOES: Record<string, string> = {
  compra: 'Compra',
  concessao_admin: 'Concessão',
  consumo: 'Consumo',
  correcao: 'Correção',
  migracao: 'Migração',
}

const LABEL_TIPO: Record<string, string> = { mensal_30d: '30 dias', anual_12m: '12 meses' }

// As listas rolam por dentro, então cabe mais histórico sem esticar a página.
const LIMITE_LISTA = 50
const movsDoParceiro = (id: string) => movimentacoes.value.filter(m => m.parceiro_id === id).slice(0, LIMITE_LISTA)
const totalMovs = (id: string) => movimentacoes.value.filter(m => m.parceiro_id === id).length
const renovsDoParceiro = (id: string) => renovacoes.value.filter(r => r.parceiro_id === id).slice(0, LIMITE_LISTA)
const totalRenovs = (id: string) => renovacoes.value.filter(r => r.parceiro_id === id).length

const kpis = computed(() => {
  const t = totais.value
  return [
    {
      titulo: 'Parceiros ativos',
      valor: String(t.ativos),
      sub: t.suspensos ? `${plural(t.suspensos, 'suspenso', 'suspensos')} · ${t.parceiros} no total` : `${t.parceiros} no total`,
      icone: 'fa-handshake',
      cor: 'bg-purple-100 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400',
    },
    {
      titulo: 'Créditos de 30 dias',
      valor: String(t.mensal),
      sub: 'saldo somado dos parceiros',
      icone: 'fa-calendar-day',
      cor: 'bg-purple-100 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400',
    },
    {
      titulo: 'Créditos de 12 meses',
      valor: String(t.anual),
      sub: 'saldo somado dos parceiros',
      icone: 'fa-calendar',
      cor: 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
    },
    {
      titulo: 'Clientes ativos',
      valor: String(t.clientesAtivos),
      sub: `${t.clientes} vinculados`,
      icone: 'fa-users',
      cor: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    },
    {
      titulo: 'Vencidos',
      valor: String(t.vencidos),
      sub: `${plural(t.bloqueados, 'bloqueado', 'bloqueados')}`,
      icone: 'fa-triangle-exclamation',
      cor: 'bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400',
    },
  ]
})

const cardBase = 'rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none'
const painelBase = 'rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
const tituloPainel = 'text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider'
const colHead = 'text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider'
const itemMenu = 'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors'
const pill30 = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] whitespace-nowrap border bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/20 text-purple-700 dark:text-purple-300'
const pill12 = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] whitespace-nowrap border bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-300'
</script>

<template>
  <div class="space-y-4">

    <div v-if="loading" class="space-y-3">
      <div class="h-12 rounded-md bg-slate-100 dark:bg-white/5 animate-pulse border border-slate-200 dark:border-slate-800" />
      <div class="h-64 rounded-md bg-slate-100 dark:bg-white/5 animate-pulse border border-slate-200 dark:border-slate-800" />
    </div>

    <div v-else-if="parceiros.length === 0" :class="['px-5 py-14 text-center', cardBase]">
      <i class="fa-solid fa-id-card text-slate-300 dark:text-slate-700 text-3xl mb-3 block" aria-hidden="true" />
      <p class="text-slate-500 text-sm">Nenhum parceiro cadastrado</p>
    </div>

    <template v-else>
      <!-- ═════════ Resumo (começa recolhido) ═════════ -->
      <section :class="cardBase">
        <button
          type="button"
          class="w-full flex items-center gap-3 px-4 py-2.5 text-left rounded-md hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors"
          :aria-expanded="resumoAberto"
          aria-controls="parceiros-resumo"
          @click="resumoAberto = !resumoAberto"
        >
          <span class="size-7 rounded-md bg-purple-100 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-chart-simple text-xs" aria-hidden="true" />
          </span>
          <span class="hidden sm:inline text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider shrink-0">Resumo</span>
          <span class="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-700 dark:text-slate-300">
            <span class="whitespace-nowrap tabular-nums">{{ plural(totais.ativos, 'parceiro ativo', 'parceiros ativos') }}</span>
            <template v-if="totais.suspensos">
              <span class="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
              <span class="whitespace-nowrap tabular-nums">{{ plural(totais.suspensos, 'suspenso', 'suspensos') }}</span>
            </template>
            <span class="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
            <span class="whitespace-nowrap tabular-nums">{{ totais.mensal }} créditos de 30 dias</span>
            <span class="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
            <span class="whitespace-nowrap tabular-nums">{{ totais.anual }} de 12 meses</span>
            <span class="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
            <span class="whitespace-nowrap tabular-nums">{{ plural(totais.clientesAtivos, 'cliente ativo', 'clientes ativos') }}</span>
            <template v-if="totais.vencidos">
              <span class="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
              <span class="whitespace-nowrap tabular-nums text-red-600 dark:text-red-400">{{ plural(totais.vencidos, 'vencido', 'vencidos') }}</span>
            </template>
          </span>
          <i
            class="fa-solid fa-chevron-down text-xs text-slate-400 shrink-0 transition-transform duration-200"
            :class="{ 'rotate-180': resumoAberto }"
            aria-hidden="true"
          />
        </button>

        <div v-if="resumoAberto" id="parceiros-resumo" class="border-t border-slate-200 dark:border-slate-800 p-3">
          <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            <div
              v-for="k in kpis"
              :key="k.titulo"
              class="px-3.5 py-3 rounded-md border bg-slate-50/70 dark:bg-white/[0.02] border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 min-w-0"
            >
              <div class="min-w-0">
                <p class="text-xs text-slate-500 dark:text-slate-400 truncate">{{ k.titulo }}</p>
                <p class="text-lg sm:text-xl font-medium text-slate-900 dark:text-white tabular-nums leading-tight mt-0.5 truncate">{{ k.valor }}</p>
                <p class="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">{{ k.sub }}</p>
              </div>
              <div class="size-8 rounded-lg flex items-center justify-center shrink-0 text-xs" :class="k.cor">
                <i :class="['fa-solid', k.icone]" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ═════════ Lista de parceiros ═════════ -->
      <section :class="cardBase">
        <div class="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-center gap-2 min-w-0">
            <h2 class="text-sm font-medium text-slate-900 dark:text-white">Parceiros</h2>
            <span class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] tabular-nums bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400">{{ naoRemovidos.length }}</span>
            <button
              v-if="qtdRemovidos"
              type="button"
              class="ml-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-normal border transition-colors"
              :class="mostrarRemovidos
                ? 'border-slate-400 dark:border-slate-500 text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/10'
                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5'"
              :aria-pressed="mostrarRemovidos"
              @click="mostrarRemovidos = !mostrarRemovidos"
            >
              <i class="fa-solid text-[10px]" :class="mostrarRemovidos ? 'fa-eye-slash' : 'fa-eye'" aria-hidden="true" />
              {{ mostrarRemovidos ? 'Esconder removidos' : `Mostrar removidos (${qtdRemovidos})` }}
            </button>
          </div>
          <div class="relative w-full sm:w-72">
            <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[11px]" aria-hidden="true" />
            <input
              v-model="busca"
              type="search"
              placeholder="Buscar por nome, e-mail ou telefone…"
              aria-label="Buscar parceiro"
              class="w-full pl-8 pr-3 py-2 bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-full text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
          </div>
        </div>

        <div v-if="!filtrados.length" class="px-5 py-12 text-center">
          <p class="text-slate-500 dark:text-slate-400 text-sm">{{ busca.trim() ? 'Nenhum parceiro com essa busca' : 'Nenhum parceiro' }}</p>
        </div>

        <template v-else>
          <!-- Cabeçalho das colunas (telas largas) -->
          <div class="hidden lg:flex items-center gap-3 px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-white/[0.02]">
            <span :class="[colHead, 'flex-1 min-w-0 pl-12']">Parceiro</span>
            <span :class="[colHead, 'w-44 shrink-0']">Saldo de créditos</span>
            <span :class="[colHead, 'hidden xl:block w-32 shrink-0']">Clientes</span>
            <span :class="[colHead, 'hidden xl:block w-28 shrink-0']">Último consumo</span>
            <span class="w-[12rem] shrink-0" aria-hidden="true" />
          </div>

          <ul class="divide-y divide-slate-100 dark:divide-slate-800">
            <li v-for="(p, idx) in filtrados" :key="p.id">
              <!-- Linha recolhida -->
              <div
                class="flex items-center gap-3 px-3 sm:px-4 py-3 cursor-pointer transition-colors"
                :class="abertos.has(p.id) ? 'bg-purple-50/40 dark:bg-purple-500/[0.04]' : 'hover:bg-slate-50/80 dark:hover:bg-white/[0.03]'"
                @click="alternar(p.id)"
              >
                <div class="size-9 rounded-full flex items-center justify-center shrink-0" :class="p.ativo ? 'bg-purple-600' : 'bg-slate-400 dark:bg-slate-600'">
                  <span class="text-white text-sm font-medium">{{ p.nome.charAt(0).toUpperCase() }}</span>
                </div>

                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 min-w-0">
                    <p class="text-sm font-medium text-slate-900 dark:text-white truncate">{{ p.nome }}</p>
                    <span
                      v-if="p.removido_em"
                      class="shrink-0 inline-flex px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300"
                      :title="`Parceria removida em ${fmtDataHora(p.removido_em)}`"
                    >Removido</span>
                    <span
                      v-else-if="!p.ativo"
                      class="shrink-0 inline-flex px-1.5 py-0.5 rounded-full text-[10px] bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400"
                    >Suspenso</span>
                  </div>
                  <p class="text-xs text-slate-500 dark:text-slate-400 truncate">{{ p.email || '—' }}</p>
                  <!-- O que não cabe nas colunas desta largura -->
                  <div class="xl:hidden mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <span class="lg:hidden inline-flex items-center gap-1.5">
                      <span :class="pill30"><span class="opacity-75">30 dias</span><span class="tabular-nums font-medium">{{ p.saldos.mensal_30d }}</span></span>
                      <span :class="pill12"><span class="opacity-75">12 meses</span><span class="tabular-nums font-medium">{{ p.saldos.anual_12m }}</span></span>
                    </span>
                    <span class="tabular-nums whitespace-nowrap">
                      <span class="text-emerald-600 dark:text-emerald-400">{{ p.clientes_ativos }}</span> ativos
                      · <span :class="p.clientes_vencidos ? 'text-red-600 dark:text-red-400' : ''">{{ p.clientes_vencidos }}</span> venc.
                      · <span :class="p.clientes_bloqueados ? 'text-orange-600 dark:text-orange-400' : ''">{{ p.clientes_bloqueados }}</span> bloq.
                    </span>
                    <span v-if="p.ultimo_consumo_em" class="tabular-nums whitespace-nowrap">último consumo {{ fmtDataHora(p.ultimo_consumo_em) }}</span>
                  </div>
                </div>

                <div class="hidden lg:flex w-44 shrink-0 items-center gap-1.5">
                  <span :class="pill30" title="Créditos de 30 dias"><span class="opacity-75">30 dias</span><span class="tabular-nums font-medium">{{ p.saldos.mensal_30d }}</span></span>
                  <span :class="pill12" title="Créditos de 12 meses"><span class="opacity-75">12 meses</span><span class="tabular-nums font-medium">{{ p.saldos.anual_12m }}</span></span>
                </div>

                <div
                  class="hidden xl:block w-32 shrink-0 text-xs tabular-nums"
                  :title="`${p.clientes_total} clientes: ${p.clientes_ativos} ativos, ${p.clientes_vencidos} vencidos, ${p.clientes_bloqueados} bloqueados`"
                >
                  <p class="text-slate-700 dark:text-slate-200">
                    <span class="text-emerald-600 dark:text-emerald-400">{{ p.clientes_ativos }}</span> ativos
                    <span class="text-slate-400">de {{ p.clientes_total }}</span>
                  </p>
                  <p class="text-[11px] text-slate-500 dark:text-slate-400">
                    <span :class="p.clientes_vencidos ? 'text-red-600 dark:text-red-400' : ''">{{ p.clientes_vencidos }}</span> venc.
                    · <span :class="p.clientes_bloqueados ? 'text-orange-600 dark:text-orange-400' : ''">{{ p.clientes_bloqueados }}</span> bloq.
                  </p>
                </div>

                <div class="hidden xl:block w-28 shrink-0 text-xs tabular-nums text-slate-600 dark:text-slate-400">
                  {{ p.ultimo_consumo_em ? fmtDataHora(p.ultimo_consumo_em) : '—' }}
                </div>

                <button
                  type="button"
                  class="shrink-0 inline-flex items-center justify-center gap-1.5 h-8 w-8 lg:w-[6.5rem] rounded-md text-xs font-normal bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                  :aria-label="`Lançar créditos para ${p.nome}`"
                  title="Lançar créditos"
                  @click.stop="abrirCreditos(p)"
                >
                  <i class="fa-solid fa-plus text-[10px]" aria-hidden="true" />
                  <span class="hidden lg:inline">Créditos</span>
                </button>

                <button
                  type="button"
                  class="size-8 shrink-0 rounded-md flex items-center justify-center text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                  :aria-expanded="abertos.has(p.id)"
                  :aria-label="abertos.has(p.id) ? `Recolher ${p.nome}` : `Expandir ${p.nome}`"
                  @click.stop="alternar(p.id)"
                >
                  <i class="fa-solid fa-chevron-down text-xs transition-transform duration-200" :class="{ 'rotate-180': abertos.has(p.id) }" aria-hidden="true" />
                </button>

                <div class="relative shrink-0" data-menu-parceiro @click.stop>
                  <button
                    type="button"
                    class="size-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                    :class="{ 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-200': menuAberto === p.id }"
                    aria-haspopup="menu"
                    :aria-expanded="menuAberto === p.id"
                    :aria-label="`Ações de ${p.nome}`"
                    @click="alternarMenu(p.id)"
                  >
                    <i class="fa-solid fa-ellipsis-vertical text-sm" aria-hidden="true" />
                  </button>
                  <div
                    v-if="menuAberto === p.id"
                    role="menu"
                    class="absolute right-0 z-30 w-60 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg shadow-slate-900/10 dark:shadow-black/40"
                    :class="idx >= filtrados.length - 2 && filtrados.length > 3 ? 'bottom-full mb-1' : 'top-full mt-1'"
                  >
                    <button type="button" role="menuitem" :class="[itemMenu, 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800']" @click="acaoMenu(() => abrirCreditos(p))">
                      <i class="fa-solid fa-plus w-4 text-center text-xs text-emerald-500" aria-hidden="true" />
                      Lançar créditos
                    </button>
                    <button type="button" role="menuitem" :class="[itemMenu, 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800']" @click="abrirTermos(p)">
                      <i class="fa-solid fa-file-signature w-4 text-center text-xs text-purple-500" aria-hidden="true" />
                      Termo do Parceiro (aceite)
                    </button>
                    <button type="button" role="menuitem" :class="[itemMenu, 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800']" @click="acaoMenu(() => emit('editar', p))">
                      <i class="fa-solid fa-pen-to-square w-4 text-center text-xs text-blue-500" aria-hidden="true" />
                      Editar cadastro
                    </button>
                    <button type="button" role="menuitem" :class="[itemMenu, 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800']" @click="acaoMenu(() => emit('suspender', p))">
                      <i class="fa-solid w-4 text-center text-xs" :class="p.ativo ? 'fa-lock text-amber-500' : 'fa-lock-open text-emerald-500'" aria-hidden="true" />
                      {{ p.ativo ? 'Suspender parceiro' : p.removido_em ? 'Reativar parceria' : 'Reativar parceiro' }}
                    </button>
                    <div class="my-1 border-t border-slate-100 dark:border-slate-800" role="separator" />
                    <button v-if="!p.removido_em" type="button" role="menuitem" :class="[itemMenu, 'text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10']" @click="abrirRemocao(p)">
                      <i class="fa-solid fa-user-minus w-4 text-center text-xs" aria-hidden="true" />
                      Remover parceria
                    </button>
                    <button type="button" role="menuitem" :class="[itemMenu, 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10']" @click="acaoMenu(() => emit('excluir', p))">
                      <i class="fa-solid fa-trash w-4 text-center text-xs" aria-hidden="true" />
                      Excluir definitivamente
                    </button>
                  </div>
                </div>
              </div>

              <!-- ═════════ Linha aberta ═════════ -->
              <div v-if="abertos.has(p.id)" class="border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 px-3 sm:px-4 py-4 space-y-4">

                <!-- Contato e saldo -->
                <dl class="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3">
                  <div class="min-w-0">
                    <dt class="text-[11px] text-slate-500 dark:text-slate-400">E-mail</dt>
                    <dd class="text-sm text-slate-800 dark:text-slate-200 truncate">{{ p.email || '—' }}</dd>
                  </div>
                  <div class="min-w-0">
                    <dt class="text-[11px] text-slate-500 dark:text-slate-400">Telefone</dt>
                    <dd class="text-sm tabular-nums min-w-0">
                      <a
                        v-if="p.telefone && whatsappLink(p.telefone)"
                        :href="whatsappLink(p.telefone) || undefined"
                        target="_blank"
                        rel="noopener"
                        class="inline-flex items-center gap-1 text-slate-800 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 max-w-full truncate"
                      >
                        <i class="fa-brands fa-whatsapp text-emerald-500" aria-hidden="true" />
                        {{ formatPhoneSemDdiBrasil(p.telefone) }}
                      </a>
                      <span v-else class="text-slate-800 dark:text-slate-200">{{ p.telefone || '—' }}</span>
                    </dd>
                  </div>
                  <div class="min-w-0">
                    <dt class="text-[11px] text-slate-500 dark:text-slate-400">Saldo de créditos</dt>
                    <dd class="text-sm tabular-nums text-slate-800 dark:text-slate-200">{{ p.saldos.mensal_30d }} × 30 dias · {{ p.saldos.anual_12m }} × 12 meses</dd>
                  </div>
                  <div class="min-w-0">
                    <dt class="text-[11px] text-slate-500 dark:text-slate-400">Último consumo</dt>
                    <dd class="text-sm tabular-nums text-slate-800 dark:text-slate-200">{{ p.ultimo_consumo_em ? fmtDataHora(p.ultimo_consumo_em) : '—' }}</dd>
                  </div>
                </dl>

                <!-- Clientes vinculados -->
                <div :class="painelBase">
                  <div class="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                    <p :class="tituloPainel">Clientes vinculados</p>
                    <span v-if="p.clientes.length" class="text-[11px] text-slate-400 tabular-nums">{{ p.clientes.length }}</span>
                  </div>
                  <p v-if="p.clientes.length === 0" class="px-4 py-3 text-xs text-slate-400">Nenhum cliente vinculado.</p>
                  <!-- Carteira grande não pode empurrar a página inteira: rola por dentro. -->
                  <ul v-else class="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    <li
                      v-for="c in p.clientes"
                      :key="c.vinculo_id"
                      class="px-4 py-2 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1.5"
                    >
                      <div class="min-w-0 flex-1 basis-full sm:basis-auto">
                        <p class="text-sm text-slate-900 dark:text-white truncate">{{ c.empresa_nome }}</p>
                        <p class="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                          Vinculado em {{ fmtData(c.vinculado_em) }} · vence {{ fmtData(c.vencimento) }}
                        </p>
                      </div>
                      <span class="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap" :class="SITUACOES[c.situacao]?.cls">
                        {{ SITUACOES[c.situacao]?.label }}
                      </span>
                      <!-- Quem cobra o cliente. O clique abre a confirmação. -->
                      <button
                        type="button"
                        class="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors whitespace-nowrap"
                        :class="c.cobranca_agzap
                          ? 'bg-slate-200 dark:bg-slate-600/40 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600/60'
                          : 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-500/25'"
                        :title="c.cobranca_agzap
                          ? 'Quem cobra: Agzap. O cliente paga direto à Agzap; o parceiro não renova nem gasta crédito com ele. Clique para trocar (pede confirmação).'
                          : 'Quem cobra: o parceiro. Ele renova este cliente com os créditos dele. Clique para trocar (pede confirmação).'"
                        :aria-label="`Quem cobra ${c.empresa_nome}: ${c.cobranca_agzap ? 'Cobrança Agzap' : 'Crédito do parceiro'}. Trocar`"
                        @click="abrirCobranca(c, p)"
                      >
                        {{ c.cobranca_agzap ? 'Cobrança Agzap' : 'Crédito do parceiro' }}
                        <i class="fa-solid fa-arrow-right-arrow-left text-[8px] opacity-60" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        class="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-normal whitespace-nowrap border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                        title="Cortesia da Agzap: renova sem gastar crédito do parceiro e sem gerar desconto de indicação."
                        :aria-label="`Renovar ${c.empresa_nome} pela Agzap`"
                        @click="abrirCortesia(c, p)"
                      >
                        <i class="fa-solid fa-gift text-[9px]" aria-hidden="true" />
                        Renovar pela Agzap
                      </button>
                    </li>
                  </ul>
                </div>

                <!-- Movimentações e renovações -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div :class="[painelBase, 'min-w-0']">
                    <div class="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                      <p :class="tituloPainel">Movimentações de crédito</p>
                      <span v-if="totalMovs(p.id) > 0" class="text-[11px] text-slate-400 tabular-nums">
                        {{ totalMovs(p.id) > LIMITE_LISTA ? `${LIMITE_LISTA} de ${totalMovs(p.id)}` : totalMovs(p.id) }}
                      </span>
                    </div>
                    <p v-if="movsDoParceiro(p.id).length === 0" class="px-4 py-3 text-xs text-slate-400">Nenhuma movimentação.</p>
                    <!-- Rola por dentro: com o histórico crescendo, a linha do parceiro
                         empurrava o resto da página para fora da tela. -->
                    <ul v-else class="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      <li v-for="m in movsDoParceiro(p.id)" :key="m.id" class="px-4 py-2 text-xs">
                        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span
                            class="font-medium tabular-nums w-8 shrink-0"
                            :class="m.quantidade > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'"
                          >{{ m.quantidade > 0 ? '+' : '' }}{{ m.quantidade }}</span>
                          <span class="text-slate-700 dark:text-slate-300">{{ OPERACOES[m.operacao] ?? m.operacao }}</span>
                          <!-- Pago ou cortesia: sem isso, "+5 Concessão" e "+2 Compra"
                               ficavam iguais na varredura, e é justamente a diferença
                               entre dinheiro que entrou e crédito dado. -->
                          <span
                            v-if="origemCredito(m.operacao, m.quantidade, m.valor_pago)"
                            class="px-1.5 py-0.5 rounded text-[9px] font-medium inline-flex items-center gap-1 whitespace-nowrap"
                            :class="origemCredito(m.operacao, m.quantidade, m.valor_pago)!.cls"
                          >
                            <i class="fa-solid text-[8px]" :class="origemCredito(m.operacao, m.quantidade, m.valor_pago)!.icone" aria-hidden="true" />
                            {{ origemCredito(m.operacao, m.quantidade, m.valor_pago)!.texto }}
                          </span>
                          <span class="text-slate-400">{{ LABEL_TIPO[m.tipo_credito] }}</span>
                          <span class="ml-auto text-slate-400 tabular-nums">{{ fmtData(m.created_at) }}</span>
                        </div>
                        <p v-if="m.empresa_nome || m.valor_pago" class="mt-0.5 pl-10 text-[11px] text-slate-500 dark:text-slate-400 break-words">
                          <span v-if="m.empresa_nome">{{ m.empresa_nome }}</span>
                          <span v-if="m.valor_pago" class="tabular-nums"><template v-if="m.empresa_nome"> · </template>{{ fmtBRL(m.valor_pago) }}</span>
                        </p>
                        <!-- Justificativa: é obrigatória na correção e some da tela se não
                             for renderizada — sem ela, um estorno vira número sem motivo. -->
                        <p v-if="m.descricao || m.referencia" class="mt-0.5 pl-10 text-[11px] text-slate-500 dark:text-slate-400 leading-snug break-words">
                          <i class="fa-solid fa-quote-left text-[8px] text-slate-300 dark:text-slate-600 mr-1" aria-hidden="true" />
                          <span v-if="m.descricao">{{ m.descricao }}</span>
                          <span v-if="m.referencia" class="text-slate-400"><template v-if="m.descricao"> · </template>ref: {{ m.referencia }}</span>
                        </p>
                      </li>
                    </ul>
                  </div>

                  <div :class="[painelBase, 'min-w-0']">
                    <div class="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                      <p :class="tituloPainel">Renovações</p>
                      <span v-if="totalRenovs(p.id) > 0" class="text-[11px] text-slate-400 tabular-nums">
                        {{ totalRenovs(p.id) > LIMITE_LISTA ? `${LIMITE_LISTA} de ${totalRenovs(p.id)}` : totalRenovs(p.id) }}
                      </span>
                    </div>
                    <p v-if="renovsDoParceiro(p.id).length === 0" class="px-4 py-3 text-xs text-slate-400">Nenhuma renovação.</p>
                    <ul v-else class="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      <li
                        v-for="r in renovsDoParceiro(p.id)"
                        :key="r.id"
                        class="px-4 py-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
                      >
                        <span
                          class="px-1.5 py-0.5 rounded text-[9px] font-medium uppercase shrink-0"
                          :class="r.origem === 'admin'
                            ? 'bg-slate-200 dark:bg-slate-600/40 text-slate-600 dark:text-slate-300'
                            : 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400'"
                        >{{ r.origem === 'admin' ? 'Agzap' : 'Parceiro' }}</span>
                        <span class="text-slate-700 dark:text-slate-300 truncate min-w-0 flex-1">{{ r.empresa_nome ?? '—' }}</span>
                        <span v-if="!r.consumiu_credito" class="text-slate-400 shrink-0">sem crédito</span>
                        <span class="text-slate-400 tabular-nums shrink-0">até {{ fmtData(r.vencimento_novo) }}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </li>
          </ul>
        </template>
      </section>
    </template>

    <!-- ══════════════ Modal: aceite do Termo do Parceiro ══════════════ -->
    <AdminParceiroTermosModal :show="!!alvoTermos" :parceiro="alvoTermos" @close="alvoTermos = null" />

    <!-- ══════════════ Modal: quem cobra o cliente (confirmação) ══════════════ -->
    <AdminCobrancaAgzapModal
      :show="!!alvoCobranca"
      :cliente="alvoCobranca?.cliente ?? null"
      :parceiro-nome="alvoCobranca?.parceiroNome"
      @close="alvoCobranca = null"
      @salvo="aposCobranca"
    />

    <!-- ══════════════ Modal: renovar pela Agzap (cortesia) ══════════════ -->
    <AdminRenovarCortesiaModal
      :show="!!alvoCortesia"
      :cliente="alvoCortesia?.cliente ?? null"
      :parceiro-nome="alvoCortesia?.parceiroNome"
      @close="alvoCortesia = null"
      @renovado="aposCortesia"
    />

    <!-- ══════════════ Modal: remover parceria ══════════════ -->
    <AdminRemoverPapelModal
      :show="!!alvoRemocao"
      tipo="parceria"
      :parceiro-id="alvoRemocao?.id"
      :nome="alvoRemocao?.nome"
      @close="alvoRemocao = null"
      @removido="aposRemocao"
    />

    <!-- ══════════════ Modal: lançar créditos ══════════════ -->
    <!-- Largo e baixo de propósito: cabe inteiro numa tela de notebook (~768 px)
         sem rolagem interna. No celular as grades viram uma coluna. -->
    <BaseModal :show="showCreditos" title="Lançar créditos" max-width="max-w-2xl" @close="showCreditos = false">
      <div v-if="alvoCredito" class="space-y-4">
        <!-- Parceiro + saldo atual (o tipo escolhido fica destacado) -->
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div class="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center shrink-0">
            <span class="text-white font-medium text-sm">{{ alvoCredito.nome.charAt(0).toUpperCase() }}</span>
          </div>
          <p class="flex-1 min-w-[8rem] text-sm font-medium text-slate-900 dark:text-white truncate">{{ alvoCredito.nome }}</p>
          <div class="flex items-center gap-1.5 text-xs tabular-nums">
            <span class="text-slate-500 dark:text-slate-400">Saldo</span>
            <span
              class="px-2 py-0.5 rounded-full transition-colors"
              :class="formTipo === 'mensal_30d'
                ? 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300'
                : 'bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300'"
            >30 dias: {{ alvoCredito.saldos.mensal_30d }}</span>
            <span
              class="px-2 py-0.5 rounded-full transition-colors"
              :class="formTipo === 'anual_12m'
                ? 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300'
                : 'bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300'"
            >12 meses: {{ alvoCredito.saldos.anual_12m }}</span>
          </div>
        </div>

        <!-- Linha 1: tipo · operação · quantidade -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
          <div>
            <span id="lc-tipo-rotulo" class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Tipo</span>
            <div role="radiogroup" aria-labelledby="lc-tipo-rotulo" class="grid grid-cols-2 gap-1 h-10 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10">
              <button
                type="button"
                role="radio"
                :aria-checked="formTipo === 'mensal_30d'"
                @click="formTipo = 'mensal_30d'"
                class="rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                :class="formTipo === 'mensal_30d'
                  ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white font-medium shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
              >30 dias</button>
              <button
                type="button"
                role="radio"
                :aria-checked="formTipo === 'anual_12m'"
                @click="formTipo = 'anual_12m'"
                class="rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                :class="formTipo === 'anual_12m'
                  ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white font-medium shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
              >12 meses</button>
            </div>
          </div>
          <div>
            <label for="lc-operacao" class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Operação</label>
            <div class="relative">
              <select id="lc-operacao" v-model="formOperacao" class="w-full h-10 pl-3 pr-9 appearance-none bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white dark:[&>option]:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 transition-colors">
                <option value="compra">Compra paga</option>
                <option value="concessao_admin">Concessão (cortesia)</option>
                <option value="correcao">Correção</option>
              </select>
              <i class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none" aria-hidden="true" />
            </div>
          </div>
          <div>
            <label for="lc-quantidade" class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Quantidade</label>
            <input
              id="lc-quantidade"
              v-model.number="formQuantidade"
              type="number"
              step="1"
              :min="formOperacao === 'correcao' ? undefined : 1"
              placeholder="Ex.: 10"
              class="w-full h-10 px-3 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 transition-colors"
            />
            <p v-if="formOperacao === 'correcao'" class="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Use negativo para retirar</p>
          </div>
        </div>

        <!-- Linha 2 (compra): referência · desconto · valor pago + a conta da tabela -->
        <div v-if="formOperacao === 'compra'" class="space-y-2.5">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
            <div>
              <label for="lc-referencia" class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Referência do pedido</label>
              <input id="lc-referencia" v-model="formReferencia" type="text" maxlength="120" placeholder="Ex.: PIX 12/08"
                class="w-full h-10 px-3 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 transition-colors" />
            </div>
            <div>
              <label for="lc-desconto" class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                Desconto <span class="font-normal text-slate-400 dark:text-slate-500">(opcional)</span>
              </label>
              <AppCurrencyInput
                id="lc-desconto"
                v-model="formDesconto"
                placeholder="R$ 0,00"
                class="w-full h-10 px-3 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 transition-colors"
              />
            </div>
            <div>
              <label for="lc-valor-pago" class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Valor pago</label>
              <AppCurrencyInput
                id="lc-valor-pago"
                v-model="formValorPago"
                placeholder="R$ 0,00"
                class="w-full h-10 px-3 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 transition-colors"
              />
              <p class="mt-1 text-[11px] text-slate-400 dark:text-slate-500">É o que entra nas métricas</p>
            </div>
          </div>

          <!-- Tabela da faixa + a conta na cara: tabela − desconto = cobrado.
               Editar desconto ou valor pago reescreve o outro. -->
          <div v-if="precoSugerido" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/[0.03] text-xs tabular-nums">
            <span class="text-slate-500 dark:text-slate-400">
              Tabela: {{ fmtBRL(precoSugerido.unitario) }} por licença ·
              <strong class="font-medium text-slate-700 dark:text-slate-200">{{ fmtBRL(precoSugerido.total) }}</strong> no total
            </span>
            <span v-if="totalTabela > 0" class="flex flex-wrap items-center gap-x-1.5">
              <span class="text-slate-400 line-through">{{ fmtBRL(totalTabela) }}</span>
              <template v-if="descontoAplicado > 0">
                <span class="text-red-600 dark:text-red-400">− {{ fmtBRL(descontoAplicado) }}</span>
                <span class="text-slate-400">({{ percentualDesconto.toFixed(1).replace('.', ',') }}% off)</span>
              </template>
              <span class="text-slate-400">=</span>
              <strong class="font-medium text-emerald-600 dark:text-emerald-400">{{ fmtBRL(formValorPago ?? 0) }}</strong>
              <span v-if="formQuantidade" class="text-slate-400">
                · {{ fmtBRL((formValorPago ?? 0) / Math.abs(formQuantidade)) }} por licença
              </span>
            </span>
          </div>
        </div>

        <!-- Retirada e estorno são decisões diferentes: remover saldo não pode
             virar devolução de dinheiro por acidente. -->
        <div v-else-if="formOperacao === 'correcao' && (formQuantidade ?? 0) < 0" class="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
          <label
            class="flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2.5 cursor-pointer"
            :class="formHouveReembolso ? '' : 'sm:col-span-2'"
          >
            <input v-model="formHouveReembolso" type="checkbox" class="mt-0.5 rounded border-slate-300 text-red-600 focus:ring-red-500" />
            <span>
              <strong class="block text-xs font-medium text-slate-800 dark:text-slate-200">Houve devolução de dinheiro ao parceiro</strong>
              <span class="block mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Deixe desmarcado para apenas retirar créditos do saldo, sem alterar receita ou caixa.
              </span>
            </span>
          </label>

          <div v-if="formHouveReembolso">
            <label for="lc-devolvido" class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              Valor total devolvido ao parceiro <span class="font-normal text-red-500">— obrigatório</span>
            </label>
            <AppCurrencyInput
              id="lc-devolvido"
              v-model="formValorPago"
              placeholder="R$ 0,00"
              class="w-full h-10 px-3 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 tabular-nums focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500 transition-colors"
            />
            <p v-if="Number(formValorPago) > 0 && formQuantidade" class="mt-1 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              {{ fmtBRL(formValorPago) }} no total ÷ {{ Math.abs(formQuantidade) }} crédito<span v-if="Math.abs(formQuantidade) !== 1">s</span>
              = <strong class="font-medium text-red-600 dark:text-red-400">{{ fmtBRL(Number(formValorPago) / Math.abs(formQuantidade)) }} por crédito</strong>
            </p>
          </div>
        </div>

        <div>
          <label for="lc-observacao" class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
            Observação
            <span v-if="formOperacao === 'correcao'" class="font-normal text-red-500">— obrigatória na correção</span>
          </label>
          <input id="lc-observacao" v-model="formDescricao" type="text" maxlength="300" placeholder="Fica registrado na auditoria"
            class="w-full h-10 px-3 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 transition-colors" />
        </div>

        <div class="space-y-3">
          <p class="flex items-start gap-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            <i class="fa-solid fa-circle-info text-slate-400 mt-px" aria-hidden="true" />
            <span>
              O lançamento é imutável. Para desfazer, use uma <strong class="font-medium text-slate-600 dark:text-slate-300">correção</strong> com quantidade negativa —
              o lançamento original permanece no histórico.
            </span>
          </p>

          <div class="flex flex-col gap-3 pt-4 border-t border-slate-200 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <!-- Resumo ao vivo: só exibe o que já está no formulário, sem regra nova. -->
            <p class="min-w-0 text-sm tabular-nums text-slate-500 dark:text-slate-400" aria-live="polite">
              <template v-if="formQuantidade">
                <span class="text-slate-900 dark:text-white">{{ formQuantidade > 0 ? '+' : '−' }}{{ plural(Math.abs(formQuantidade), 'crédito', 'créditos') }}</span>
                de {{ formTipo === 'anual_12m' ? '12 meses' : '30 dias' }}
                <template v-if="formOperacao === 'compra'"> · {{ fmtBRL(formValorPago ?? 0) }}</template>
                <template v-else-if="formOperacao === 'concessao_admin'"> · cortesia</template>
                <template v-else-if="formQuantidade < 0"> · {{ formHouveReembolso ? `${fmtBRL(formValorPago ?? 0)} devolvido` : 'sem devolução' }}</template>
              </template>
              <template v-else>Informe a quantidade</template>
            </p>
            <div class="flex gap-2 shrink-0">
              <button type="button" @click="showCreditos = false" :disabled="salvandoCredito"
                class="flex-1 sm:flex-none h-10 px-4 rounded-xl font-medium text-sm border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.05] disabled:opacity-50 transition-colors">
                Cancelar
              </button>
              <button type="button" @click="salvarCredito" :disabled="!podeSalvarCredito || salvandoCredito"
                class="flex-1 sm:flex-none h-10 px-5 rounded-xl font-medium text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors inline-flex items-center justify-center gap-2">
                <i :class="['fa-solid', salvandoCredito ? 'fa-circle-notch fa-spin' : 'fa-check', 'text-xs']" aria-hidden="true" />
                {{ salvandoCredito ? 'Lançando…' : 'Lançar' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </BaseModal>

  </div>
</template>
