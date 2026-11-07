<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { CREDITOS, LABEL_CREDITO, PLANOS_PARCEIRO, TIPOS_CREDITO, creditoDoPlano } from '~/composables/useParceiroLicencas'
import type { MovimentacaoCredito } from '~/composables/useParceiroLicencas'

definePageMeta({
  middleware: ['auth', 'parceiro'],
  layout: 'parceiro',
})

const { parceiro, checkParceiro } = useParceiro()
const { saldos, movimentacoes, precos, loadingCreditos, error, loadCreditos } = useParceiroLicencas()

const showSolicitar = ref(false)
const filtro = ref<'todas' | 'entradas' | 'consumos'>('todas')

onMounted(async () => {
  await Promise.all([checkParceiro(), loadCreditos()])
})

const OPERACOES: Record<string, { label: string; icone: string; cls: string }> = {
  compra: { label: 'Compra', icone: 'fa-cart-shopping', cls: 'text-emerald-600 dark:text-emerald-400' },
  concessao_admin: { label: 'Liberado pela Agzap', icone: 'fa-gift', cls: 'text-emerald-600 dark:text-emerald-400' },
  consumo: { label: 'Renovação de cliente', icone: 'fa-rotate', cls: 'text-purple-600 dark:text-purple-400' },
  correcao: { label: 'Correção', icone: 'fa-pen-to-square', cls: 'text-amber-600 dark:text-amber-400' },
  migracao: { label: 'Migração', icone: 'fa-right-left', cls: 'text-slate-500 dark:text-slate-400' },
}

const movimentacoesFiltradas = computed(() => {
  if (filtro.value === 'entradas') return movimentacoes.value.filter(m => m.quantidade > 0)
  if (filtro.value === 'consumos') return movimentacoes.value.filter(m => m.operacao === 'consumo')
  return movimentacoes.value
})

function naturezaMovimentacao(m: MovimentacaoCredito) {
  if (m.operacao === 'compra') return { label: 'Compra paga', cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' }
  if (m.operacao === 'concessao_admin') return { label: 'Cortesia', cls: 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400' }
  if (m.operacao === 'consumo') return { label: 'Consumo', cls: 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400' }
  if (m.operacao === 'migracao') return { label: m.valor_pago ? 'Saldo pago migrado' : 'Saldo inicial', cls: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400' }
  if (m.quantidade < 0) {
    return m.valor_pago
      ? { label: 'Estorno de compra', cls: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400' }
      : { label: 'Retirada sem reembolso', cls: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400' }
  }
  return { label: m.valor_pago ? 'Ajuste pago' : 'Ajuste sem cobrança', cls: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400' }
}

function valorUnitario(m: MovimentacaoCredito) {
  if (!m.valor_pago || !m.quantidade) return null
  return m.valor_pago / Math.abs(m.quantidade)
}

/** Uma linha por crédito, com as faixas e o ganho já calculados a partir da tabela. */
function linhasDoPeriodo(meses: 1 | 12) {
  return TIPOS_CREDITO.filter(t => CREDITOS[t].meses === meses).map((tipo) => {
    const plano = PLANOS_PARCEIRO.find(p => p.codigo === CREDITOS[tipo].plano)
    const faixas = precos.value.filter(p => p.tipo_credito === tipo)
    const valores = faixas.map(p => Number(p.preco_unitario))
    const revenda = Number(faixas[0]?.preco_sugerido_revenda ?? 0)
    return {
      tipo,
      titulo: plano?.nome ?? tipo,
      alcance: plano?.alcance ?? '',
      faixas,
      revenda,
      ganhoMenor: revenda ? revenda - Math.max(...valores) : 0,
      ganhoMaior: revenda ? revenda - Math.min(...valores) : 0,
    }
  }).filter(linha => linha.faixas.length > 0)
}

const gruposPreco = computed(() => [
  { titulo: 'Licenças de 30 dias', sub: 'Renovam um cliente por 30 dias corridos', linhas: linhasDoPeriodo(1) },
  { titulo: 'Licenças de 12 meses', sub: 'Para o cliente que assina o plano anual', linhas: linhasDoPeriodo(12) },
].filter(grupo => grupo.linhas.length > 0))

// "1 a 5 licenças" sai da quantidade_min da própria faixa e da seguinte —
// antes o "até 5" estava escrito na mão e desalinhava se a tabela mudasse.
function faixaLabel(faixas: typeof precos.value, i: number) {
  const atual = faixas[i]
  const proxima = faixas[i + 1]
  if (!atual) return ''
  if (faixas.length === 1) return 'por licença'
  if (!proxima) return `${atual.quantidade_min} ou mais`
  return `${atual.quantidade_min} a ${proxima.quantidade_min - 1} licenças`
}

function fmtBRL(v: number | null) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))
}

function fmtDataHora(s: string) {
  return new Date(s).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function fmtData(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <!-- Largura toda da área de conteúdo, igual à página de Indicados -->
  <div class="p-4 sm:p-6 md:p-8 space-y-6 w-full">

    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Créditos</h1>
        <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
          Saldo, compras e consumos da sua carteira de licenças
        </p>
      </div>
      <button
        @click="showSolicitar = true"
        type="button"
        class="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30 dark:shadow-emerald-600/20 transition-all duration-150"
      >
        <i class="fa-solid fa-coins text-sm" aria-hidden="true" />
        <span>Solicitar novos créditos</span>
      </button>
    </div>

    <div v-if="error" class="p-4 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
      <span>{{ error }}</span>
    </div>

    <!-- Telas grandes: saldo + preços numa coluna à esquerda e o extrato ocupando
         o resto, no mesmo formato da página de Indicados. Abaixo disso, empilha. -->
    <div class="grid gap-6 2xl:grid-cols-[420px_minmax(0,1fr)] items-start">

      <div class="order-1 space-y-6 min-w-0">
        <!-- Saldos -->
        <section>
          <!-- Mesma altura da linha "Movimentações" (que tem os filtros) para alinhar as colunas -->
          <div class="flex items-center gap-2 mb-3 2xl:min-h-[30px]">
            <span class="w-6 h-6 rounded-md flex items-center justify-center bg-purple-500/15 shrink-0">
              <i class="fa-solid fa-coins text-purple-600 dark:text-purple-400 text-[11px]" aria-hidden="true" />
            </span>
            <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Saldo disponível</h2>
          </div>
          <div :class="['overflow-hidden', cardBase]">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/5">
                  <th class="text-left px-3.5 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Plano</th>
                  <th class="text-right px-3.5 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">30 dias</th>
                  <th class="text-right px-3.5 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">12 meses</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-white/5">
                <tr v-for="p in PLANOS_PARCEIRO" :key="p.codigo">
                  <td class="px-3.5 py-2.5 font-medium text-slate-800 dark:text-white">{{ p.nome }}</td>
                  <td
                    v-for="m in ([1, 12] as const)"
                    :key="m"
                    class="px-3.5 py-2.5 text-right font-semibold tabular-nums"
                    :class="saldos[creditoDoPlano(p.codigo, m)] > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-300 dark:text-slate-600'"
                  >
                    <span v-if="loadingCreditos" class="inline-block w-6 h-4 bg-slate-100 dark:bg-white/5 rounded animate-pulse" />
                    <template v-else>{{ saldos[creditoDoPlano(p.codigo, m)] }}</template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- Preços: tabela larga demais para a coluna de 420 px, então ocupa a
           linha toda. Abaixo de 2xl continua antes do extrato. -->
      <section v-if="gruposPreco.length" class="order-2 2xl:order-3 2xl:col-span-2 min-w-0 space-y-4">
        <div class="flex items-center gap-2">
          <span class="w-6 h-6 rounded-md flex items-center justify-center bg-emerald-500/15 shrink-0">
            <i class="fa-solid fa-tag text-emerald-600 dark:text-emerald-400 text-[11px]" aria-hidden="true" />
          </span>
          <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Quanto custa</h2>
        </div>

        <div v-for="grupo in gruposPreco" :key="grupo.titulo" :class="['p-4 sm:p-5 space-y-3', cardBase]">
          <div>
            <p class="text-sm font-semibold text-slate-900 dark:text-white">{{ grupo.titulo }}</p>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">{{ grupo.sub }}</p>
          </div>

          <div class="overflow-x-auto rounded-md border border-slate-100 dark:border-white/5">
            <table class="w-full min-w-[640px] text-sm">
              <thead>
                <tr class="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/5">
                  <th class="text-left px-3.5 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Plano</th>
                  <th class="text-right px-3.5 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Preço por licença</th>
                  <th class="text-right px-3.5 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Revenda sugerida</th>
                  <th class="text-right px-3.5 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Quanto você ganha</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-white/5">
                <tr v-for="l in grupo.linhas" :key="l.tipo">
                  <td class="px-3.5 py-2.5">
                    <p class="font-medium text-slate-800 dark:text-white">{{ l.titulo }}</p>
                    <p class="text-[11px] text-slate-500 dark:text-slate-400">{{ l.alcance }}</p>
                  </td>
                  <td class="px-3.5 py-2.5 text-right">
                    <p v-for="(p, i) in l.faixas" :key="p.quantidade_min" class="whitespace-nowrap">
                      <span v-if="l.faixas.length > 1" class="text-xs text-slate-500 dark:text-slate-400">{{ faixaLabel(l.faixas, i) }}: </span>
                      <span class="font-medium text-slate-800 dark:text-white tabular-nums">{{ fmtBRL(p.preco_unitario) }}</span>
                    </p>
                  </td>
                  <td class="px-3.5 py-2.5 text-right font-medium text-slate-800 dark:text-white tabular-nums whitespace-nowrap">{{ fmtBRL(l.revenda) }}</td>
                  <td class="px-3.5 py-2.5 text-right font-medium text-emerald-700 dark:text-emerald-400 tabular-nums whitespace-nowrap">
                    {{ fmtBRL(l.ganhoMenor) }}<template v-if="l.ganhoMaior !== l.ganhoMenor"> a {{ fmtBRL(l.ganhoMaior) }}</template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p class="text-xs text-slate-400 dark:text-slate-500 flex items-start gap-1.5">
          <i class="fa-solid fa-circle-info text-[10px] mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <strong>Você revende pelo valor que quiser.</strong> Os valores de revenda são só a referência sugerida pela Agzap para o cálculo.
            Crédito de plano acima renova plano abaixo: Enterprise serve para PRO e Start, e PRO serve para Start. Start não renova PRO, PRO não renova Enterprise,
            e Delivery só renova Delivery. A licença de 12 meses é para o cliente que assina o plano anual. O crédito entra na carteira depois que a Agzap confirma o pagamento.
          </span>
        </p>

        <div class="px-3 py-2.5 rounded-md bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 flex items-start gap-2 text-xs leading-relaxed text-orange-800 dark:text-orange-300">
          <i class="fa-solid fa-circle-info text-[11px] mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Delivery: só renova empresas que vendem pelo módulo Delivery. O crédito usado define a cota de pedidos do cliente, e a contagem volta a zero a cada renovação.
            A sobra da cota não acumula. O crédito até 500 deixa a cota em 500 e não renova quem passou de 500 pedidos no ciclo.
            O crédito acima de 500 renova qualquer cliente com Delivery e sobe a cota para 5.000.
            Cliente sem pedidos gera aviso no 1º mês e tem o crédito de Delivery bloqueado no 2º.
          </span>
        </div>

        <!-- Só um aviso: o token é colocado na conta do cliente, nunca por aqui. -->
        <div class="p-4 sm:px-5 rounded-md bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 flex items-start gap-3 text-sky-900 dark:text-sky-200">
          <i class="fa-solid fa-key text-sm mt-0.5 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
          <div class="min-w-0 flex-1 space-y-2.5">
            <div>
              <p class="text-sm font-semibold">Aviso: a IA do Delivery precisa de um token da OpenAI</p>
              <p class="text-xs leading-relaxed mt-0.5">Você decide como trabalhar com cada cliente:</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div class="px-3 py-2.5 rounded-md bg-white dark:bg-white/[0.04] border border-sky-100 dark:border-white/10">
                <p class="text-xs font-semibold">Oferecer o seu próprio token</p>
                <p class="text-xs leading-relaxed mt-0.5 text-slate-600 dark:text-slate-400">
                  No Delivery, o custo de crédito da OpenAI é irrisório. Compensa vender o plano já com a OpenAI inclusa, pelo valor de revenda sugerido.
                </p>
              </div>
              <div class="px-3 py-2.5 rounded-md bg-white dark:bg-white/[0.04] border border-sky-100 dark:border-white/10">
                <p class="text-xs font-semibold">Cliente usa o token dele</p>
                <p class="text-xs leading-relaxed mt-0.5 text-slate-600 dark:text-slate-400">
                  O próprio cliente cola o token dele no painel e paga a OpenAI direto.
                </p>
              </div>
            </div>
            <p class="text-xs leading-relaxed">
              Nos dois casos, o token é colocado em <strong class="font-semibold">Configurações › Integrações</strong>, na conta do cliente. Isso não é feito pelo painel do parceiro.
            </p>
          </div>
        </div>
      </section>

      <!-- Extrato -->
      <section class="order-3 2xl:order-2 min-w-0">
        <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
          <div class="flex items-center gap-2">
            <span class="w-6 h-6 rounded-md flex items-center justify-center bg-purple-500/15 shrink-0">
              <i class="fa-solid fa-receipt text-purple-600 dark:text-purple-400 text-[11px]" aria-hidden="true" />
            </span>
            <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Movimentações</h2>
          </div>
          <div class="flex gap-1.5 sm:ml-auto">
            <button
              v-for="f in ([
                { id: 'todas', label: 'Todas' },
                { id: 'entradas', label: 'Entradas' },
                { id: 'consumos', label: 'Consumos' },
              ] as const)"
              :key="f.id"
              type="button"
              @click="filtro = f.id"
              class="px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors"
              :class="filtro === f.id
                ? 'border-purple-400 bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400'
                : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20'"
            >{{ f.label }}</button>
          </div>
        </div>

        <div :class="['overflow-hidden', cardBase]">
          <div v-if="loadingCreditos" class="p-5 space-y-3">
            <div v-for="i in 4" :key="i" class="h-10 bg-slate-100 dark:bg-white/5 rounded animate-pulse" />
          </div>

          <div v-else-if="movimentacoesFiltradas.length === 0" class="px-5 py-12 text-center">
            <i class="fa-solid fa-receipt text-slate-300 dark:text-slate-700 text-2xl mb-2 block" aria-hidden="true" />
            <p class="text-slate-500 text-sm">Nenhuma movimentação por aqui ainda</p>
            <p class="text-slate-400 dark:text-slate-600 text-xs mt-1">
              Assim que a Agzap liberar seus primeiros créditos, eles aparecem nesta lista.
            </p>
          </div>

          <!-- Rola por dentro: o extrato vira dezenas de linhas e empurrava o
               rodapé da página para longe. Cabeçalho fica fixo na rolagem. -->
          <div v-else class="overflow-auto max-h-[28rem] 2xl:max-h-[40rem]">
            <table class="w-full text-sm">
              <thead class="sticky top-0 z-10">
                <tr class="border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-900">
                  <th class="text-left px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Movimentação</th>
                  <th class="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Origem</th>
                  <th class="hidden sm:table-cell text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tipo</th>
                  <th class="text-right px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Qtd.</th>
                  <th class="text-right px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Valor</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-white/5">
                <tr v-for="m in movimentacoesFiltradas" :key="m.id" class="hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors">
                  <td class="px-3 sm:px-5 py-3">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <i
                        :class="['fa-solid', OPERACOES[m.operacao]?.icone ?? 'fa-circle', 'text-xs shrink-0', OPERACOES[m.operacao]?.cls]"
                        aria-hidden="true"
                      />
                      <div class="min-w-0">
                        <p class="text-sm font-medium text-slate-800 dark:text-white truncate">
                          {{ OPERACOES[m.operacao]?.label ?? m.operacao }}
                        </p>
                        <p class="text-[11px] text-slate-400 tabular-nums">{{ fmtDataHora(m.created_at) }}</p>
                        <!-- Cliente e validade só pertencem ao consumo. Entradas e
                             ajustes deixam de ocupar duas colunas cheias de traços. -->
                        <p v-if="m.operacao === 'consumo' && m.empresa_nome" class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {{ m.empresa_nome }}
                          <template v-if="m.nova_validade"> · válido até {{ fmtData(m.nova_validade) }}</template>
                        </p>
                        <span
                          class="md:hidden inline-flex mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap"
                          :class="naturezaMovimentacao(m).cls"
                        >{{ naturezaMovimentacao(m).label }}</span>
                        <!-- Motivo do lançamento: correção/estorno sem justificativa
                             visível vira número inexplicado no extrato do parceiro. -->
                        <p v-if="m.descricao" class="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5 whitespace-normal">
                          <i class="fa-solid fa-quote-left text-[8px] text-slate-300 dark:text-slate-600 mr-1" aria-hidden="true" />{{ m.descricao }}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td class="hidden md:table-cell px-5 py-3">
                    <span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap" :class="naturezaMovimentacao(m).cls">
                      {{ naturezaMovimentacao(m).label }}
                    </span>
                  </td>
                  <td class="hidden sm:table-cell px-5 py-3 text-center">
                    <span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {{ LABEL_CREDITO[m.tipo_credito] }}
                    </span>
                  </td>
                  <td class="px-3 sm:px-5 py-3 text-right">
                    <span
                      class="font-bold tabular-nums text-sm"
                      :class="m.quantidade > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'"
                    >{{ m.quantidade > 0 ? '+' : '' }}{{ m.quantidade }}</span>
                  </td>
                  <td class="px-3 sm:px-5 py-3 text-right whitespace-nowrap">
                    <template v-if="m.valor_pago !== null && m.valor_pago > 0">
                      <p class="font-bold tabular-nums text-sm" :class="m.quantidade < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-white'">
                        {{ m.quantidade < 0 ? '− ' : '' }}{{ fmtBRL(m.valor_pago) }}
                      </p>
                      <p v-if="Math.abs(m.quantidade) > 1" class="text-[10px] text-slate-400 tabular-nums">
                        {{ fmtBRL(valorUnitario(m)) }}/crédito
                      </p>
                    </template>
                    <span v-else-if="m.operacao === 'concessao_admin'" class="text-xs font-semibold text-sky-600 dark:text-sky-400">Cortesia</span>
                    <span v-else class="text-xs text-slate-400">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p v-if="movimentacoesFiltradas.length" class="mt-2 text-[11px] text-slate-400 dark:text-slate-600 tabular-nums">
          {{ movimentacoesFiltradas.length }} movimentaç{{ movimentacoesFiltradas.length === 1 ? 'ão' : 'ões' }}
        </p>

        <p class="mt-3 text-xs text-slate-400 dark:text-slate-600 flex items-start gap-1.5">
          <i class="fa-solid fa-lock text-[10px] mt-0.5" aria-hidden="true" />
          <span>
            O extrato é somente leitura. Crédito consumido em uma renovação não retorna ao saldo,
            mesmo se o cliente cancelar, for bloqueado ou ficar inadimplente.
          </span>
        </p>
      </section>

    </div>

    <ParceiroSolicitarModal
      :show="showSolicitar"
      tipo="creditos"
      :parceiro-nome="parceiro?.nome"
      :precos="precos"
      @close="showSolicitar = false"
    />
  </div>
</template>
