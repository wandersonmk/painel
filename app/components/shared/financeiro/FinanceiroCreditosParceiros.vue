<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

/**
 * Bloco de controle do programa de parceiros dentro do /financeiro.
 *
 * Responde o que o extrato solto não respondia: quanto entrou de venda de
 * crédito, quanto saiu em estorno **e por quê**, quem consumiu crédito e com
 * qual cliente, e quanto de crédito já pago ainda não virou entrega.
 */

interface Movimentacao {
  id: string
  data: string
  parceiro_id: string
  parceiro_nome: string
  tipo_credito: 'mensal_30d' | 'anual_12m'
  quantidade: number
  operacao: string
  empresa_id: string | null
  empresa_nome: string | null
  referencia: string | null
  valor_pago: number | null
  motivo: string | null
  criado_por_papel: string
  renovacao_id?: string | null
  renovou_de?: string | null
  renovou_ate?: string | null
}

interface LinhaParceiro {
  id: string
  nome: string
  ativo: boolean
  vendido_periodo: number
  estornado_periodo: number
  liquido_periodo: number
  passivo_pago: number
  passivo_cortesia: number
  passivo_estimado: number
  saldo_pago: number
  saldo_cortesia: number
  creditos_comprados_periodo: number
  creditos_concedidos_periodo: number
  creditos_estornados_periodo: number
  creditos_retirados_periodo: number
  creditos_consumidos_periodo: number
  saldo: { mensal_30d: number; anual_12m: number }
  saldo_total: number
  clientes_total: number
  clientes_vencendo_7d: number
  clientes_vencidos: number
  ultimo_consumo_periodo_em: string | null
}

interface ClienteVencendo {
  parceiro_nome: string
  empresa_nome: string
  vencimento: string | null
  dias_restantes: number | null
  bloqueio_origem: string | null
  cobranca_agzap: boolean
  ultima_renovacao_em: string | null
}

const loading = ref(true)
const erro = ref<string | null>(null)
const resumo = ref<any>(null)
const porParceiro = ref<LinhaParceiro[]>([])
const vendas = ref<Movimentacao[]>([])
const estornos = ref<Movimentacao[]>([])
const ajustesPositivos = ref<Movimentacao[]>([])
const concessoes = ref<Movimentacao[]>([])
const consumos = ref<Movimentacao[]>([])
const vencendo = ref<ClienteVencendo[]>([])

const aba = ref<'vendas' | 'estornos' | 'concessoes' | 'consumo' | 'vencendo'>('vendas')
const filtroParceiro = ref('')
type Periodo = 'hoje' | '7d' | '30d' | 'custom'
const periodo = ref<Periodo>('30d')
const dataInicio = ref('')
const dataFim = ref('')

const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Dias de calendário no horário local, igual ao relatório do parceiro. */
function intervalo(): { de: Date; ate: Date } {
  const fim = new Date()
  fim.setHours(23, 59, 59, 999)

  if (periodo.value === 'custom' && dataInicio.value && dataFim.value) {
    const [ay, am, ad] = dataInicio.value.split('-').map(Number)
    const [by, bm, bd] = dataFim.value.split('-').map(Number)
    return {
      de: new Date(ay!, (am ?? 1) - 1, ad ?? 1, 0, 0, 0, 0),
      ate: new Date(by!, (bm ?? 1) - 1, bd ?? 1, 23, 59, 59, 999),
    }
  }

  const inicio = new Date()
  inicio.setHours(0, 0, 0, 0)
  if (periodo.value === '7d') inicio.setDate(inicio.getDate() - 6)
  if (periodo.value === '30d') inicio.setDate(inicio.getDate() - 29)
  return { de: inicio, ate: fim }
}

async function carregar() {
  loading.value = true
  erro.value = null
  try {
    const { de, ate } = intervalo()
    const resp = await $fetch<{ success: boolean; data?: any; error?: string }>(
      '/api/admin/parceiros/financeiro',
      {
        query: { de: de.toISOString(), ate: ate.toISOString() },
        headers: await useAdminAuthHeaders(),
      },
    )
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Erro')
    resumo.value = resp.data.resumo
    porParceiro.value = resp.data.porParceiro
    vendas.value = resp.data.vendas
    estornos.value = resp.data.estornos
    ajustesPositivos.value = resp.data.ajustesPositivos
    concessoes.value = resp.data.concessoes
    consumos.value = resp.data.consumos
    vencendo.value = resp.data.vencendo
  } catch (e: any) {
    erro.value = e?.data?.statusMessage || e?.message || 'Erro ao carregar o financeiro de parceiros'
  } finally {
    loading.value = false
  }
}

function trocarPeriodo(novo: Periodo) {
  periodo.value = novo
  if (novo === 'custom') {
    if (!dataInicio.value) {
      const inicio = new Date()
      inicio.setDate(inicio.getDate() - 29)
      dataInicio.value = isoDia(inicio)
    }
    if (!dataFim.value) dataFim.value = isoDia(new Date())
  }
  pagina.value = 1
  paginaAjustes.value = 1
  carregar()
}

const filtroAtivo = computed(() => periodo.value !== 'hoje' || filtroParceiro.value !== '')
function limparFiltros() {
  periodo.value = 'hoje'
  dataInicio.value = ''
  dataFim.value = ''
  filtroParceiro.value = ''
  carregar()
}

function aplicarPeriodo() {
  pagina.value = 1
  paginaAjustes.value = 1
  carregar()
}

onMounted(carregar)
defineExpose({ carregar })

const fmtBRL = (v: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v ?? 0))
const fmtData = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'
const fmtDataHora = (s: string | null) =>
  s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

const rotuloPeriodo = computed(() => {
  const { de, ate } = intervalo()
  if (periodo.value === 'hoje') return 'hoje'
  return `${de.toLocaleDateString('pt-BR')} a ${ate.toLocaleDateString('pt-BR')}`
})

const LABEL_TIPO: Record<string, string> = { mensal_30d: '30 dias', anual_12m: '12 meses' }

const parceirosDisponiveis = computed(() => porParceiro.value.map(p => ({ id: p.id, nome: p.nome })))
const filtrar = (ls: Movimentacao[]) =>
  filtroParceiro.value ? ls.filter(l => l.parceiro_id === filtroParceiro.value) : ls

const vendasFiltradas = computed(() => filtrar(vendas.value))
const estornosFiltrados = computed(() => filtrar(estornos.value))
const ajustesFiltrados = computed(() => filtrar(ajustesPositivos.value))
const concessoesFiltradas = computed(() => filtrar(concessoes.value))
const consumosFiltrados = computed(() => filtrar(consumos.value))
const vencendoFiltrado = computed(() => {
  if (!filtroParceiro.value) return vencendo.value
  const nome = porParceiro.value.find(p => p.id === filtroParceiro.value)?.nome
  return vencendo.value.filter(c => c.parceiro_nome === nome)
})

// Faixa de métricas: rótulo curto em cima, valor grande, detalhe truncado com
// o texto inteiro no title. Card com ícone grande não cabia seis lado a lado.
const metricas = computed(() => {
  const r = resumo.value
  if (!r) return []
  return [
    {
      rotulo: 'Vendido no período', icone: 'fa-cart-shopping', cls: 'text-emerald-600 dark:text-emerald-400',
      valor: fmtBRL(r.vendido_periodo),
      detalhe: `${r.creditos_vendidos_periodo} créditos · ${rotuloPeriodo.value}`,
    },
    {
      rotulo: 'Estornado no período', icone: 'fa-rotate-left', cls: 'text-red-600 dark:text-red-400',
      valor: fmtBRL(r.estornado_periodo),
      detalhe: `${r.creditos_estornados_periodo} créditos estornados`,
      alerta: r.estornado_periodo > 0,
    },
    {
      rotulo: 'Líquido no período', icone: 'fa-scale-balanced', cls: 'text-indigo-600 dark:text-indigo-400',
      valor: fmtBRL(r.liquido_periodo),
      detalhe: `Ticket médio ${fmtBRL(r.ticket_medio_credito)}/crédito`,
    },
    {
      rotulo: 'Pago, ainda não usado', icone: 'fa-vault', cls: 'text-emerald-600 dark:text-emerald-400',
      valor: fmtBRL(r.passivo_pago),
      detalhe: `${r.saldo_pago} créditos na carteira · posição atual`,
    },
    {
      rotulo: 'Cortesia não usada', icone: 'fa-gift', cls: 'text-orange-600 dark:text-orange-400',
      valor: fmtBRL(r.passivo_cortesia),
      detalhe: `${r.saldo_cortesia} créditos na carteira · posição atual`,
      alerta: r.passivo_cortesia > r.passivo_pago,
    },
    {
      rotulo: 'Consumido no período', icone: 'fa-fire', cls: 'text-purple-600 dark:text-purple-400',
      valor: String(r.creditos_consumidos_periodo),
      detalhe: `${r.clientes_vencendo_7d} clientes vencendo em 7d · posição atual`,
    },
  ]
})

// ───────── Paginação ─────────
// O ledger só cresce; sem isso a aba de consumo vira uma tabela de mil linhas.
// Paginar em vez de rolar por dentro: a página inteira já rola, e caixa com
// scroll aninhado esconde o que está embaixo.
const TAMANHO_PAGINA = 25
const pagina = ref(1)
const paginaAjustes = ref(1)
watch([aba, filtroParceiro], () => { pagina.value = 1; paginaAjustes.value = 1 })

function fatia<T>(lista: T[], p: number): T[] {
  return lista.slice((p - 1) * TAMANHO_PAGINA, p * TAMANHO_PAGINA)
}

const vendasPagina = computed(() => fatia(vendasFiltradas.value, pagina.value))
const estornosPagina = computed(() => fatia(estornosFiltrados.value, pagina.value))
const ajustesPagina = computed(() => fatia(ajustesFiltrados.value, paginaAjustes.value))
const concessoesPagina = computed(() => fatia(concessoesFiltradas.value, pagina.value))
const consumosPagina = computed(() => fatia(consumosFiltrados.value, pagina.value))
const vencendoPagina = computed(() => fatia(vencendoFiltrado.value, pagina.value))

const ABAS = [
  { id: 'vendas', label: 'Vendas', icone: 'fa-cart-shopping' },
  { id: 'estornos', label: 'Estornos e correções', icone: 'fa-rotate-left' },
  { id: 'concessoes', label: 'Cortesias', icone: 'fa-gift' },
  { id: 'consumo', label: 'Consumo', icone: 'fa-fire' },
  { id: 'vencendo', label: 'Vencendo (atual)', icone: 'fa-hourglass-half' },
] as const

const contagemAba = computed<Record<string, number>>(() => ({
  vendas: vendasFiltradas.value.length,
  estornos: estornosFiltrados.value.length + ajustesFiltrados.value.length,
  concessoes: concessoesFiltradas.value.length,
  consumo: consumosFiltrados.value.length,
  vencendo: vencendoFiltrado.value.length,
}))

function diasCls(d: number | null) {
  if (d === null) return 'bg-slate-100 dark:bg-slate-800 text-slate-500'
  if (d < 0) return 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400'
  if (d === 0) return 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400'
  if (d <= 3) return 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400'
  return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
}
function diasTexto(d: number | null) {
  if (d === null) return '—'
  if (d < 0) return `${Math.abs(d)}d vencido`
  if (d === 0) return 'Vence hoje'
  if (d === 1) return 'Vence amanhã'
  return `${d} dias`
}

const th = 'text-left py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500'
const td = 'py-2 px-3 text-slate-700 dark:text-slate-300'
</script>

<template>
  <section class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
    <!-- Header -->
    <div class="px-3 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-500/15 flex items-center justify-center shrink-0">
          <i class="fa-solid fa-handshake text-purple-600 dark:text-purple-400 text-sm" aria-hidden="true" />
        </div>
        <div class="min-w-0">
          <h2 class="text-sm font-bold text-slate-900 dark:text-white">Créditos de parceiros</h2>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">Venda, estorno e consumo · <span class="capitalize">{{ rotuloPeriodo }}</span></p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <select
          v-model="filtroParceiro"
          class="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-white"
          aria-label="Filtrar por parceiro"
        >
          <option value="">Todos os parceiros</option>
          <option v-for="p in parceirosDisponiveis" :key="p.id" :value="p.id">{{ p.nome }}</option>
        </select>
        <button
          type="button"
          @click="carregar"
          :disabled="loading"
          class="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 transition-colors disabled:opacity-50"
          aria-label="Atualizar"
        >
          <i class="fa-solid fa-arrows-rotate text-xs" :class="{ 'animate-spin': loading }" aria-hidden="true" />
        </button>
      </div>
    </div>

    <!-- Período dos movimentos; saldos e vencimentos continuam sendo atuais. -->
    <div class="px-3 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
      <button
        v-for="p in ([
          { id: 'hoje' as const, label: 'Hoje' },
          { id: '7d' as const, label: '7 dias' },
          { id: '30d' as const, label: '30 dias' },
          { id: 'custom' as const, label: 'Personalizado' },
        ])"
        :key="p.id"
        type="button"
        @click="trocarPeriodo(p.id)"
        class="px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors"
        :class="periodo === p.id
          ? 'border-purple-400 bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400'
          : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300'"
      >{{ p.label }}</button>

      <div v-if="periodo === 'custom'" class="flex flex-wrap items-center gap-2 lg:ml-auto">
        <input
          v-model="dataInicio"
          type="date"
          aria-label="Data inicial"
          class="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-white"
        />
        <span class="text-slate-400 text-xs">até</span>
        <input
          v-model="dataFim"
          type="date"
          aria-label="Data final"
          class="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-white"
        />
        <button
          type="button"
          @click="aplicarPeriodo"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors"
        >Aplicar</button>
      </div>

      <button
        v-if="filtroAtivo"
        type="button"
        @click="limparFiltros"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
        :class="periodo === 'custom' ? '' : 'ml-auto'"
      >
        <i class="fa-solid fa-xmark text-[10px]" aria-hidden="true" />
        Limpar filtros
      </button>
    </div>

    <div v-if="loading && !resumo" class="p-8 flex items-center justify-center gap-3 text-slate-400 text-sm">
      <i class="fa-solid fa-circle-notch animate-spin" aria-hidden="true" />
      Carregando dados dos parceiros…
    </div>

    <div v-else-if="erro" role="alert" class="m-3 sm:m-5 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 text-sm">
      {{ erro }}
    </div>

    <template v-else-if="resumo">
      <!-- Números do período: faixa compacta em vez de seis cards.
           Card com ícone grande roubava largura e truncava o valor. -->
      <div class="m-3 sm:m-5 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 divide-x divide-y sm:divide-y-0 xl:divide-y-0 divide-slate-200 dark:divide-slate-800">
          <div
            v-for="m in metricas"
            :key="m.rotulo"
            class="px-3 py-2.5 min-w-0"
            :class="m.alerta ? 'bg-orange-50/60 dark:bg-orange-500/[0.07]' : ''"
          >
            <p class="text-[10px] font-bold uppercase tracking-wider truncate flex items-center gap-1.5" :class="m.cls">
              <i class="fa-solid text-[9px]" :class="m.icone" aria-hidden="true" />
              {{ m.rotulo }}
            </p>
            <p class="text-lg sm:text-xl font-bold tabular-nums leading-tight mt-0.5 text-slate-900 dark:text-white truncate">
              {{ m.valor }}
            </p>
            <p class="text-[10px] text-slate-400 dark:text-slate-500 truncate" :title="m.detalhe">{{ m.detalhe }}</p>
          </div>
        </div>
      </div>

      <!-- Avisos de controle -->
      <div class="mx-3 sm:mx-5 mb-4 space-y-2">
      <div
        v-if="resumo.creditos_concedidos_periodo > 0 || resumo.renovacoes_sem_credito_periodo > 0"
        class="flex flex-wrap gap-2 text-[11px]"
      >
        <span
          v-if="resumo.creditos_concedidos_periodo > 0"
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 font-semibold"
          title="Créditos liberados sem pagamento dentro do período selecionado"
        >
          <i class="fa-solid fa-gift" aria-hidden="true" />
          {{ resumo.creditos_concedidos_periodo }} créditos de cortesia liberados no período · {{ fmtBRL(resumo.concedido_valor_tabela_periodo) }} a preço de tabela
        </span>
        <span
          v-if="resumo.renovacoes_sem_credito_periodo > 0"
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold"
          title="Renovações feitas pela Agzap em cliente de parceiro — não consumiram crédito"
        >
          <i class="fa-solid fa-circle-info" aria-hidden="true" />
          {{ resumo.renovacoes_sem_credito_periodo }} renovações da Agzap sem consumo de crédito no período
        </span>
      </div>
      <p class="text-[11px] text-slate-400 dark:text-slate-500 flex items-start gap-1.5">
        <i class="fa-solid fa-circle-info text-[10px] mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Os dois cartões acima são o que ainda falta entregar: crédito que está na carteira do
          parceiro e ainda não virou renovação. O <strong>pago</strong> é dinheiro que já entrou e
          vira obrigação sua; a <strong>cortesia</strong> é serviço prometido sem receita nenhuma.
          O saldo é separado por ordem de entrada, e a renovação gasta sempre o crédito mais antigo.
          Esses saldos e a aba <strong>Vencendo</strong> são a posição atual; os demais números obedecem ao período selecionado.
        </span>
      </p>
      </div>

      <!-- Consolidado por parceiro -->
      <div class="px-3 sm:px-5 pb-5">
        <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Por parceiro · movimentos do período</p>
        <div class="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table class="w-full text-xs whitespace-nowrap">
            <thead class="bg-slate-50 dark:bg-slate-950/60">
              <tr>
                <th :class="th">Parceiro</th>
                <th :class="[th, 'text-right']">Vendido</th>
                <th :class="[th, 'text-right']">Estornado</th>
                <th :class="[th, 'text-right']">Líquido</th>
                <th :class="[th, 'text-right']">Cortesia</th>
                <th :class="[th, 'text-right']">Consumidos</th>
                <th :class="[th, 'text-right']">Saldo</th>
                <th :class="[th, 'text-right']">Pago não usado</th>
                <th :class="[th, 'text-right']">Cortesia não usada</th>
                <th :class="[th, 'text-right']">Clientes</th>
                <th :class="[th, 'text-right']">Último consumo no período</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              <tr v-for="p in porParceiro" :key="p.id" class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td :class="td">
                  <div class="flex items-center gap-1.5">
                    <span class="font-semibold text-slate-900 dark:text-white">{{ p.nome }}</span>
                    <span v-if="!p.ativo" class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400">Suspenso</span>
                  </div>
                </td>
                <td :class="[td, 'text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold']">{{ fmtBRL(p.vendido_periodo) }}</td>
                <td :class="[td, 'text-right tabular-nums']" :title="`${p.creditos_estornados_periodo} créditos estornados no período`">
                  <span :class="p.estornado_periodo > 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-400'">
                    {{ p.estornado_periodo > 0 ? '−' + fmtBRL(p.estornado_periodo) : '—' }}
                  </span>
                </td>
                <td :class="[td, 'text-right tabular-nums font-bold text-slate-900 dark:text-white']">{{ fmtBRL(p.liquido_periodo) }}</td>
                <td :class="[td, 'text-right tabular-nums']">
                  <span :class="p.creditos_concedidos_periodo > 0 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-slate-400'">
                    {{ p.creditos_concedidos_periodo || '—' }}
                  </span>
                </td>
                <td :class="[td, 'text-right tabular-nums']">{{ p.creditos_consumidos_periodo }}</td>
                <td :class="[td, 'text-right tabular-nums']" :title="`${p.saldo.mensal_30d} de 30 dias · ${p.saldo.anual_12m} de 12 meses`">
                  <span class="font-semibold text-purple-600 dark:text-purple-400">{{ p.saldo_total }}</span>
                </td>
                <td :class="[td, 'text-right tabular-nums']" :title="`${p.saldo_pago} créditos comprados ainda não usados`">
                  <span :class="p.passivo_pago > 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'">
                    {{ p.passivo_pago > 0 ? fmtBRL(p.passivo_pago) : '—' }}
                  </span>
                </td>
                <td :class="[td, 'text-right tabular-nums']" :title="`${p.saldo_cortesia} créditos de cortesia ainda não usados`">
                  <span :class="p.passivo_cortesia > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400'">
                    {{ p.passivo_cortesia > 0 ? fmtBRL(p.passivo_cortesia) : '—' }}
                  </span>
                </td>
                <td :class="[td, 'text-right tabular-nums']">
                  {{ p.clientes_total }}
                  <span v-if="p.clientes_vencendo_7d" class="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400">{{ p.clientes_vencendo_7d }} vencendo</span>
                  <span v-if="p.clientes_vencidos" class="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400">{{ p.clientes_vencidos }} vencidos</span>
                </td>
                <td :class="[td, 'text-right tabular-nums text-slate-400']">{{ fmtDataHora(p.ultimo_consumo_periodo_em) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Detalhamento -->
      <div class="border-t border-slate-200 dark:border-slate-800">
        <div class="flex gap-1 px-3 sm:px-5 pt-3 overflow-x-auto">
          <button
            v-for="a in ABAS"
            :key="a.id"
            type="button"
            @click="aba = a.id"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5"
            :class="aba === a.id
              ? 'bg-purple-600 text-white'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'"
          >
            <i class="fa-solid" :class="a.icone" aria-hidden="true" />
            {{ a.label }}
            <span
              class="px-1.5 rounded-full text-[10px] tabular-nums"
              :class="aba === a.id ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'"
            >{{ contagemAba[a.id] }}</span>
          </button>
        </div>

        <div class="p-3 sm:p-5">
          <!-- Vendas -->
          <div v-if="aba === 'vendas'">
            <p v-if="!vendasFiltradas.length" class="text-xs text-slate-400 py-4 text-center">Nenhuma venda de crédito registrada.</p>
            <div v-else class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-slate-50 dark:bg-slate-950/60">
                <tr>
                  <th :class="th">Data</th>
                  <th :class="th">Parceiro</th>
                  <th :class="th">Crédito</th>
                  <th :class="[th, 'text-right']">Qtd.</th>
                  <th :class="[th, 'text-right']">Valor</th>
                  <th :class="[th, 'text-right']">Unitário</th>
                  <th :class="th">Referência</th>
                  <th :class="th">Observação</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                <tr v-for="v in vendasPagina" :key="v.id">
                  <td :class="[td, 'tabular-nums text-slate-400 whitespace-nowrap']">{{ fmtData(v.data) }}</td>
                  <td :class="[td, 'font-medium text-slate-900 dark:text-white']">{{ v.parceiro_nome }}</td>
                  <td :class="[td, 'text-slate-500']">{{ LABEL_TIPO[v.tipo_credito] }}</td>
                  <td :class="[td, 'text-right tabular-nums font-semibold']">{{ v.quantidade }}</td>
                  <td :class="[td, 'text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold']">{{ fmtBRL(v.valor_pago) }}</td>
                  <td :class="[td, 'text-right tabular-nums text-slate-400']">
                    {{ v.valor_pago && v.quantidade ? fmtBRL(v.valor_pago / v.quantidade) : '—' }}
                  </td>
                  <td :class="[td, 'text-slate-500']">{{ v.referencia || '—' }}</td>
                  <td :class="[td, 'text-slate-500 max-w-[240px] truncate']" :title="v.motivo || ''">{{ v.motivo || '—' }}</td>
                </tr>
              </tbody>
            </table>
            </div>
            <FinanceiroPaginacao v-model="pagina" :total="vendasFiltradas.length" :tamanho="TAMANHO_PAGINA" />
          </div>

          <!-- Estornos e correções -->
          <div v-else-if="aba === 'estornos'" class="space-y-5">
            <div>
              <p class="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-2">Retiradas e estornos</p>
              <p v-if="!estornosFiltrados.length" class="text-xs text-slate-400 py-3">Nenhuma retirada registrada.</p>
              <div v-else class="overflow-x-auto">
                <table class="w-full text-xs">
                  <thead class="bg-slate-50 dark:bg-slate-950/60">
                    <tr>
                      <th :class="th">Data</th>
                      <th :class="th">Parceiro</th>
                      <th :class="th">Crédito</th>
                      <th :class="[th, 'text-right']">Qtd.</th>
                      <th :class="[th, 'text-right']">Valor</th>
                      <th :class="th">Efeito</th>
                      <th :class="th">Motivo</th>
                      <th :class="th">Lançado por</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                    <tr v-for="e in estornosPagina" :key="e.id" class="align-top">
                      <td :class="[td, 'tabular-nums text-slate-400 whitespace-nowrap']">{{ fmtData(e.data) }}</td>
                      <td :class="[td, 'font-medium text-slate-900 dark:text-white']">{{ e.parceiro_nome }}</td>
                      <td :class="[td, 'text-slate-500']">{{ LABEL_TIPO[e.tipo_credito] }}</td>
                      <td :class="[td, 'text-right tabular-nums font-bold text-red-600 dark:text-red-400']">{{ e.quantidade }}</td>
                      <td :class="[td, 'text-right tabular-nums']">{{ e.valor_pago ? '−' + fmtBRL(e.valor_pago) : '—' }}</td>
                      <!-- De qual lote o crédito saiu: é o que separa desfazer
                           uma venda de retirar uma cortesia. -->
                      <td :class="td">
                        <span
                          v-if="origemCredito(e.operacao, e.quantidade, e.valor_pago)"
                          class="px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap"
                          :class="origemCredito(e.operacao, e.quantidade, e.valor_pago)!.cls"
                        >{{ origemCredito(e.operacao, e.quantidade, e.valor_pago)!.texto }}</span>
                      </td>
                      <!-- O motivo é obrigatório no lançamento; mostrar inteiro. -->
                      <td :class="[td, 'text-slate-700 dark:text-slate-200 whitespace-normal min-w-[220px]']">
                        {{ e.motivo || '—' }}
                        <span v-if="e.referencia" class="block text-[10px] text-slate-400">ref: {{ e.referencia }}</span>
                      </td>
                      <td :class="[td, 'text-slate-400 capitalize']">{{ e.criado_por_papel }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <FinanceiroPaginacao v-model="pagina" :total="estornosFiltrados.length" :tamanho="TAMANHO_PAGINA" />
            </div>

            <div v-if="ajustesFiltrados.length">
              <p class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2">Correções a favor do parceiro (crédito devolvido)</p>
              <div class="overflow-x-auto">
                <table class="w-full text-xs">
                  <thead class="bg-slate-50 dark:bg-slate-950/60">
                    <tr>
                      <th :class="th">Data</th>
                      <th :class="th">Parceiro</th>
                      <th :class="th">Crédito</th>
                      <th :class="[th, 'text-right']">Qtd.</th>
                      <th :class="th">Motivo</th>
                      <th :class="th">Lançado por</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                    <tr v-for="a in ajustesPagina" :key="a.id" class="align-top">
                      <td :class="[td, 'tabular-nums text-slate-400 whitespace-nowrap']">{{ fmtData(a.data) }}</td>
                      <td :class="[td, 'font-medium text-slate-900 dark:text-white']">{{ a.parceiro_nome }}</td>
                      <td :class="[td, 'text-slate-500']">{{ LABEL_TIPO[a.tipo_credito] }}</td>
                      <td :class="[td, 'text-right tabular-nums font-bold text-emerald-600 dark:text-emerald-400']">+{{ a.quantidade }}</td>
                      <td :class="[td, 'text-slate-700 dark:text-slate-200 whitespace-normal min-w-[220px]']">{{ a.motivo || '—' }}</td>
                      <td :class="[td, 'text-slate-400 capitalize']">{{ a.criado_por_papel }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <FinanceiroPaginacao v-model="paginaAjustes" :total="ajustesFiltrados.length" :tamanho="TAMANHO_PAGINA" />
            </div>
          </div>

          <!-- Cortesias -->
          <div v-else-if="aba === 'concessoes'">
            <p v-if="!concessoesFiltradas.length" class="text-xs text-slate-400 py-4 text-center">Nenhum crédito de cortesia liberado.</p>
            <div v-else class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-slate-50 dark:bg-slate-950/60">
                <tr>
                  <th :class="th">Data</th>
                  <th :class="th">Parceiro</th>
                  <th :class="th">Crédito</th>
                  <th :class="[th, 'text-right']">Qtd.</th>
                  <th :class="th">Motivo da liberação</th>
                  <th :class="th">Lançado por</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                <tr v-for="c in concessoesPagina" :key="c.id" class="align-top">
                  <td :class="[td, 'tabular-nums text-slate-400 whitespace-nowrap']">{{ fmtData(c.data) }}</td>
                  <td :class="[td, 'font-medium text-slate-900 dark:text-white']">{{ c.parceiro_nome }}</td>
                  <td :class="[td, 'text-slate-500']">{{ LABEL_TIPO[c.tipo_credito] }}</td>
                  <td :class="[td, 'text-right tabular-nums font-semibold text-amber-600 dark:text-amber-400']">+{{ c.quantidade }}</td>
                  <td :class="[td, 'text-slate-700 dark:text-slate-200 whitespace-normal min-w-[220px]']">
                    {{ c.motivo || '—' }}
                    <span v-if="c.referencia" class="block text-[10px] text-slate-400">ref: {{ c.referencia }}</span>
                  </td>
                  <td :class="[td, 'text-slate-400 capitalize']">{{ c.criado_por_papel }}</td>
                </tr>
              </tbody>
            </table>
            </div>
            <FinanceiroPaginacao v-model="pagina" :total="concessoesFiltradas.length" :tamanho="TAMANHO_PAGINA" />
          </div>

          <!-- Consumo -->
          <div v-else-if="aba === 'consumo'">
            <p v-if="!consumosFiltrados.length" class="text-xs text-slate-400 py-4 text-center">Nenhum consumo de crédito registrado.</p>
            <div v-else class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-slate-50 dark:bg-slate-950/60">
                <tr>
                  <th :class="th">Data</th>
                  <th :class="th">Parceiro</th>
                  <th :class="th">Cliente renovado</th>
                  <th :class="th">Crédito</th>
                  <th :class="[th, 'text-right']">Vencimento</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                <tr v-for="c in consumosPagina" :key="c.id">
                  <td :class="[td, 'tabular-nums text-slate-400 whitespace-nowrap']">{{ fmtDataHora(c.data) }}</td>
                  <td :class="[td, 'font-medium text-slate-900 dark:text-white']">{{ c.parceiro_nome }}</td>
                  <td :class="[td, 'text-slate-700 dark:text-slate-200']">{{ c.empresa_nome || '—' }}</td>
                  <td :class="[td, 'text-slate-500']">{{ LABEL_TIPO[c.tipo_credito] }}</td>
                  <!-- Antes → depois desta renovação especificamente, vindo do
                       renovacao_id do próprio lançamento. -->
                  <td :class="[td, 'text-right tabular-nums whitespace-nowrap']">
                    <span class="text-slate-400">{{ fmtData(c.renovou_de ?? null) }}</span>
                    <i class="fa-solid fa-arrow-right text-[9px] text-slate-300 dark:text-slate-600 mx-1.5" aria-hidden="true" />
                    <span class="text-slate-700 dark:text-slate-200 font-semibold">{{ fmtData(c.renovou_ate ?? null) }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
            <FinanceiroPaginacao v-model="pagina" :total="consumosFiltrados.length" :tamanho="TAMANHO_PAGINA" />
          </div>

          <!-- Vencendo -->
          <div v-else>
            <p v-if="!vencendoFiltrado.length" class="text-xs text-slate-400 py-4 text-center">Nenhum cliente de parceiro vencendo nos próximos 7 dias.</p>
            <div v-else class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-slate-50 dark:bg-slate-950/60">
                <tr>
                  <th :class="th">Cliente</th>
                  <th :class="th">Parceiro</th>
                  <th :class="th">Vencimento</th>
                  <th :class="th">Situação</th>
                  <th :class="th">Cobrança</th>
                  <th :class="[th, 'text-right']">Última renovação</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                <tr v-for="c in vencendoPagina" :key="`${c.parceiro_nome}-${c.empresa_nome}`">
                  <td :class="[td, 'font-medium text-slate-900 dark:text-white']">{{ c.empresa_nome }}</td>
                  <td :class="[td, 'text-slate-500']">{{ c.parceiro_nome }}</td>
                  <td :class="[td, 'tabular-nums text-slate-500']">{{ fmtData(c.vencimento) }}</td>
                  <td :class="td">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap" :class="diasCls(c.dias_restantes)">
                      {{ diasTexto(c.dias_restantes) }}
                    </span>
                    <span v-if="c.bloqueio_origem" class="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400">
                      {{ c.bloqueio_origem === 'parceiro' ? 'Bloq. parceiro' : 'Bloq. Agzap' }}
                    </span>
                  </td>
                  <td :class="[td, 'text-slate-500']">{{ c.cobranca_agzap ? 'Agzap' : 'Crédito do parceiro' }}</td>
                  <td :class="[td, 'text-right tabular-nums text-slate-400']">{{ fmtDataHora(c.ultima_renovacao_em) }}</td>
                </tr>
              </tbody>
            </table>
            </div>
            <FinanceiroPaginacao v-model="pagina" :total="vencendoFiltrado.length" :tamanho="TAMANHO_PAGINA" />
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
