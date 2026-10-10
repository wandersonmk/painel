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
  <!-- Esqueleto com a mesma grade e o mesmo respiro do painel: largura toda, 1/2/4 colunas -->
  <div v-if="carregando" class="px-4 pt-4 pb-6 sm:px-6 sm:pt-5 md:px-8 md:pb-8 w-full space-y-4 sm:space-y-5">
    <div class="space-y-2">
      <div class="h-7 w-48 bg-slate-100 dark:bg-white/5 rounded-lg animate-pulse" />
      <div class="h-4 w-64 max-w-full bg-slate-100 dark:bg-white/5 rounded-lg animate-pulse" />
    </div>
    <div class="h-24 bg-slate-100 dark:bg-white/5 rounded-2xl animate-pulse" />
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
      <div v-for="i in 4" :key="i" class="h-56 bg-slate-100 dark:bg-white/5 rounded-2xl animate-pulse" />
    </div>
    <div class="h-64 bg-slate-100 dark:bg-white/5 rounded-2xl animate-pulse" />
  </div>

  <ParceiroDashboardLicencas v-else :parceiro-nome="parceiro?.nome" />
</template>
