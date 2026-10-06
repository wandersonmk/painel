<script setup lang="ts">
import { onMounted, ref } from 'vue'

definePageMeta({
  middleware: ['auth', 'parceiro'],
  layout: 'parceiro',
})

// O programa de parceria opera somente com licenças pré-pagas.
const { parceiro, checkParceiro } = useParceiro()
const carregando = ref(true)

onMounted(async () => {
  await checkParceiro()
  carregando.value = false
})
</script>

<template>
  <!-- Esqueleto com a mesma grade do painel: largura toda, 1/2/4 colunas -->
  <div v-if="carregando" class="p-4 sm:p-6 md:p-8 w-full space-y-6">
    <div class="space-y-2">
      <div class="h-7 w-48 bg-slate-100 dark:bg-white/5 rounded animate-pulse" />
      <div class="h-4 w-64 max-w-full bg-slate-100 dark:bg-white/5 rounded animate-pulse" />
    </div>
    <div class="h-24 bg-slate-100 dark:bg-white/5 rounded-xl animate-pulse" />
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
      <div v-for="i in 4" :key="i" class="h-24 bg-slate-100 dark:bg-white/5 rounded-xl animate-pulse" />
    </div>
    <div class="h-64 bg-slate-100 dark:bg-white/5 rounded-md animate-pulse" />
  </div>

  <ParceiroDashboardLicencas v-else :parceiro-nome="parceiro?.nome" />
</template>
