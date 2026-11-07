<script setup lang="ts">
import { computed, ref } from 'vue'
import { CREDITOS, LABEL_CREDITO, PLANOS_PARCEIRO, TIPOS_CREDITO, type PrecoLicenca, type TipoCredito } from '~/composables/useParceiroLicencas'
import type { RecursosPlano } from '~/utils/planosItens'

/**
 * "Quanto custa": preço por licença, revenda sugerida e ganho, por plano e
 * período. Clicar no plano abre o que vem nele. Telas Créditos e Preços.
 */
const props = defineProps<{
  precos: PrecoLicenca[]
  planos: RecursosPlano[]
}>()

/** Uma linha por crédito, com as faixas e o ganho já calculados a partir da tabela. */
function linhasDoPeriodo(meses: 1 | 12) {
  return TIPOS_CREDITO.filter(t => CREDITOS[t].meses === meses).map((tipo) => {
    const plano = PLANOS_PARCEIRO.find(p => p.codigo === CREDITOS[tipo].plano)
    const faixas = props.precos.filter(p => p.tipo_credito === tipo)
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
type Linha = ReturnType<typeof linhasDoPeriodo>[number]

const gruposPreco = computed(() => [
  { titulo: 'Licenças de 30 dias', sub: 'Renovam um cliente por 30 dias corridos', linhas: linhasDoPeriodo(1) },
  { titulo: 'Licenças de 12 meses', sub: 'Para o cliente que assina o plano anual', linhas: linhasDoPeriodo(12) },
].filter(grupo => grupo.linhas.length > 0))

// "1 a 5 licenças" sai da quantidade_min da própria faixa e da seguinte —
// antes o "até 5" estava escrito na mão e desalinhava se a tabela mudasse.
function faixaLabel(faixas: PrecoLicenca[], i: number) {
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

const textoGanho = (l: Linha) => (l.ganhoMaior !== l.ganhoMenor ? `${fmtBRL(l.ganhoMenor)} a ${fmtBRL(l.ganhoMaior)}` : fmtBRL(l.ganhoMenor))

// ───────── O que vem no plano ─────────
const detalhe = ref<Linha | null>(null)
const planoDoDetalhe = computed(() => {
  const l = detalhe.value
  return l ? props.planos.find(p => p.codigo === CREDITOS[l.tipo as TipoCredito].plano) ?? null : null
})
const resumoDetalhe = computed(() => {
  const l = detalhe.value
  if (!l) return []
  return [
    ...l.faixas.map((f, i) => ({
      rotulo: l.faixas.length > 1 ? faixaLabel(l.faixas, i) : 'Preço por licença',
      valor: fmtBRL(f.preco_unitario),
    })),
    { rotulo: 'Revenda sugerida', valor: fmtBRL(l.revenda) },
    { rotulo: 'Quanto você ganha', valor: textoGanho(l), destaque: true },
  ]
})
const subtituloDetalhe = computed(() => {
  const l = detalhe.value
  if (!l) return ''
  return `Vale ${CREDITOS[l.tipo as TipoCredito].meses === 12 ? '12 meses' : '30 dias'}. ${l.alcance}.`
})
const NOTA = 'É o que o cliente recebe quando você renova com este crédito. Se o cliente precisar de algo fora do plano, fale com a Agzap.'

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span class="w-6 h-6 rounded-md flex items-center justify-center bg-emerald-500/15 shrink-0">
        <i class="fa-solid fa-tag text-emerald-600 dark:text-emerald-400 text-[11px]" aria-hidden="true" />
      </span>
      <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Quanto custa</h2>
      <span class="text-[11px] text-slate-400 dark:text-slate-500">· clique no plano para ver o que vem nele</span>
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
                <button
                  type="button"
                  class="group text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
                  :aria-label="`Ver o que vem no ${LABEL_CREDITO[l.tipo as TipoCredito]}`"
                  @click="detalhe = l"
                >
                  <span class="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-white group-hover:text-purple-700 dark:group-hover:text-purple-300">
                    {{ l.titulo }}
                    <i class="fa-solid fa-circle-info text-[11px] text-slate-400 group-hover:text-purple-500" aria-hidden="true" />
                  </span>
                  <span class="block text-[11px] text-slate-500 dark:text-slate-400">{{ l.alcance }}</span>
                </button>
              </td>
              <td class="px-3.5 py-2.5 text-right">
                <p v-for="(p, i) in l.faixas" :key="p.quantidade_min" class="whitespace-nowrap">
                  <span v-if="l.faixas.length > 1" class="text-xs text-slate-500 dark:text-slate-400">{{ faixaLabel(l.faixas, i) }}: </span>
                  <span class="font-medium text-slate-800 dark:text-white tabular-nums">{{ fmtBRL(p.preco_unitario) }}</span>
                </p>
              </td>
              <td class="px-3.5 py-2.5 text-right font-medium text-slate-800 dark:text-white tabular-nums whitespace-nowrap">{{ fmtBRL(l.revenda) }}</td>
              <td class="px-3.5 py-2.5 text-right font-medium text-emerald-700 dark:text-emerald-400 tabular-nums whitespace-nowrap">{{ textoGanho(l) }}</td>
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

    <PlanoDetalhesModal
      :show="!!detalhe"
      :plano="planoDoDetalhe"
      :titulo="detalhe ? `O que vem no ${LABEL_CREDITO[detalhe.tipo as TipoCredito]}` : ''"
      :subtitulo="subtituloDetalhe"
      :resumo="resumoDetalhe"
      :nota="NOTA"
      @close="detalhe = null"
    />
  </div>
</template>
