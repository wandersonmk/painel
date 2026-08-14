<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { LABEL_CREDITO } from '~/composables/useParceiroLicencas'
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

const precosMensais = computed(() => precos.value.filter(p => p.tipo_credito === 'mensal_30d'))
const precosAnuais = computed(() => precos.value.filter(p => p.tipo_credito === 'anual_12m'))

const melhorPrecoMensal = computed(() =>
  Math.min(...precosMensais.value.map(p => Number(p.preco_unitario))))
const precoEntradaMensal = computed(() =>
  Math.max(...precosMensais.value.map(p => Number(p.preco_unitario))))
const precoAnual = computed(() => Number(precosAnuais.value[0]?.preco_unitario ?? 0))

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

/** Preço de referência de revenda ao cliente final, sugerido pela Agzap. */
const precoRevenda = computed(() => Number(precosMensais.value[0]?.preco_sugerido_revenda ?? 0))

/** Uma linha de lucro por faixa de compra: "comprando a X, lucre Y". */
const margensMensais = computed(() => {
  if (!precoRevenda.value) return []
  return precosMensais.value.map(p => ({
    compra: Number(p.preco_unitario),
    lucro: precoRevenda.value - Number(p.preco_unitario),
  }))
})

/** No anual, o que interessa é o custo por mês e o ganho no ano inteiro. */
const anualDetalhe = computed(() => {
  if (!precoAnual.value) return null
  const receitaAno = precoRevenda.value * 12
  return {
    porMes: precoAnual.value / 12,
    receitaAno,
    lucroAno: receitaAno ? receitaAno - precoAnual.value : 0,
  }
})

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
  <div class="p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8 max-w-[1400px] mx-auto w-full">

    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Créditos</h1>
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

    <!-- Saldos -->
    <div class="grid grid-cols-2 gap-3 sm:gap-4">
      <KpiCard label="Créditos de 30 dias" unit="disponíveis" icon="fa-solid fa-calendar-day" color="purple" :loading="loadingCreditos">
        {{ saldos.mensal_30d }}
      </KpiCard>
      <KpiCard label="Créditos de 12 meses" unit="disponíveis" icon="fa-solid fa-calendar-days" color="indigo" :loading="loadingCreditos">
        {{ saldos.anual_12m }}
      </KpiCard>
    </div>

    <!-- Tabela comercial -->
    <section v-if="precos.length > 0">
      <div class="flex items-center gap-2 mb-3">
        <div class="w-4 h-4 rounded flex items-center justify-center bg-emerald-500/20">
          <i class="fa-solid fa-tag text-emerald-600 dark:text-emerald-400 text-xs" aria-hidden="true" />
        </div>
        <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Quanto custa</h2>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <!-- Um cartão por tipo de licença: preço de entrada em destaque, faixas
             logo abaixo e a margem já calculada — o parceiro não deveria
             precisar fazer a conta de cabeça para saber quanto ganha. -->
        <div v-if="precosMensais.length" :class="['p-4 sm:p-5', cardBase]">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-bold text-slate-900 dark:text-white">Licença de 30 dias</p>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">Renova um cliente por 30 dias corridos</p>
            </div>
            <span class="shrink-0 w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-500/15 flex items-center justify-center">
              <i class="fa-solid fa-calendar-day text-purple-600 dark:text-purple-400 text-sm" aria-hidden="true" />
            </span>
          </div>

          <p class="mt-3 flex items-baseline gap-1.5">
            <span class="text-[11px] text-slate-400" v-if="precosMensais.length > 1">a partir de</span>
            <span class="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{{ fmtBRL(melhorPrecoMensal) }}</span>
            <span class="text-xs text-slate-400">/licença</span>
          </p>

          <ul class="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 space-y-1.5">
            <li
              v-for="(p, i) in precosMensais"
              :key="p.quantidade_min"
              class="flex items-baseline justify-between text-xs"
            >
              <span class="text-slate-500 dark:text-slate-400">{{ faixaLabel(precosMensais, i) }}</span>
              <span class="flex items-center gap-1.5">
                <span class="font-semibold text-slate-800 dark:text-white tabular-nums">{{ fmtBRL(p.preco_unitario) }}</span>
                <span
                  v-if="Number(p.preco_unitario) === melhorPrecoMensal && precosMensais.length > 1"
                  class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                >melhor preço</span>
              </span>
            </li>
          </ul>

          <!-- Uma frase por faixa, em vez do percentual solto que não dizia
               de onde saía nem sobre qual preço de compra. -->
          <div v-if="margensMensais.length" class="mt-3 pt-3 border-t border-slate-100 dark:border-white/5">
            <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Quanto você ganha</p>
            <ul class="space-y-1">
              <li v-for="m in margensMensais" :key="m.compra" class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Comprando a <span class="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{{ fmtBRL(m.compra) }}</span>
                e revendendo a <span class="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{{ fmtBRL(precoRevenda) }}</span>,
                lucre <span class="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{{ fmtBRL(m.lucro) }}</span>
              </li>
            </ul>
          </div>
        </div>

        <div v-if="precosAnuais.length" :class="['p-4 sm:p-5', cardBase]">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-bold text-slate-900 dark:text-white">Licença de 12 meses</p>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">Renova um cliente por um ano inteiro</p>
            </div>
            <span class="shrink-0 w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-500/15 flex items-center justify-center">
              <i class="fa-solid fa-calendar-days text-indigo-600 dark:text-indigo-400 text-sm" aria-hidden="true" />
            </span>
          </div>

          <p class="mt-3 flex items-baseline gap-1.5">
            <span class="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{{ fmtBRL(precoAnual) }}</span>
            <span class="text-xs text-slate-400">/licença</span>
          </p>

          <!-- Só as duas contas que importam no anual: quanto sai o mês e
               quanto sobra vendendo esse ano no preço mensal. -->
          <div v-if="anualDetalhe" class="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 space-y-2">
            <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Sai a <span class="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{{ fmtBRL(anualDetalhe.porMes) }}</span> por mês
              <template v-if="melhorPrecoMensal">
                — contra {{ fmtBRL(melhorPrecoMensal) }} na licença de 30 dias
              </template>
            </p>
            <p v-if="precoRevenda" class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Cobrando <span class="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{{ fmtBRL(precoRevenda) }}</span> por mês
              do seu cliente, são <span class="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{{ fmtBRL(anualDetalhe.receitaAno) }}</span> no ano:
              lucre <span class="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{{ fmtBRL(anualDetalhe.lucroAno) }}</span>
            </p>
          </div>
        </div>
      </div>

      <p class="mt-3 text-xs text-slate-400 dark:text-slate-500 flex items-start gap-1.5">
        <i class="fa-solid fa-circle-info text-[10px] mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          <strong>Você revende pelo valor que quiser</strong> — os {{ precoRevenda ? fmtBRL(precoRevenda) : 'valores' }} acima são
          só a referência sugerida pela Agzap para o cálculo. O crédito entra na carteira depois que a
          Agzap confirma o pagamento.
        </span>
      </p>
    </section>

    <!-- Extrato -->
    <section>
      <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
        <div class="flex items-center gap-2">
          <div class="w-4 h-4 rounded flex items-center justify-center bg-purple-500/20">
            <i class="fa-solid fa-receipt text-purple-600 dark:text-purple-400 text-xs" aria-hidden="true" />
          </div>
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
              : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-slate-300'"
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
        <div v-else class="overflow-auto max-h-[28rem]">
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

    <ParceiroSolicitarModal
      :show="showSolicitar"
      tipo="creditos"
      :parceiro-nome="parceiro?.nome"
      :precos="precos"
      @close="showSolicitar = false"
    />
  </div>
</template>
