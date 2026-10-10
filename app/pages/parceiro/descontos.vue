<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { ClienteCarteira, DescontosParceiro, IndicadoraDesconto, SituacaoAcesso } from '~/composables/useParceiroLicencas'
import type { TipoSolicitacao } from '~/components/shared/parceiro/ParceiroSolicitarModal.vue'
import { formatPhoneSemDdiBrasil, whatsappLink } from '~/utils/phone'

definePageMeta({
  middleware: ['auth', 'parceiro'],
  layout: 'parceiro',
})

/**
 * Descontos de indicação que o parceiro paga: quando um cliente dele indica
 * outro, o desconto sai da cobrança do parceiro. Aqui ele vê quanto está
 * retido, quanto já pode aplicar e o efeito na próxima mensalidade de cada um.
 */
const { parceiro, checkParceiro } = useParceiro()
const { clientes: carteira, saldos, loadCarteira, loadDescontos } = useParceiroLicencas()

const dados = ref<DescontosParceiro | null>(null)
const carregando = ref(true)
const erro = ref<string | null>(null)

async function carregar() {
  carregando.value = true
  erro.value = null
  try {
    dados.value = await loadDescontos()
  }
  catch (e: any) {
    erro.value = String(e?.message || 'Não foi possível carregar os descontos.')
  }
  finally {
    carregando.value = false
  }
}

onMounted(async () => {
  // A carteira só alimenta os modais (valor, renovar, solicitar): se falhar, a página segue.
  await Promise.all([checkParceiro(), carregar(), loadCarteira()])
})

const indicadoras = computed(() => dados.value?.indicadoras ?? [])
const totais = computed(() => dados.value?.totais ?? null)
const telefone = computed(() => dados.value?.parceiro.telefone ?? null)

// ───────── Formatação ─────────
const fmtBRL = (v: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)

function primeiroNome(s: string) {
  return s.trim().split(/\s+/)[0] || s
}

const SITUACAO_CURTA: Record<SituacaoAcesso, string> = {
  ativo: '',
  vencido: 'vencido',
  bloqueado_parceiro: 'bloqueado',
  bloqueado_admin: 'bloqueado',
}

function rotuloIndicado(i: IndicadoraDesconto['indicados'][number]) {
  const nome = primeiroNome(i.responsavel || i.nome)
  if (i.situacao === null) return `${nome} (fora da sua rede)`
  const s = SITUACAO_CURTA[i.situacao]
  return s ? `${nome} (${s})` : nome
}

const MAX_NOMES = 5

// ───────── Detalhes e ações (mesma fiação da página de Clientes) ─────────
const carteiraPorId = computed(() => new Map(carteira.value.map(c => [c.empresa_id, c])))
const detalheId = ref<string | null>(null)
const clienteSelecionado = computed<ClienteCarteira | null>(() =>
  detalheId.value ? (carteiraPorId.value.get(detalheId.value) ?? null) : null,
)
const showDetalhes = ref(false)
const showRenovar = ref(false)
const showValor = ref(false)
const showSolicitar = ref(false)
const tipoSolicitacao = ref<TipoSolicitacao>('instancia')

function verGanhos(id: string) {
  detalheId.value = id
  showDetalhes.value = true
}
function abrirSolicitacao(tipo: TipoSolicitacao) {
  tipoSolicitacao.value = tipo
  showDetalhes.value = false
  showSolicitar.value = true
}
function abrirValor() {
  showDetalhes.value = false
  showValor.value = true
}
function abrirRenovar() {
  showDetalhes.value = false
  showRenovar.value = true
}
async function recarregarTudo() {
  await Promise.all([carregar(), loadCarteira()])
}

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <div class="p-4 sm:p-6 md:p-8 space-y-6 w-full">

    <!-- Cabeçalho -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Descontos de indicação</h1>
        <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
          Quando um cliente seu indica outro, o desconto dele sai da sua cobrança. Aqui você acompanha e dá baixa.
        </p>
      </div>
      <button
        type="button"
        :disabled="carregando"
        class="inline-flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-sm font-normal transition-colors shadow-lg shadow-purple-600/30 dark:shadow-purple-600/20"
        @click="recarregarTudo"
      >
        <i class="fa-solid fa-arrows-rotate text-sm" :class="{ 'animate-spin': carregando }" aria-hidden="true" />
        <span class="hidden sm:inline">Atualizar</span>
      </button>
    </div>

    <div v-if="erro" class="p-4 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
      <span>{{ erro }}</span>
    </div>

    <!-- Indicadores -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-3">
      <div :class="[cardBase, 'p-4 min-w-0']">
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <span class="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">Clientes que indicaram</span>
          <i class="fa-solid fa-bullhorn text-purple-500 text-xs shrink-0" aria-hidden="true" />
        </div>
        <p class="text-2xl font-medium tabular-nums text-slate-900 dark:text-white leading-tight">
          <span v-if="carregando && !totais" class="inline-block h-7 w-10 rounded bg-slate-100 dark:bg-white/10 animate-pulse align-middle" />
          <template v-else>{{ totais?.indicadoras ?? 0 }}</template>
        </p>
        <p class="text-[11px] text-slate-400 dark:text-slate-500 truncate">trouxeram alguém para a sua rede</p>
      </div>

      <div :class="[cardBase, 'p-4 min-w-0']">
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <span class="text-[11px] uppercase tracking-wider text-amber-600 dark:text-amber-400 truncate">Retido (7 dias)</span>
          <i class="fa-solid fa-hourglass-half text-amber-500 text-xs shrink-0" aria-hidden="true" />
        </div>
        <p class="text-2xl font-medium tabular-nums text-slate-900 dark:text-white leading-tight">
          <span v-if="carregando && !totais" class="inline-block h-7 w-20 rounded bg-slate-100 dark:bg-white/10 animate-pulse align-middle" />
          <template v-else>{{ fmtBRL(totais?.retido) }}</template>
        </p>
        <p class="text-[11px] text-slate-400 dark:text-slate-500 truncate">
          <template v-if="(totais?.programado ?? 0) > 0">+{{ fmtBRL(totais?.programado) }} programado nos próximos meses</template>
          <template v-else>libera 7 dias depois do pagamento</template>
        </p>
      </div>

      <div :class="[cardBase, 'p-4 min-w-0']">
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <span class="text-[11px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 truncate">Liberado – você paga</span>
          <i class="fa-solid fa-hand-holding-dollar text-emerald-500 text-xs shrink-0" aria-hidden="true" />
        </div>
        <p class="text-2xl font-medium tabular-nums text-slate-900 dark:text-white leading-tight">
          <span v-if="carregando && !totais" class="inline-block h-7 w-20 rounded bg-slate-100 dark:bg-white/10 animate-pulse align-middle" />
          <template v-else>{{ fmtBRL(totais?.liberado) }}</template>
        </p>
        <p class="text-[11px] text-slate-400 dark:text-slate-500 truncate">
          <template v-if="(totais?.gratis_proxima ?? 0) > 0">
            {{ totais?.gratis_proxima }} mensalidade{{ totais?.gratis_proxima === 1 ? '' : 's' }} grátis na próxima cobrança
          </template>
          <template v-else>aplique na próxima cobrança</template>
        </p>
      </div>

      <div :class="[cardBase, 'p-4 min-w-0']">
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <span class="text-[11px] uppercase tracking-wider text-sky-600 dark:text-sky-400 truncate">Já usado</span>
          <i class="fa-solid fa-circle-check text-sky-500 text-xs shrink-0" aria-hidden="true" />
        </div>
        <p class="text-2xl font-medium tabular-nums text-slate-900 dark:text-white leading-tight">
          <span v-if="carregando && !totais" class="inline-block h-7 w-20 rounded bg-slate-100 dark:bg-white/10 animate-pulse align-middle" />
          <template v-else>{{ fmtBRL(totais?.utilizado) }}</template>
        </p>
        <p class="text-[11px] text-slate-400 dark:text-slate-500 truncate">baixas que você registrou</p>
      </div>

      <div :class="[cardBase, 'p-4 min-w-0 sm:col-span-2 lg:col-span-1']">
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <span class="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">WhatsApp que recebe os pedidos</span>
          <i class="fa-brands fa-whatsapp text-green-500 text-sm shrink-0" aria-hidden="true" />
        </div>
        <p class="text-lg font-medium tabular-nums text-slate-900 dark:text-white leading-tight truncate">
          <span v-if="carregando && !dados" class="inline-block h-6 w-32 rounded bg-slate-100 dark:bg-white/10 animate-pulse align-middle" />
          <a
            v-else-if="telefone && whatsappLink(telefone)"
            :href="whatsappLink(telefone)!"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-green-600 dark:hover:text-green-400 transition-colors"
          >{{ formatPhoneSemDdiBrasil(telefone) ?? telefone }}</a>
          <span v-else class="text-slate-400 text-sm font-normal">Não cadastrado</span>
        </p>
        <p class="text-[11px] text-slate-400 dark:text-slate-500 truncate">
          {{ telefone ? 'seus clientes pedem o desconto por aqui' : 'peça à Agzap para cadastrar o seu' }}
        </p>
      </div>
    </div>

    <!-- Quem indicou -->
    <div :class="['overflow-hidden', cardBase]">
      <div class="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-white/5">
        <h2 class="text-sm font-normal text-slate-900 dark:text-white">Clientes que indicaram</h2>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">Quem tem saldo liberado aparece primeiro</p>
      </div>

      <div v-if="carregando && !dados" class="p-5 space-y-3">
        <div v-for="i in 4" :key="i" class="flex items-center gap-3">
          <div class="w-8 h-8 rounded bg-slate-100 dark:bg-white/5 animate-pulse shrink-0" />
          <div class="flex-1 space-y-1.5">
            <div class="h-3 bg-slate-100 dark:bg-white/5 rounded animate-pulse w-2/3" />
            <div class="h-2.5 bg-slate-100 dark:bg-white/5 rounded animate-pulse w-1/3" />
          </div>
        </div>
      </div>

      <div v-else-if="!indicadoras.length" class="px-5 py-14 text-center">
        <i class="fa-solid fa-gift text-slate-300 dark:text-slate-700 text-3xl mb-2 block" aria-hidden="true" />
        <p class="text-slate-600 dark:text-slate-300 text-sm">Nenhum cliente seu indicou alguém ainda</p>
        <p class="text-slate-400 dark:text-slate-500 text-xs mt-1">Quando alguém entrar pelo link de um cliente seu, o desconto dele aparece aqui.</p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-200 dark:border-white/5 bg-slate-50/60 dark:bg-white/[0.02]">
              <th class="text-left px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-normal text-slate-500 uppercase tracking-wider whitespace-nowrap">Cliente que indicou</th>
              <th class="hidden md:table-cell text-left px-4 py-3 text-xs font-normal text-slate-500 uppercase tracking-wider">Indicou</th>
              <th class="hidden sm:table-cell text-right px-4 py-3 text-xs font-normal text-slate-500 uppercase tracking-wider">Retido</th>
              <th class="text-right px-3 sm:px-4 py-3 text-[11px] sm:text-xs font-normal text-slate-500 uppercase tracking-wider">Liberado</th>
              <th class="hidden md:table-cell text-right px-4 py-3 text-xs font-normal text-slate-500 uppercase tracking-wider whitespace-nowrap">Já usado</th>
              <th class="hidden lg:table-cell text-left px-4 py-3 text-xs font-normal text-slate-500 uppercase tracking-wider whitespace-nowrap">Efeito na próxima cobrança</th>
              <th class="text-right px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-normal text-slate-500 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-white/5">
            <tr v-for="i in indicadoras" :key="i.empresa_id" class="hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors align-top">
              <td class="px-3 sm:px-5 py-3">
                <p class="text-sm text-slate-800 dark:text-white truncate max-w-[240px]">{{ i.nome }}</p>
                <p v-if="i.responsavel" class="text-xs text-slate-500 truncate max-w-[240px]">{{ i.responsavel }}</p>
                <p class="text-[11px] text-slate-400 mt-0.5 tabular-nums">Mensalidade {{ i.mensalidade !== null ? fmtBRL(i.mensalidade) : 'não definida' }}</p>
                <!-- Telas menores: o que as colunas escondem -->
                <p class="md:hidden text-[11px] text-slate-500 mt-1">
                  Indicou {{ i.indicados.length }} · usado {{ fmtBRL(i.utilizado) }}
                </p>
                <p class="lg:hidden text-[11px] mt-0.5" :class="i.efeito_proxima_cobranca.tipo === 'gratis' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'">
                  <template v-if="i.efeito_proxima_cobranca.tipo === 'gratis'">Mensalidade grátis</template>
                  <template v-else-if="i.efeito_proxima_cobranca.tipo === 'parcial'">−{{ fmtBRL(i.efeito_proxima_cobranca.valor) }} na próxima</template>
                </p>
              </td>

              <td class="hidden md:table-cell px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                <div class="flex flex-wrap gap-1 max-w-[280px]">
                  <span
                    v-for="ind in i.indicados.slice(0, MAX_NOMES)"
                    :key="ind.empresa_id"
                    class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 whitespace-nowrap"
                    :class="ind.situacao === 'ativo' ? '' : 'text-slate-400 dark:text-slate-500'"
                    :title="ind.nome"
                  >{{ rotuloIndicado(ind) }}</span>
                  <span v-if="i.indicados.length > MAX_NOMES" class="px-1.5 py-0.5 text-slate-400">+{{ i.indicados.length - MAX_NOMES }}</span>
                  <span v-if="!i.indicados.length" class="text-slate-400">—</span>
                </div>
              </td>

              <td class="hidden sm:table-cell px-4 py-3 text-right text-xs tabular-nums whitespace-nowrap" :class="i.retido > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'">
                {{ fmtBRL(i.retido) }}
                <span v-if="i.programado > 0" class="block text-[11px] text-violet-500" :title="'Meses seguintes do plano adiantado: liberam um por mês'">+{{ fmtBRL(i.programado) }} prog.</span>
              </td>

              <td class="px-3 sm:px-4 py-3 text-right text-sm tabular-nums whitespace-nowrap" :class="i.liberado > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'">
                {{ fmtBRL(i.liberado) }}
              </td>

              <td class="hidden md:table-cell px-4 py-3 text-right text-xs tabular-nums whitespace-nowrap" :class="i.utilizado > 0 ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400'">
                {{ fmtBRL(i.utilizado) }}
              </td>

              <td class="hidden lg:table-cell px-4 py-3 text-xs">
                <template v-if="i.efeito_proxima_cobranca.tipo === 'gratis'">
                  <span class="inline-block px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 whitespace-nowrap">
                    Mensalidade grátis
                  </span>
                  <span v-if="i.efeito_proxima_cobranca.sobra > 0" class="block text-[11px] text-slate-500 mt-1 tabular-nums">
                    sobram {{ fmtBRL(i.efeito_proxima_cobranca.sobra) }}
                  </span>
                </template>
                <span v-else-if="i.efeito_proxima_cobranca.tipo === 'parcial'" class="text-slate-700 dark:text-slate-200 tabular-nums whitespace-nowrap">
                  −{{ fmtBRL(i.efeito_proxima_cobranca.valor) }}
                  <span v-if="i.efeito_proxima_cobranca.percentual !== null" class="text-slate-400">({{ i.efeito_proxima_cobranca.percentual }}% da mensalidade)</span>
                </span>
                <span v-else class="text-slate-400">nenhum por enquanto</span>
              </td>

              <td class="px-3 sm:px-5 py-3 text-right">
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-normal text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors whitespace-nowrap"
                  @click="verGanhos(i.empresa_id)"
                >
                  <i class="fa-solid fa-gift text-[10px]" aria-hidden="true" />
                  <span class="hidden sm:inline">Ver ganhos</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Regra -->
    <div class="rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-4 py-3 flex items-start gap-2.5">
      <i class="fa-solid fa-lightbulb text-amber-600 dark:text-amber-400 text-sm mt-0.5" aria-hidden="true" />
      <p class="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
        Um cliente que indicou 10 pessoas no mesmo mês junta 100% e a mensalidade dele sai grátis.
        Você deixa de receber dele nesse mês, mas ganhou 10 clientes pagando.
      </p>
    </div>

    <p class="text-xs text-slate-400 dark:text-slate-600 flex items-start gap-1.5">
      <i class="fa-solid fa-circle-info text-[10px] mt-0.5" aria-hidden="true" />
      <span>
        10% no 1º mês e 5% nos seguintes, sobre a mensalidade cadastrada de quem indicou, retido 7 dias depois da ativação ou renovação.
        Quem paga o desconto dos seus clientes é você.
      </span>
    </p>

    <ParceiroClienteDetalhesModal
      :show="showDetalhes"
      :cliente="clienteSelecionado"
      :empresa-id="detalheId"
      aba-inicial="ganhos"
      permite-renovar
      @close="showDetalhes = false"
      @solicitar="abrirSolicitacao"
      @editar-valor="abrirValor"
      @renovar="abrirRenovar"
      @changed="recarregarTudo"
    />
    <ParceiroRenovarModal
      :show="showRenovar"
      :cliente="clienteSelecionado"
      :saldos="saldos"
      @close="showRenovar = false"
      @confirmed="recarregarTudo"
    />
    <ParceiroValorAssinaturaModal
      :show="showValor"
      :cliente="clienteSelecionado"
      @close="showValor = false"
      @saved="recarregarTudo"
    />
    <ParceiroSolicitarModal
      :show="showSolicitar"
      :tipo="tipoSolicitacao"
      :cliente="clienteSelecionado"
      :parceiro-nome="parceiro?.nome"
      @close="showSolicitar = false"
    />
  </div>
</template>
