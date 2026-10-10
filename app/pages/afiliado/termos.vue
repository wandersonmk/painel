<script setup lang="ts">
import { onMounted, ref } from 'vue'

/**
 * Portal do Afiliado › Termo do Afiliado (09/10/2026): o texto completo e a
 * data do aceite da versão vigente (afiliado_termos_aceites). O aceite em si
 * acontece no modal do layout (AfiliadoTermosModal).
 */
definePageMeta({
  middleware: ['auth', 'afiliado'],
  layout: 'afiliado',
})

const aceitoEm = ref<string | null>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const r = await $fetch<any>('/api/afiliado/termos-aceite', { headers: await useAdminAuthHeaders() })
    aceitoEm.value = r?.aceito_em ?? null
  }
  catch {
    aceitoEm.value = null
  }
  finally {
    loading.value = false
  }
})

const resumo = [
  { icone: 'fa-link', cor: 'text-purple-500', titulo: 'Link fixo', texto: 'Quem cria a conta pelo seu link vira cliente da Agzap trazido por você (1ª conexão).' },
  { icone: 'fa-sitemap', cor: 'text-emerald-500', titulo: 'Rede da 1ª à 5ª conexão', texto: 'A 1ª conexão vale desde a entrada; as outras liberam por metas de clientes ativos que você trouxe direto.' },
  { icone: 'fa-hourglass-half', cor: 'text-amber-500', titulo: 'Retenção', texto: 'Cada comissão fica retida 7 dias (PIX) ou 15 dias (cartão) e só existe enquanto o cliente paga.' },
  { icone: 'fa-wallet', cor: 'text-blue-500', titulo: 'Saque por PIX', texto: 'Peça quando quiser: cai em até 48 horas, só em chave no seu nome e CPF/CNPJ.' },
  { icone: 'fa-ban', cor: 'text-red-500', titulo: 'Bloqueio', texto: 'Fraude ou irregularidade bloqueia o acesso; afiliação encerrada com bloqueio cancela o saldo.' },
]

function formatDataHora(s: string) {
  return new Date(s).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <div class="p-4 sm:p-6 md:p-8 space-y-6 w-full">
    <div>
      <h1 class="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Termo do Afiliado</h1>
      <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">As regras da sua afiliação com a Agzap</p>
    </div>

    <div class="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)] items-start">
      <aside class="space-y-4 min-w-0 xl:sticky xl:top-20">
        <div
          v-if="!loading && aceitoEm"
          class="rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-4 py-3 flex items-center gap-3"
        >
          <div class="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-circle-check text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <div class="min-w-0">
            <p class="text-sm font-medium text-emerald-800 dark:text-emerald-300">Termo aceito</p>
            <p class="text-xs text-emerald-700/80 dark:text-emerald-500 mt-0.5">Você aceitou este termo em {{ formatDataHora(aceitoEm) }}</p>
          </div>
        </div>

        <section>
          <div class="flex items-center gap-2 mb-3">
            <span class="w-6 h-6 rounded-md flex items-center justify-center bg-purple-500/15 shrink-0">
              <i class="fa-solid fa-list-check text-purple-600 dark:text-purple-400 text-[11px]" aria-hidden="true" />
            </span>
            <h2 class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Em resumo</h2>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1 gap-3">
            <div v-for="item in resumo" :key="item.titulo" :class="['p-4 flex items-start gap-3', cardBase]">
              <span class="w-8 h-8 rounded-md bg-slate-100 dark:bg-white/5 flex items-center justify-center shrink-0">
                <i :class="['fa-solid', item.icone, item.cor, 'text-sm']" aria-hidden="true" />
              </span>
              <div class="min-w-0">
                <p class="text-xs font-medium text-slate-800 dark:text-white">{{ item.titulo }}</p>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{{ item.texto }}</p>
              </div>
            </div>
          </div>
        </section>
      </aside>

      <div :class="['p-5 sm:p-7 min-w-0', cardBase]">
        <AfiliadoTermoTexto />
      </div>
    </div>
  </div>
</template>
