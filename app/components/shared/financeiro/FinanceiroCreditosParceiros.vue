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
  renovou_ate?: string | null
}

interface LinhaParceiro {
  id: string
  nome: string
  ativo: boolean
  vendido_total: number
  vendido_mes: number
  estornado_total: number
  estornado_mes: number
  liquido_total: number
  passivo_estimado: number
  creditos_comprados: number
  creditos_concedidos: number
  creditos_estornados: number
  creditos_consumidos: number
  consumidos_mes: number
  saldo: { mensal_30d: number; anual_12m: number }
  saldo_total: number
  clientes_total: number
  clientes_vencendo_7d: number
  clientes_vencidos: number
  ultimo_consumo_em: string | null
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

async function carregar() {
  loading.value = true
  erro.value = null
  try {
    const resp = await $fetch<{ success: boolean; data?: any; error?: string }>(
      '/api/admin/parceiros/financeiro',
      { headers: await useAdminAuthHeaders() },
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

onMounted(carregar)
defineExpose({ carregar })

const fmtBRL = (v: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v ?? 0))
const fmtData = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'
const fmtDataHora = (s: string | null) =>
  s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

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
  { id: 'vencendo', label: 'Vencendo', icone: 'fa-hourglass-half' },
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
          <p class="text-[11px] text-slate-500 dark:text-slate-400">Venda, estorno, consumo e passivo do programa de licenças</p>
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

    <div v-if="loading && !resumo" class="p-8 flex items-center justify-center gap-3 text-slate-400 text-sm">
      <i class="fa-solid fa-circle-notch animate-spin" aria-hidden="true" />
      Carregando dados dos parceiros…
    </div>

    <div v-else-if="erro" role="alert" class="m-3 sm:m-5 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 text-sm">
      {{ erro }}
    </div>

    <template v-else-if="resumo">
      <!-- Números do mês -->
      <div class="p-3 sm:p-5 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        <AdminStatsCard
          title="Vendido no mês"
          :value="fmtBRL(resumo.vendido_mes)"
          :subtitle="`${resumo.creditos_vendidos_mes} créditos · ${fmtBRL(resumo.vendido_total)} no total`"
          icon="fa-cart-shopping"
          color="emerald"
        />
        <AdminStatsCard
          title="Estornado no mês"
          :value="fmtBRL(resumo.estornado_mes)"
          :subtitle="`${resumo.creditos_estornados_total} créditos estornados no total`"
          icon="fa-rotate-left"
          color="red"
          :highlighted="resumo.estornado_mes > 0"
        />
        <AdminStatsCard
          title="Líquido no mês"
          :value="fmtBRL(resumo.liquido_mes)"
          :subtitle="`Ticket médio ${fmtBRL(resumo.ticket_medio_credito)}/crédito`"
          icon="fa-scale-balanced"
          :color="resumo.liquido_mes >= 0 ? 'indigo' : 'orange'"
        />
        <AdminStatsCard
          title="Passivo em créditos"
          :value="fmtBRL(resumo.passivo_estimado)"
          :subtitle="`${resumo.saldo_creditos_aberto} créditos pagos, não usados`"
          icon="fa-vault"
          color="amber"
        />
        <AdminStatsCard
          title="Consumido no mês"
          :value="resumo.creditos_consumidos_mes"
          :subtitle="`${resumo.creditos_consumidos_total} no total · ${resumo.clientes_vencendo_7d} vencendo em 7d`"
          icon="fa-fire"
          color="purple"
        />
      </div>

      <!-- Avisos de controle -->
      <div
        v-if="resumo.creditos_concedidos_total > 0 || resumo.renovacoes_sem_credito_mes > 0"
        class="mx-3 sm:mx-5 mb-4 flex flex-wrap gap-2 text-[11px]"
      >
        <span
          v-if="resumo.creditos_concedidos_total > 0"
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 font-semibold"
          title="Créditos liberados sem pagamento — custo de cortesia avaliado a preço de tabela"
        >
          <i class="fa-solid fa-gift" aria-hidden="true" />
          {{ resumo.creditos_concedidos_total }} créditos de cortesia · {{ fmtBRL(resumo.concedido_valor_tabela) }} a preço de tabela
        </span>
        <span
          v-if="resumo.renovacoes_sem_credito_mes > 0"
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold"
          title="Renovações feitas pela Agzap em cliente de parceiro — não consumiram crédito"
        >
          <i class="fa-solid fa-circle-info" aria-hidden="true" />
          {{ resumo.renovacoes_sem_credito_mes }} renovações da Agzap sem consumo de crédito neste mês
        </span>
      </div>

      <!-- Consolidado por parceiro -->
      <div class="px-3 sm:px-5 pb-5">
        <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Por parceiro</p>
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
                <th :class="[th, 'text-right']">Passivo</th>
                <th :class="[th, 'text-right']">Clientes</th>
                <th :class="[th, 'text-right']">Último consumo</th>
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
                <td :class="[td, 'text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold']">{{ fmtBRL(p.vendido_total) }}</td>
                <td :class="[td, 'text-right tabular-nums']" :title="`${p.creditos_estornados} créditos estornados`">
                  <span :class="p.estornado_total > 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-400'">
                    {{ p.estornado_total > 0 ? '−' + fmtBRL(p.estornado_total) : '—' }}
                  </span>
                </td>
                <td :class="[td, 'text-right tabular-nums font-bold text-slate-900 dark:text-white']">{{ fmtBRL(p.liquido_total) }}</td>
                <td :class="[td, 'text-right tabular-nums']">
                  <span :class="p.creditos_concedidos > 0 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-slate-400'">
                    {{ p.creditos_concedidos || '—' }}
                  </span>
                </td>
                <td :class="[td, 'text-right tabular-nums']" :title="`${p.consumidos_mes} neste mês`">{{ p.creditos_consumidos }}</td>
                <td :class="[td, 'text-right tabular-nums']" :title="`${p.saldo.mensal_30d} de 30 dias · ${p.saldo.anual_12m} de 12 meses`">
                  <span class="font-semibold text-purple-600 dark:text-purple-400">{{ p.saldo_total }}</span>
                </td>
                <td :class="[td, 'text-right tabular-nums text-amber-600 dark:text-amber-400']">{{ fmtBRL(p.passivo_estimado) }}</td>
                <td :class="[td, 'text-right tabular-nums']">
                  {{ p.clientes_total }}
                  <span v-if="p.clientes_vencendo_7d" class="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400">{{ p.clientes_vencendo_7d }} vencendo</span>
                  <span v-if="p.clientes_vencidos" class="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400">{{ p.clientes_vencidos }} vencidos</span>
                </td>
                <td :class="[td, 'text-right tabular-nums text-slate-400']">{{ fmtDataHora(p.ultimo_consumo_em) }}</td>
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
              <p class="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-2">Estornos (crédito retirado)</p>
              <p v-if="!estornosFiltrados.length" class="text-xs text-slate-400 py-3">Nenhum estorno registrado.</p>
              <div v-else class="overflow-x-auto">
                <table class="w-full text-xs">
                  <thead class="bg-slate-50 dark:bg-slate-950/60">
                    <tr>
                      <th :class="th">Data</th>
                      <th :class="th">Parceiro</th>
                      <th :class="th">Crédito</th>
                      <th :class="[th, 'text-right']">Qtd.</th>
                      <th :class="[th, 'text-right']">Valor</th>
                      <th :class="th">Motivo do estorno</th>
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
                  <th :class="[th, 'text-right']">Renovou até</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                <tr v-for="c in consumosPagina" :key="c.id">
                  <td :class="[td, 'tabular-nums text-slate-400 whitespace-nowrap']">{{ fmtDataHora(c.data) }}</td>
                  <td :class="[td, 'font-medium text-slate-900 dark:text-white']">{{ c.parceiro_nome }}</td>
                  <td :class="[td, 'text-slate-700 dark:text-slate-200']">{{ c.empresa_nome || '—' }}</td>
                  <td :class="[td, 'text-slate-500']">{{ LABEL_TIPO[c.tipo_credito] }}</td>
                  <td :class="[td, 'text-right tabular-nums text-slate-500']">{{ fmtData(c.renovou_ate ?? null) }}</td>
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
