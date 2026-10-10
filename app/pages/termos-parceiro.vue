<script setup lang="ts">
// Página PÚBLICA do Termo do Parceiro (sem login): link "Abrir o Termo em
// outra aba" do modal de aceite e link do comprovante de aceite.
definePageMeta({ layout: false })

useHead({ title: 'Termo do Parceiro — Agzap' })
</script>

<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-950">
    <header class="border-b border-slate-200 dark:border-white/10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm sticky top-0 z-10">
      <div class="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <img src="/logo.modoClaro.png" alt="Agzap" class="h-8 w-auto dark:hidden" />
        <img src="/logo.wrn.png" alt="Agzap" class="h-8 w-auto hidden dark:block" />
        <span class="text-xs text-slate-500 dark:text-slate-400">Programa de Parceria</span>
      </div>
    </header>
    <main class="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div class="rounded-2xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm p-5 sm:p-8">
        <ParceiroTermoTexto />
      </div>
    </main>
  </div>
</template>
