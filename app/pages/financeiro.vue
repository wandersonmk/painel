<script setup lang="ts">
/**
 * Financeiro = programa de licenças de parceiros.
 *
 * Sem cabeçalho próprio: o bloco de créditos já se identifica e a tela ganha
 * a altura de volta. O controle manual de receitas e despesas (lançamentos,
 * dízimo, vencidos) saiu daqui — a API, o composable useFinanceiro e os
 * componentes FinanceiroLancamento* continuam no repositório e os dados
 * seguem no banco, então dá para remontar a tela se voltar a fazer sentido.
 */

definePageMeta({
  middleware: ['auth', 'super-admin'],
  layout: 'dashboard',
})
</script>

<template>
  <div class="p-3 sm:p-5 md:p-6">
    <div class="max-w-[1400px] mx-auto">
      <FinanceiroCreditosParceiros />
    </div>
  </div>
</template>
