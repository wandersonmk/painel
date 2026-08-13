<script setup lang="ts">
import { computed } from 'vue'

/**
 * Financeiro = programa de licenças de parceiros.
 *
 * O controle manual de receitas e despesas (lançamentos, dízimo, vencidos)
 * saiu daqui. A API, o composable useFinanceiro e os componentes
 * FinanceiroLancamento* continuam no repositório e os dados seguem no banco —
 * se voltar a fazer sentido, é só remontar a tela.
 */

definePageMeta({
  middleware: ['auth', 'super-admin'],
  layout: 'dashboard',
})

const mesAtualLabel = computed(() => {
  const d = new Date()
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
})
</script>

<template>
  <div class="p-3 sm:p-6 md:p-10">
    <div class="max-w-[1400px] mx-auto space-y-4 sm:space-y-6">
      <!-- Header -->
      <div class="space-y-1 min-w-0">
        <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Financeiro</h1>
        <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm">
          Créditos de parceiros · <span class="capitalize">{{ mesAtualLabel }}</span>
        </p>
      </div>

      <!-- Venda, estorno, consumo e passivo do programa de licenças -->
      <FinanceiroCreditosParceiros />
    </div>
  </div>
</template>
