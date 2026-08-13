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
const mesAtual = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

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

const semSaldo = computed(() => saldos.value.mensal_30d < 1 && saldos.value.anual_12m < 1)
</script>

<template>
  <div class="p-4 sm:p-6 md:p-8 space-y-6 max-w-[1400px] mx-auto w-full">

    <!-- Cabeçalho -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
      <div>
        <h1 class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          {{ primeiroNome ? `Olá, ${primeiroNome}` : 'Painel do Parceiro' }}
        </h1>
        <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5 capitalize">
          {{ mesAtual }} · seus créditos e sua carteira
        </p>
      </div>
      <div class="flex items-center gap-2 w-full sm:w-auto">
        <button
          @click="showSolicitar = true"
          type="button"
          class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30 dark:shadow-emerald-600/20 transition-all duration-150"
        >
          <i class="fa-solid fa-coins text-sm" aria-hidden="true" />
          <span>Comprar créditos</span>
        </button>
        <button
          @click="recarregar"
          :disabled="atualizando || loading"
          type="button"
          class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-sm font-semibold transition-all duration-150 shadow-lg shadow-purple-600/30 dark:shadow-purple-600/20"
        >
          <i class="fa-solid fa-arrows-rotate text-sm" :class="{ 'animate-spin': atualizando }" aria-hidden="true" />
          <span>Atualizar</span>
        </button>
      </div>
    </div>

    <div v-if="error" class="p-4 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
      <span>{{ error }}</span>
    </div>

    <!-- ───────── Carteira de créditos ───────── -->
    <section>
      <div class="flex items-center gap-2 mb-3">
        <div class="w-4 h-4 rounded flex items-center justify-center bg-purple-500/20">
          <i class="fa-solid fa-coins text-purple-600 dark:text-purple-400 text-xs" aria-hidden="true" />
        </div>
        <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Minha Carteira de Créditos</h2>
        <NuxtLink to="/parceiro/creditos" class="ml-auto text-xs text-slate-500 hover:text-purple-700 dark:hover:text-purple-400 transition-colors font-medium">
          Ver extrato →
        </NuxtLink>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="Créditos de 30 dias" unit="disponíveis" icon="fa-solid fa-calendar-day" color="purple" :loading="loading">
          {{ saldos.mensal_30d }}
        </KpiCard>
        <KpiCard label="Créditos de 12 meses" unit="disponíveis" icon="fa-solid fa-calendar-days" color="indigo" :loading="loading">
          {{ saldos.anual_12m }}
        </KpiCard>
        <KpiCard label="Consumidos no mês" unit="créditos" icon="fa-solid fa-arrow-trend-down" color="amber" :loading="loading">
          {{ indicadores?.creditos_consumidos_mes ?? 0 }}
        </KpiCard>
        <KpiCard label="Renovações no mês" unit="clientes" icon="fa-solid fa-rotate" color="emerald" :loading="loading">
          {{ indicadores?.renovacoes_mes ?? 0 }}
        </KpiCard>
      </div>

      <div
        v-if="!loading && semSaldo"
        class="mt-3 rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-4 py-3 flex items-start gap-2.5"
      >
        <i class="fa-solid fa-circle-exclamation text-amber-600 dark:text-amber-400 text-sm mt-0.5" aria-hidden="true" />
        <p class="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          Você está <strong>sem créditos</strong>. Compre licenças com a Agzap para conseguir ativar ou renovar clientes.
        </p>
      </div>
    </section>

    <!-- ───────── Resumo da carteira de clientes ───────── -->
    <section>
      <div class="flex items-center gap-2 mb-3">
        <div class="w-4 h-4 rounded flex items-center justify-center bg-blue-500/20">
          <i class="fa-solid fa-users text-blue-600 dark:text-blue-400 text-xs" aria-hidden="true" />
        </div>
        <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Meus Clientes</h2>
        <NuxtLink to="/parceiro/clientes" class="ml-auto text-xs text-slate-500 hover:text-purple-700 dark:hover:text-purple-400 transition-colors font-medium">
          Ver todos os clientes →
        </NuxtLink>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <NuxtLink to="/parceiro/clientes" class="block">
          <KpiCard label="Total de clientes" unit="vinculados" icon="fa-solid fa-user-group" color="blue" :loading="loading">
            {{ indicadores?.total ?? 0 }}
          </KpiCard>
        </NuxtLink>
        <NuxtLink to="/parceiro/clientes" class="block">
          <KpiCard label="Ativos" unit="em dia" icon="fa-solid fa-circle-check" color="emerald" :loading="loading">
            {{ indicadores?.ativos ?? 0 }}
          </KpiCard>
        </NuxtLink>
        <NuxtLink to="/parceiro/clientes" class="block">
          <KpiCard label="Vencendo em 7 dias" unit="renove já" icon="fa-solid fa-hourglass-half" color="amber" :loading="loading">
            {{ indicadores?.vencendo_7d ?? 0 }}
          </KpiCard>
        </NuxtLink>
        <NuxtLink to="/parceiro/clientes" class="block">
          <KpiCard label="Vencidos" unit="sem acesso" icon="fa-solid fa-circle-exclamation" color="rose" :loading="loading">
            {{ indicadores?.vencidos ?? 0 }}
          </KpiCard>
        </NuxtLink>
      </div>

      <!-- Só quem precisa de ação -->
      <div class="flex items-center gap-2 mb-2">
        <h3 class="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Precisam de atenção
        </h3>
        <span
          v-if="!loading && precisamAtencao.length > 0"
          class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20"
        >{{ precisamAtencao.length }}</span>
      </div>

      <ParceiroCarteiraTabela
        :clientes="precisamAtencao"
        :saldos="saldos"
        :loading="loading"
        :parceiro-nome="parceiroNome"
        compacto
        :mensagem-vazio="clientes.length === 0
          ? 'Nenhum cliente vinculado a você ainda'
          : 'Tudo em dia — nenhum cliente vencendo ou bloqueado'"
        @changed="loadCarteira()"
      >
        <template #vazio>
          <p v-if="clientes.length === 0" class="text-slate-400 dark:text-slate-600 text-xs mt-1">
            Quando a Agzap vincular clientes à sua conta, eles aparecem aqui.
          </p>
          <NuxtLink v-else to="/parceiro/clientes" class="inline-block mt-3 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline">
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
