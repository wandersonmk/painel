<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { PLANOS_PARCEIRO, creditoDoPlano, type PlanoCodigo } from '~/composables/useParceiroLicencas'

/**
 * Preços e planos: o que o parceiro paga por crédito, a revenda sugerida e o
 * que vem em cada plano, para escolher o crédito certo sem abrir o site.
 * A lista vem de planos_assinatura, a mesma que a renovação aplica no cliente.
 */
definePageMeta({
  middleware: ['auth', 'parceiro'],
  layout: 'parceiro',
})

const { parceiro, checkParceiro } = useParceiro()
const { precos, planos, loadingCreditos, error, loadCreditos } = useParceiroLicencas()

const showSolicitar = ref(false)
const planoAberto = ref<PlanoCodigo>('start')

onMounted(async () => {
  await Promise.all([checkParceiro(), loadCreditos()])
})

const recursos = computed(() => planos.value.find(p => p.codigo === planoAberto.value) ?? null)

function fmtBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

/** Menor preço pago (faixa de mais licenças) e revenda do crédito do plano no período. */
function precoDoPeriodo(meses: 1 | 12) {
  const faixas = precos.value.filter(p => p.tipo_credito === creditoDoPlano(planoAberto.value, meses))
  if (!faixas.length) return null
  const valores = faixas.map(f => Number(f.preco_unitario))
  return {
    menor: Math.min(...valores),
    maior: Math.max(...valores),
    revenda: Number(faixas[0]?.preco_sugerido_revenda ?? 0),
  }
}

const resumo = computed(() => ([
  { rotulo: '30 dias', p: precoDoPeriodo(1) },
  { rotulo: '12 meses', p: precoDoPeriodo(12) },
] as const).flatMap(({ rotulo, p }) => (p ? [{
  rotulo,
  pago: p.menor === p.maior ? fmtBRL(p.menor) : `${fmtBRL(p.menor)} a ${fmtBRL(p.maior)}`,
  revenda: p.revenda ? fmtBRL(p.revenda) : '—',
}] : [])))

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <div class="p-4 sm:p-6 md:p-8 space-y-6 w-full">
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Preços e planos</h1>
        <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
          Quanto você paga por crédito, a revenda sugerida e o que vem em cada plano
        </p>
      </div>
      <button
        type="button"
        class="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded text-sm font-normal bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30 dark:shadow-emerald-600/20 transition-all duration-150"
        @click="showSolicitar = true"
      >
        <i class="fa-solid fa-coins text-sm" aria-hidden="true" />
        <span>Solicitar novos créditos</span>
      </button>
    </div>

    <div v-if="error" class="p-4 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
      <span>{{ error }}</span>
    </div>

    <!-- O que vem em cada plano: uma aba por plano -->
    <section class="space-y-3">
      <div class="flex items-center gap-2">
        <span class="w-6 h-6 rounded-md flex items-center justify-center bg-purple-500/15 shrink-0">
          <i class="fa-solid fa-list-check text-purple-600 dark:text-purple-400 text-[11px]" aria-hidden="true" />
        </span>
        <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">O que vem em cada plano</h2>
      </div>

      <div :class="['overflow-hidden', cardBase]">
        <div class="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-white/10 px-2 pt-2" role="tablist" aria-label="Planos">
          <button
            v-for="p in PLANOS_PARCEIRO"
            :key="p.codigo"
            type="button"
            role="tab"
            :aria-selected="planoAberto === p.codigo"
            class="shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
            :class="planoAberto === p.codigo
              ? 'border-purple-600 font-medium text-purple-700 dark:border-purple-400 dark:text-purple-300'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'"
            @click="planoAberto = p.codigo"
          >{{ p.nome }}</button>
        </div>

        <div v-if="loadingCreditos" class="p-5 space-y-3">
          <div v-for="i in 5" :key="i" class="h-5 bg-slate-100 dark:bg-white/5 rounded animate-pulse" />
        </div>

        <p v-else-if="!recursos" class="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
          Não consegui carregar o que vem nos planos. Recarregue a página.
        </p>

        <div v-else class="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <PlanoRecursos :plano="recursos" />

          <div class="space-y-3 lg:border-l lg:border-slate-200 lg:pl-5 lg:dark:border-white/10">
            <p class="text-[13px] text-slate-600 dark:text-slate-300">
              {{ PLANOS_PARCEIRO.find(p => p.codigo === planoAberto)?.alcance }}.
            </p>
            <dl v-for="r in resumo" :key="r.rotulo" class="rounded-md border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/5">
              <div class="px-3 py-2">
                <dt class="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Crédito de {{ r.rotulo }}</dt>
              </div>
              <div class="flex items-center justify-between gap-3 px-3 py-2">
                <dt class="text-[13px] text-slate-500 dark:text-slate-400">Você paga</dt>
                <dd class="text-sm font-medium tabular-nums text-slate-900 dark:text-white">{{ r.pago }}</dd>
              </div>
              <div class="flex items-center justify-between gap-3 px-3 py-2">
                <dt class="text-[13px] text-slate-500 dark:text-slate-400">Revenda sugerida</dt>
                <dd class="text-sm font-medium tabular-nums text-slate-900 dark:text-white">{{ r.revenda }}</dd>
              </div>
            </dl>
            <p class="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              É o que o cliente recebe quando você renova com o crédito deste plano. Se ele precisar de algo fora do plano, fale com a Agzap.
            </p>
          </div>
        </div>
      </div>
    </section>

    <section v-if="precos.length" class="min-w-0">
      <ParceiroQuantoCusta :precos="precos" :planos="planos" />
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
