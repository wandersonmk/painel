<script setup lang="ts">
definePageMeta({
  middleware: 'guest',
  layout: 'auth',
})
</script>

<template>
  <div class="min-h-screen w-full flex relative overflow-hidden bg-[#0a0a0a]">
    <div class="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:24px_24px]" aria-hidden="true" />

    <div class="absolute top-0 -left-4 w-96 h-96 bg-purple-900 rounded-full filter blur-3xl opacity-10 animate-blob" aria-hidden="true" />
    <div class="absolute top-0 -right-4 w-96 h-96 bg-blue-900 rounded-full filter blur-3xl opacity-10 animate-blob animation-delay-2000" aria-hidden="true" />
    <div class="absolute -bottom-8 left-20 w-96 h-96 bg-pink-900 rounded-full filter blur-3xl opacity-10 animate-blob animation-delay-4000" aria-hidden="true" />

    <div class="relative z-10 w-full flex flex-col lg:flex-row">
      <div class="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12 min-h-screen lg:min-h-0">
        <div class="w-full max-w-md">
          <AuthTabs />
        </div>
      </div>

      <div class="hidden lg:flex w-1/2 items-center justify-center p-12 relative">
        <div class="max-w-lg space-y-8">
          <div class="space-y-4">
            <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-pink-500/5 border border-purple-500/10">
              <div class="w-2 h-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 animate-pulse shadow-lg shadow-purple-500/50" />
              <span class="text-sm font-medium bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">Painel Administrativo</span>
            </div>

            <h1 class="text-6xl font-bold tracking-tight">
              <span class="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent animate-gradient bg-[length:300%_auto]">
                AGZAP
              </span>
            </h1>

            <p class="text-xl text-gray-400 leading-relaxed">
              Painel de controle para gerenciamento de clientes, assinaturas e canais do sistema.
            </p>
          </div>

          <div class="grid gap-4">
            <div class="flex items-start gap-4 p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
              <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                <i class="fa-solid fa-users text-white" aria-hidden="true" />
              </div>
              <div>
                <h3 class="font-semibold text-white mb-1">Gestão de Clientes</h3>
                <p class="text-sm text-gray-400">Listar, editar, renovar, desativar e excluir empresas</p>
              </div>
            </div>

            <div class="flex items-start gap-4 p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
              <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                <i class="fa-solid fa-circle-check text-white" aria-hidden="true" />
              </div>
              <div>
                <h3 class="font-semibold text-white mb-1">Assinaturas e Planos</h3>
                <p class="text-sm text-gray-400">Renovações manuais, valores customizados, tokens OpenAI</p>
              </div>
            </div>

            <div class="flex items-start gap-4 p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
              <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-pink-600 flex items-center justify-center">
                <i class="fa-solid fa-mobile-screen text-white" aria-hidden="true" />
              </div>
              <div>
                <h3 class="font-semibold text-white mb-1">Canais WhatsApp</h3>
                <p class="text-sm text-gray-400">Gerenciamento de instâncias UaZapi por empresa</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
