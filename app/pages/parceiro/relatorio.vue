<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

/**
 * Relatório de lucro do parceiro: quanto ele fatura com os clientes, quanto
 * gasta de crédito com a Agzap e o que sobra, no período escolhido.
 */
definePageMeta({
  middleware: ['auth', 'parceiro'],
  layout: 'parceiro',
})

const { parceiro, checkParceiro } = useParceiro()

type Periodo = 'hoje' | '7d' | '30d' | 'custom'
const periodo = ref<Periodo>('30d')
const dataInicio = ref('')
const dataFim = ref('')

const loading = ref(true)
const erro = ref<string | null>(null)
const resumo = ref<any>(null)
const porCliente = ref<any[]>([])
const renovacoes = ref<any[]>([])

const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Intervalo em horário local: o parceiro pensa em dia de calendário, não UTC. */
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
      '/api/parceiro/relatorio',
      { query: { de: de.toISOString(), ate: ate.toISOString() }, headers: await useAdminAuthHeaders() },
    )
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Erro')
    resumo.value = resp.data.resumo
    porCliente.value = resp.data.porCliente
    renovacoes.value = resp.data.renovacoes
  } catch (e: any) {
    erro.value = e?.data?.statusMessage || e?.message || 'Não foi possível montar o relatório'
  } finally {
    loading.value = false
  }
}

function trocarPeriodo(p: Periodo) {
  periodo.value = p
  if (p === 'custom') {
    if (!dataInicio.value) {
      const d = new Date()
      d.setDate(d.getDate() - 29)
      dataInicio.value = isoDia(d)
    }
    if (!dataFim.value) dataFim.value = isoDia(new Date())
  }
  carregar()
}

/** Limpar volta para hoje — o estado mais restrito, sem filtro nenhum aplicado. */
const filtroAtivo = computed(() => periodo.value !== 'hoje')
function limparFiltros() {
  periodo.value = 'hoje'
  dataInicio.value = ''
  dataFim.value = ''
  carregar()
}

/**
 * PDF pela impressão do navegador: sem dependência nova no bundle e o
 * resultado é o que estilizamos na folha, não um print da tela.
 */
function exportarPdf() {
  window.print()
}

const geradoEm = computed(() =>
  new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }))

onMounted(async () => {
  await Promise.all([checkParceiro(), carregar()])
})

const fmtBRL = (v: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v ?? 0))
const fmtData = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'
const fmtDataHora = (s: string | null) =>
  s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

const LABEL_TIPO: Record<string, string> = { mensal_30d: '30 dias', anual_12m: '12 meses' }

const rotuloPeriodo = computed(() => {
  const { de, ate } = intervalo()
  if (periodo.value === 'hoje') return 'hoje'
  return `${de.toLocaleDateString('pt-BR')} a ${ate.toLocaleDateString('pt-BR')}`
})

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
const th = 'text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider'
const td = 'px-4 py-2.5 text-sm'
</script>

<template>
  <div class="p-4 sm:p-6 md:p-8 space-y-5 max-w-[1400px] mx-auto w-full">

    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Relatório</h1>
        <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
          Quanto você faturou, quanto gastou de crédito e o que sobrou · <span class="capitalize">{{ rotuloPeriodo }}</span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          @click="exportarPdf"
          :disabled="loading || !resumo"
          type="button"
          class="inline-flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-white/[0.06] hover:bg-slate-50 dark:hover:bg-white/[0.1] disabled:opacity-50 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 rounded text-sm font-semibold transition-colors"
        >
          <i class="fa-solid fa-file-pdf text-red-500 text-sm" aria-hidden="true" />
          <span class="hidden sm:inline">Exportar PDF</span>
        </button>
        <button
          @click="carregar"
          :disabled="loading"
          type="button"
          class="inline-flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-sm font-semibold transition-all duration-150 shadow-lg shadow-purple-600/30 dark:shadow-purple-600/20"
        >
          <i class="fa-solid fa-arrows-rotate text-sm" :class="{ 'animate-spin': loading }" aria-hidden="true" />
          <span class="hidden sm:inline">Atualizar</span>
        </button>
      </div>
    </div>

    <!-- Período -->
    <div :class="['p-3 sm:p-4 flex flex-wrap items-center gap-2', cardBase]">
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
          : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-slate-300'"
      >{{ p.label }}</button>

      <div v-if="periodo === 'custom'" class="flex items-center gap-2 ml-auto">
        <input
          v-model="dataInicio"
          type="date"
          aria-label="Data inicial"
          class="px-2.5 py-1.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded text-xs text-slate-900 dark:text-white"
        />
        <span class="text-slate-400 text-xs">até</span>
        <input
          v-model="dataFim"
          type="date"
          aria-label="Data final"
          class="px-2.5 py-1.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded text-xs text-slate-900 dark:text-white"
        />
        <button
          type="button"
          @click="carregar"
          class="px-3 py-1.5 rounded text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors"
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

    <div v-if="erro" class="p-4 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
      <span>{{ erro }}</span>
    </div>

    <div v-else-if="loading && !resumo" class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div v-for="i in 3" :key="i" class="h-24 rounded-md bg-slate-100 dark:bg-white/5 animate-pulse" />
    </div>

    <template v-else-if="resumo">
      <!-- A conta, na ordem em que ela é feita -->
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div :class="['p-4', cardBase]">
          <p class="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <i class="fa-solid fa-arrow-trend-up text-[10px]" aria-hidden="true" />
            Receita bruta
          </p>
          <p class="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">{{ fmtBRL(resumo.receita_bruta) }}</p>
          <p class="text-[11px] text-slate-400 mt-0.5">
            {{ resumo.meses_vendidos }} {{ resumo.meses_vendidos === 1 ? 'mês vendido' : 'meses vendidos' }} para {{ resumo.clientes_atendidos }} cliente{{ resumo.clientes_atendidos === 1 ? '' : 's' }}
          </p>
        </div>

        <!-- Caixa/estoque do período; não é descontado outra vez do resultado. -->
        <div :class="['p-4', cardBase]">
          <p class="text-[11px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1.5">
            <i class="fa-solid fa-cart-shopping text-[10px]" aria-hidden="true" />
            Compra de créditos (caixa)
          </p>
          <p class="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">{{ fmtBRL(resumo.gasto_compras) }}</p>
          <p class="text-[11px] text-slate-400 mt-0.5">
            {{ resumo.compras_creditos }} crédito{{ resumo.compras_creditos === 1 ? '' : 's' }} comprado{{ resumo.compras_creditos === 1 ? '' : 's' }} no período
            <template v-if="resumo.estornos_valor > 0"> · {{ fmtBRL(resumo.estornos_valor) }} estornado já abatido</template>
          </p>
        </div>

        <div :class="['p-4', cardBase]">
          <p class="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <i class="fa-solid fa-coins text-[10px]" aria-hidden="true" />
            Custo dos créditos usados
          </p>
          <p class="text-2xl font-bold text-slate-700 dark:text-slate-200 tabular-nums mt-1">{{ fmtBRL(resumo.custo_creditos_usados) }}</p>
          <p class="text-[11px] text-slate-400 mt-0.5">
            {{ resumo.creditos_usados }} nas renovações do período
            <template v-if="resumo.creditos_cortesia_usados > 0">
              · {{ resumo.creditos_cortesia_usados }} de cortesia (custo zero)
            </template>
          </p>
        </div>

        <div :class="['p-4', cardBase, resumo.lucro_liquido < 0 ? 'ring-1 ring-red-300 dark:ring-red-500/40' : '']">
          <p class="text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
            <i class="fa-solid fa-sack-dollar text-[10px]" aria-hidden="true" />
            Lucro líquido
          </p>
          <p class="text-2xl font-bold tabular-nums mt-1" :class="resumo.lucro_liquido >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'">
            {{ fmtBRL(resumo.lucro_liquido) }}
          </p>
          <p class="text-[11px] text-slate-400 mt-0.5 tabular-nums">
            {{ fmtBRL(resumo.receita_bruta) }} − {{ fmtBRL(resumo.custo_creditos_usados) }} · margem {{ resumo.margem.toFixed(1).replace('.', ',') }}%
          </p>
        </div>
      </div>

      <div v-if="resumo.clientes_sem_preco > 0 || resumo.anuais_sem_preco_proprio > 0" class="flex flex-wrap gap-2">
        <span
          v-if="resumo.clientes_sem_preco > 0"
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400"
        >
          <i class="fa-solid fa-triangle-exclamation text-[10px]" aria-hidden="true" />
          {{ resumo.clientes_sem_preco }} cliente(s) sem valor cadastrado entram como R$ 0,00
        </span>
        <span
          v-if="resumo.anuais_sem_preco_proprio > 0"
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400"
          title="Defina o valor anual do cliente em Clientes › Valor cobrado"
        >
          <i class="fa-solid fa-calendar-days text-[10px]" aria-hidden="true" />
          {{ resumo.anuais_sem_preco_proprio }} renovação(ões) anual(is) usando o preço sugerido da tabela
        </span>
      </div>

      <!-- Por cliente -->
      <section>
        <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Por cliente</p>
        <div :class="['overflow-hidden', cardBase]">
          <div v-if="!porCliente.length" class="px-5 py-10 text-center">
            <i class="fa-solid fa-chart-simple text-slate-300 dark:text-slate-700 text-2xl mb-2 block" aria-hidden="true" />
            <p class="text-slate-500 text-sm">Nenhuma renovação neste período</p>
          </div>
          <div v-else class="overflow-auto max-h-[26rem]">
            <table class="w-full">
              <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
                <tr class="border-b border-slate-200 dark:border-white/5">
                  <th :class="th">Cliente</th>
                  <th :class="[th, 'text-right']">Valor/mês</th>
                  <th :class="[th, 'text-center']">Renovações</th>
                  <th :class="[th, 'text-center']">Meses</th>
                  <th :class="[th, 'text-right']">Receita</th>
                  <th :class="[th, 'text-right']">Crédito usado</th>
                  <th :class="[th, 'text-right']">Lucro líquido</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-white/5">
                <tr v-for="c in porCliente" :key="c.empresa_id" class="hover:bg-slate-50/80 dark:hover:bg-white/[0.03]">
                  <td :class="[td, 'font-medium text-slate-800 dark:text-white']">{{ c.empresa_nome }}</td>
                  <td :class="[td, 'text-right tabular-nums', c.preco_mensal > 0 ? 'text-slate-600 dark:text-slate-400' : 'text-amber-600 dark:text-amber-400']">
                    {{ c.preco_mensal > 0 ? fmtBRL(c.preco_mensal) : 'sem valor' }}
                  </td>
                  <td :class="[td, 'text-center tabular-nums text-slate-600 dark:text-slate-400']">{{ c.renovacoes }}</td>
                  <td :class="[td, 'text-center tabular-nums text-slate-600 dark:text-slate-400']">{{ c.meses }}</td>
                  <td :class="[td, 'text-right tabular-nums text-slate-700 dark:text-slate-200']">{{ fmtBRL(c.receita) }}</td>
                  <td :class="[td, 'text-right tabular-nums text-red-600 dark:text-red-400']">{{ fmtBRL(c.custo) }}</td>
                  <td :class="[td, 'text-right tabular-nums font-bold', c.resultado >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400']">
                    {{ fmtBRL(c.resultado) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- Renovação a renovação -->
      <section v-if="renovacoes.length">
        <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Renovações do período</p>
        <div :class="['overflow-hidden', cardBase]">
          <div class="overflow-auto max-h-[26rem]">
            <table class="w-full">
              <thead class="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
                <tr class="border-b border-slate-200 dark:border-white/5">
                  <th :class="th">Data</th>
                  <th :class="th">Cliente</th>
                  <th :class="th">Crédito</th>
                  <th :class="[th, 'text-right']">Receita</th>
                  <th :class="[th, 'text-right']">Custo</th>
                  <th :class="[th, 'text-right']">Lucro na venda</th>
                  <th :class="[th, 'text-right']">Válido até</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-white/5">
                <tr v-for="r in renovacoes" :key="r.id" class="hover:bg-slate-50/80 dark:hover:bg-white/[0.03]">
                  <td :class="[td, 'text-xs text-slate-500 tabular-nums whitespace-nowrap']">{{ fmtDataHora(r.data) }}</td>
                  <td :class="[td, 'text-slate-800 dark:text-white']">{{ r.empresa_nome }}</td>
                  <td :class="[td, 'text-xs text-slate-500']">
                    {{ LABEL_TIPO[r.tipo_credito] ?? '—' }}
                    <span v-if="!r.consumiu_credito" class="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">Agzap</span>
                    <span v-else-if="r.credito_cortesia" class="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">cortesia</span>
                  </td>
                  <td :class="[td, 'text-right tabular-nums text-slate-700 dark:text-slate-200']">
                    {{ fmtBRL(r.receita) }}
                    <span
                      v-if="r.preco_anual_origem && r.preco_anual_origem !== 'cliente'"
                      class="block text-[9px] text-amber-600 dark:text-amber-400 font-medium"
                      title="Este cliente ainda não tem preço anual definido — usando a sugestão da tabela"
                    >preço sugerido</span>
                  </td>
                  <td :class="[td, 'text-right tabular-nums text-red-600 dark:text-red-400']">{{ fmtBRL(r.custo) }}</td>
                  <td :class="[td, 'text-right tabular-nums font-bold', r.resultado >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400']">
                    {{ r.consumiu_credito ? fmtBRL(r.resultado) : '—' }}
                  </td>
                  <td :class="[td, 'text-right tabular-nums text-xs text-slate-500']">{{ fmtData(r.vencimento_novo) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <p class="text-[11px] text-slate-400 dark:text-slate-500 flex items-start gap-1.5">
        <i class="fa-solid fa-circle-info text-[10px] mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          <strong>Lucro líquido = receita das renovações − custo dos créditos usados nelas.</strong>
          Cada venda, cada cliente e o total seguem exatamente essa mesma conta. Compra de créditos é
          exibida separadamente como saída de caixa e entrada de estoque; descontá-la novamente faria o
          mesmo crédito entrar duas vezes no custo. Crédito de cortesia entra com custo zero.
          A receita usa o <strong>valor atual</strong> cadastrado de cada cliente × os meses da renovação
          (12 no crédito anual).
        </span>
      </p>

      <!-- ══════════ Folha de impressão (só aparece no PDF) ══════════ -->
      <section id="folha-impressao" class="hidden">
        <header style="border-bottom:2px solid #7c3aed;padding-bottom:10px;margin-bottom:16px">
          <h1 style="font-size:18pt;font-weight:700;color:#0f172a;margin:0">Relatório de resultados</h1>
          <p style="font-size:10pt;color:#475569;margin:4px 0 0">
            Parceiro: <strong>{{ parceiro?.nome ?? '—' }}</strong> · Período: <strong>{{ rotuloPeriodo }}</strong>
          </p>
          <p style="font-size:8pt;color:#94a3b8;margin:2px 0 0">Gerado em {{ geradoEm }} · Agzap Systems</p>
        </header>

        <table style="width:100%;border-collapse:collapse;margin-bottom:18px;font-size:10pt">
          <tbody>
            <tr>
              <td style="padding:6px 0;color:#475569">Receita bruta <span style="color:#94a3b8">({{ resumo.meses_vendidos }} meses vendidos)</span></td>
              <td style="padding:6px 0;text-align:right;font-weight:700;color:#0f172a">{{ fmtBRL(resumo.receita_bruta) }}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#475569">Custo dos créditos usados nas renovações</td>
              <td style="padding:6px 0;text-align:right;font-weight:700;color:#b91c1c">− {{ fmtBRL(resumo.custo_creditos_usados) }}</td>
            </tr>
            <tr style="border-top:1px solid #cbd5e1">
              <td style="padding:8px 0;font-weight:700;color:#0f172a">Lucro líquido <span style="color:#94a3b8;font-weight:400">(margem {{ resumo.margem.toFixed(1).replace('.', ',') }}%)</span></td>
              <td style="padding:8px 0;text-align:right;font-weight:700;font-size:13pt;color:#047857">{{ fmtBRL(resumo.lucro_liquido) }}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#94a3b8;font-size:9pt">Compra de créditos — caixa/estoque, informativo <span>({{ resumo.compras_creditos }} créditos)</span></td>
              <td style="padding:6px 0;text-align:right;color:#94a3b8;font-size:9pt">{{ fmtBRL(resumo.gasto_compras) }}</td>
            </tr>
          </tbody>
        </table>

        <h2 style="font-size:11pt;font-weight:700;color:#0f172a;margin:0 0 6px">Por cliente</h2>
        <table style="width:100%;border-collapse:collapse;font-size:9pt;margin-bottom:18px">
          <thead>
            <tr style="background:#f1f5f9">
              <th style="text-align:left;padding:5px 6px;border-bottom:1px solid #cbd5e1">Cliente</th>
              <th style="text-align:right;padding:5px 6px;border-bottom:1px solid #cbd5e1">Valor/mês</th>
              <th style="text-align:center;padding:5px 6px;border-bottom:1px solid #cbd5e1">Renov.</th>
              <th style="text-align:center;padding:5px 6px;border-bottom:1px solid #cbd5e1">Meses</th>
              <th style="text-align:right;padding:5px 6px;border-bottom:1px solid #cbd5e1">Receita</th>
              <th style="text-align:right;padding:5px 6px;border-bottom:1px solid #cbd5e1">Crédito usado</th>
              <th style="text-align:right;padding:5px 6px;border-bottom:1px solid #cbd5e1">Lucro líquido</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in porCliente" :key="`p-${c.empresa_id}`">
              <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0">{{ c.empresa_nome }}</td>
              <td style="padding:5px 6px;text-align:right;border-bottom:1px solid #e2e8f0">{{ fmtBRL(c.preco_mensal) }}</td>
              <td style="padding:5px 6px;text-align:center;border-bottom:1px solid #e2e8f0">{{ c.renovacoes }}</td>
              <td style="padding:5px 6px;text-align:center;border-bottom:1px solid #e2e8f0">{{ c.meses }}</td>
              <td style="padding:5px 6px;text-align:right;border-bottom:1px solid #e2e8f0">{{ fmtBRL(c.receita) }}</td>
              <td style="padding:5px 6px;text-align:right;border-bottom:1px solid #e2e8f0;color:#b91c1c">{{ fmtBRL(c.custo) }}</td>
              <td style="padding:5px 6px;text-align:right;border-bottom:1px solid #e2e8f0;color:#047857;font-weight:700">{{ fmtBRL(c.resultado) }}</td>
            </tr>
            <tr v-if="!porCliente.length">
              <td colspan="7" style="padding:10px;text-align:center;color:#94a3b8">Nenhuma renovação neste período</td>
            </tr>
          </tbody>
        </table>

        <template v-if="renovacoes.length">
          <h2 style="font-size:11pt;font-weight:700;color:#0f172a;margin:0 0 6px">Renovações do período</h2>
          <table style="width:100%;border-collapse:collapse;font-size:9pt">
            <thead>
              <tr style="background:#f1f5f9">
                <th style="text-align:left;padding:5px 6px;border-bottom:1px solid #cbd5e1">Data</th>
                <th style="text-align:left;padding:5px 6px;border-bottom:1px solid #cbd5e1">Cliente</th>
                <th style="text-align:left;padding:5px 6px;border-bottom:1px solid #cbd5e1">Crédito</th>
                <th style="text-align:right;padding:5px 6px;border-bottom:1px solid #cbd5e1">Receita</th>
                <th style="text-align:right;padding:5px 6px;border-bottom:1px solid #cbd5e1">Custo</th>
                <th style="text-align:right;padding:5px 6px;border-bottom:1px solid #cbd5e1">Lucro</th>
                <th style="text-align:right;padding:5px 6px;border-bottom:1px solid #cbd5e1">Válido até</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in renovacoes" :key="`p-${r.id}`">
                <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0">{{ fmtDataHora(r.data) }}</td>
                <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0">{{ r.empresa_nome }}</td>
                <td style="padding:5px 6px;border-bottom:1px solid #e2e8f0">
                  {{ LABEL_TIPO[r.tipo_credito] ?? '—' }}<template v-if="!r.consumiu_credito"> (Agzap)</template><template v-else-if="r.credito_cortesia"> (cortesia)</template>
                </td>
                <td style="padding:5px 6px;text-align:right;border-bottom:1px solid #e2e8f0">{{ fmtBRL(r.receita) }}</td>
                <td style="padding:5px 6px;text-align:right;border-bottom:1px solid #e2e8f0;color:#b91c1c">{{ fmtBRL(r.custo) }}</td>
                <td style="padding:5px 6px;text-align:right;border-bottom:1px solid #e2e8f0;color:#047857;font-weight:700">{{ r.consumiu_credito ? fmtBRL(r.resultado) : '—' }}</td>
                <td style="padding:5px 6px;text-align:right;border-bottom:1px solid #e2e8f0">{{ fmtData(r.vencimento_novo) }}</td>
              </tr>
            </tbody>
          </table>
        </template>

        <p style="margin-top:16px;font-size:8pt;color:#64748b;line-height:1.5">
          Lucro líquido = receita das renovações − custo dos créditos usados nelas. A compra de créditos
          é apenas o movimento de caixa/estoque do período e não é descontada novamente. Crédito de
          cortesia tem custo zero. A receita usa o valor atual cadastrado de cada cliente.
        </p>
      </section>
    </template>
  </div>
</template>

<!--
  Impressão: a tela inteira some e só a folha aparece, com estilo próprio em
  cores claras — assim o PDF sai igual no tema claro e no escuro, e não vira
  uma captura da interface com menu e botões.
-->
<style>
@media print {
  @page { size: A4 portrait; margin: 14mm; }

  html, body { background: #fff !important; }

  body * { visibility: hidden !important; }
  #folha-impressao, #folha-impressao * { visibility: visible !important; }

  #folha-impressao {
    display: block !important;
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    color: #0f172a;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  }

  /* Linha não pode ser cortada no meio; cabeçalho repete em cada página. */
  #folha-impressao tr { page-break-inside: avoid; }
  #folha-impressao thead { display: table-header-group; }
  #folha-impressao h2 { page-break-after: avoid; }
}
</style>
