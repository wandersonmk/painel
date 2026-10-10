<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

const props = defineProps<{ parceiroNome?: string }>()

const {
  clientes, saldos, indicadores, loading, error, loadCarteira,
} = useParceiroLicencas()

const atualizando = ref(false)
const showSolicitar = ref(false)

async function recarregar() {
  atualizando.value = true
  await loadCarteira()
  atualizando.value = false
}

onMounted(loadCarteira)

const primeiroNome = computed(() => props.parceiroNome?.split(' ')[0] || '')
const agora = new Date()
const mesAtual = (() => {
  const s = agora.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
})()
const nomeMes = agora.toLocaleDateString('pt-BR', { month: 'long' })

/**
 * O dashboard é resumo: mostra só quem precisa de ação (vencido, vencendo em
 * 7 dias ou bloqueado). A carteira inteira fica em /parceiro/clientes.
 */
const precisamAtencao = computed(() =>
  clientes.value.filter(c =>
    c.situacao === 'vencido'
    || c.situacao === 'bloqueado_parceiro'
    || (c.situacao === 'ativo' && c.dias_restantes !== null && c.dias_restantes <= 7),
  ),
)

// ───────── Cartões de resumo (redesenho 09/10/2026) ─────────
// Mesmos 8 números de antes, agrupados no estilo dos cartões da página
// Clientes do admin. Enquanto a carteira não chegou (ou falhou) os cartões
// mostram "—" em vez de zeros; no "Atualizar" os números antigos ficam na
// tela até chegarem os novos.
const pronto = computed(() => !!indicadores.value && !error.value)
const avisoResumo = computed(() => (error.value ? 'Não foi possível carregar' : 'Carregando…'))

const nf = new Intl.NumberFormat('pt-BR')
const fmt = (n: number | null | undefined) => nf.format(n ?? 0)

const totalCreditos = computed(() => saldos.value.mensal_30d + saldos.value.anual_12m)
const semSaldo = computed(() => saldos.value.mensal_30d < 1 && saldos.value.anual_12m < 1)

const tilesCreditos = computed(() => [
  { label: '30 dias', icon: 'fa-calendar-day', iconCls: 'text-purple-500', valor: fmt(saldos.value.mensal_30d), detalhe: 'disponíveis' },
  { label: '12 meses', icon: 'fa-calendar-days', iconCls: 'text-indigo-500', valor: fmt(saldos.value.anual_12m), detalhe: 'disponíveis' },
])

const renovacoesMes = computed(() => indicadores.value?.renovacoes_mes ?? 0)
const tilesUso = computed(() => [
  {
    label: 'Renovações',
    icon: 'fa-rotate',
    iconCls: 'text-sky-500',
    valor: fmt(renovacoesMes.value),
    detalhe: renovacoesMes.value === 1 ? 'cliente renovado' : 'clientes renovados',
  },
])

const vencendo7d = computed(() => indicadores.value?.vencendo_7d ?? 0)
const tilesClientes = computed(() => [
  { label: 'Ativos', icon: 'fa-circle-check', iconCls: 'text-emerald-500', valor: fmt(indicadores.value?.ativos), detalhe: 'em dia' },
  {
    label: 'Vencendo em 7 dias',
    icon: 'fa-hourglass-half',
    iconCls: 'text-amber-500',
    valor: fmt(vencendo7d.value),
    detalhe: 'renove já',
    valorCls: vencendo7d.value > 0 ? 'text-amber-600 dark:text-amber-400' : '',
  },
])

const vencidos = computed(() => indicadores.value?.vencidos ?? 0)

function irParaAtencao() {
  document.getElementById('precisam-atencao')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const painel = 'rounded-2xl bg-white dark:bg-slate-900/60 ring-1 ring-inset ring-slate-200/70 dark:ring-white/10'
</script>

<template>
  <!-- Largura toda da área de conteúdo (sem max-width), igual à página de Indicados.
       Topo mais perto da barra (09/10/2026): menos respiro em cima. -->
  <div class="px-4 pt-4 pb-6 sm:px-6 sm:pt-5 md:px-8 md:pb-8 space-y-4 sm:space-y-5 w-full">

    <!-- Cabeçalho: os botões descem para a linha de baixo quando não cabem -->
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div class="min-w-0">
        <h1 class="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">
          {{ primeiroNome ? `Olá, ${primeiroNome}` : 'Painel do Parceiro' }}
        </h1>
        <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
          {{ mesAtual }} · seus créditos e sua carteira
        </p>
      </div>
      <div class="flex items-center gap-2 w-full sm:w-auto">
        <button
          @click="showSolicitar = true"
          type="button"
          class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 h-9 px-4 rounded-xl text-sm font-medium whitespace-nowrap bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20 transition-colors"
        >
          <i class="fa-solid fa-coins text-sm" aria-hidden="true" />
          <span>Comprar créditos</span>
        </button>
        <button
          @click="recarregar"
          :disabled="atualizando || loading"
          type="button"
          class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 h-9 px-4 rounded-xl text-sm font-medium whitespace-nowrap bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-purple-700 dark:bg-slate-900/60 dark:text-slate-200 dark:ring-white/10 dark:hover:bg-slate-800 dark:hover:text-purple-300 disabled:opacity-50 transition-colors"
        >
          <i class="fa-solid fa-arrows-rotate text-sm" :class="{ 'animate-spin': atualizando }" aria-hidden="true" />
          <span>Atualizar</span>
        </button>
      </div>
    </div>

    <!-- Link de indicação: logo abaixo do cabeçalho, na largura toda -->
    <ParceiroLinkIndicacao />

    <div
      v-if="error"
      role="alert"
      class="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 ring-1 ring-inset ring-red-200 dark:ring-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-center gap-2"
    >
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
      <span>{{ error }}</span>
    </div>

    <!-- ───────── Resumo: créditos, uso no mês, clientes e vencidos ─────────
         1 coluna no celular, 2 no tablet/notebook, 4 em telas largas. -->
    <section aria-label="Resumo da sua carteira" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
      <ParceiroResumoCard
        titulo="Créditos"
        icon="fa-coins"
        tom="lavanda"
        principal-label="Total disponível"
        :principal="fmt(totalCreditos)"
        :principal-detalhe="semSaldo ? 'nenhum crédito para ativar ou renovar' : 'para ativar ou renovar clientes'"
        :tiles="tilesCreditos"
        :pronto="pronto"
        :aviso="avisoResumo"
      >
        <template #rodape>
          <div
            v-if="pronto && semSaldo"
            class="rounded-xl bg-amber-100/70 dark:bg-amber-500/10 ring-1 ring-inset ring-amber-200/70 dark:ring-amber-500/20 px-3 py-2.5 text-[11px] leading-snug text-amber-800 dark:text-amber-300"
          >
            <p class="flex items-start gap-1.5">
              <i class="fa-solid fa-circle-exclamation mt-0.5 shrink-0" aria-hidden="true" />
              <span>Você está <span class="font-medium">sem créditos</span>. Compre licenças com a Agzap para conseguir ativar ou renovar clientes.</span>
            </p>
            <button
              type="button"
              @click="showSolicitar = true"
              class="mt-1.5 ml-[18px] inline-flex items-center gap-1 font-medium text-amber-900 dark:text-amber-200 hover:underline underline-offset-2"
            >
              Comprar créditos
              <i class="fa-solid fa-arrow-right text-[10px]" aria-hidden="true" />
            </button>
          </div>
          <NuxtLink
            to="/parceiro/creditos"
            class="self-start inline-flex items-center gap-1 text-xs font-medium text-purple-700 hover:text-purple-900 dark:text-purple-300 dark:hover:text-purple-200 transition-colors"
          >
            Ver extrato
            <i class="fa-solid fa-arrow-right text-[10px]" aria-hidden="true" />
          </NuxtLink>
        </template>
      </ParceiroResumoCard>

      <ParceiroResumoCard
        titulo="Uso no mês"
        icon="fa-chart-line"
        tom="ceu"
        principal-label="Créditos consumidos"
        :principal="fmt(indicadores?.creditos_consumidos_mes)"
        :principal-detalhe="`créditos usados em ${nomeMes}`"
        :tiles="tilesUso"
        :pronto="pronto"
        :aviso="avisoResumo"
      />

      <ParceiroResumoCard
        titulo="Clientes"
        icon="fa-user-group"
        tom="menta"
        principal-label="Total de clientes"
        :principal="fmt(indicadores?.total)"
        principal-detalhe="vinculados à sua conta"
        :tiles="tilesClientes"
        :pronto="pronto"
        :aviso="avisoResumo"
      >
        <template #rodape>
          <NuxtLink
            to="/parceiro/clientes"
            class="self-start inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-200 transition-colors"
          >
            Ver todos os clientes
            <i class="fa-solid fa-arrow-right text-[10px]" aria-hidden="true" />
          </NuxtLink>
        </template>
      </ParceiroResumoCard>

      <ParceiroResumoCard
        titulo="Vencidos"
        icon="fa-circle-exclamation"
        tom="rosa"
        principal-label="Clientes vencidos"
        :principal="fmt(vencidos)"
        :principal-cls="vencidos > 0 ? 'text-rose-600 dark:text-rose-400' : ''"
        :principal-detalhe="vencidos > 0 ? 'sem acesso até você renovar' : 'nenhum cliente sem acesso'"
        :pronto="pronto"
        :aviso="avisoResumo"
      >
        <template #rodape>
          <button
            v-if="pronto && precisamAtencao.length > 0"
            type="button"
            @click="irParaAtencao"
            class="self-start inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:text-rose-900 dark:text-rose-300 dark:hover:text-rose-200 transition-colors"
          >
            Ver quem precisa de atenção
            <i class="fa-solid fa-arrow-down text-[10px]" aria-hidden="true" />
          </button>
        </template>
      </ParceiroResumoCard>
    </section>

    <!-- ───────── Só quem precisa de ação ───────── -->
    <section
      id="precisam-atencao"
      aria-labelledby="precisam-atencao-titulo"
      class="scroll-mt-20 overflow-hidden"
      :class="painel"
    >
      <div class="flex items-center gap-2.5 px-4 sm:px-5 py-3.5">
        <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
          <i class="fa-solid fa-bell text-sm" aria-hidden="true" />
        </span>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h2 id="precisam-atencao-titulo" class="text-[15px] font-medium text-slate-800 dark:text-slate-100">
              Precisam de atenção
            </h2>
            <span
              v-if="!loading && precisamAtencao.length > 0"
              class="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-semibold tabular-nums bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400"
            >{{ precisamAtencao.length }}</span>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 leading-snug">
            Vencidos, vencendo em até 7 dias ou bloqueados por você
          </p>
        </div>
      </div>

      <ParceiroCarteiraTabela
        :clientes="precisamAtencao"
        :saldos="saldos"
        :loading="loading"
        :parceiro-nome="parceiroNome"
        compacto
        embutido
        :mensagem-vazio="clientes.length === 0
          ? 'Nenhum cliente vinculado a você ainda'
          : 'Tudo em dia — nenhum cliente vencendo ou bloqueado'"
        @changed="loadCarteira()"
      >
        <template #vazio>
          <p v-if="clientes.length === 0" class="text-slate-400 dark:text-slate-500 text-xs mt-1">
            Quando a Agzap vincular clientes à sua conta, eles aparecem aqui.
          </p>
          <NuxtLink v-else to="/parceiro/clientes" class="inline-block mt-3 text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline">
            Ver a carteira completa →
          </NuxtLink>
        </template>
      </ParceiroCarteiraTabela>
    </section>

    <ParceiroSolicitarModal
      :show="showSolicitar"
      tipo="creditos"
      :parceiro-nome="parceiroNome"
      @close="showSolicitar = false"
    />
  </div>
</template>
