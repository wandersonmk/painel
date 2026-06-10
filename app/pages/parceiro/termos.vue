<script setup lang="ts">
import { onMounted, ref } from 'vue'

definePageMeta({
  middleware: ['auth', 'parceiro'],
  layout: 'parceiro',
})

const aceitoEm = ref<string | null>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const supabase = useSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('parceiros')
      .select('dados_split')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    aceitoEm.value = (data as any)?.dados_split?.termos?.aceito_em ?? null
  } finally {
    loading.value = false
  }
})

function formatDataHora(s: string) {
  return new Date(s).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <div class="p-4 sm:p-6 md:p-8 space-y-6 max-w-[900px] mx-auto w-full">

    <!-- Page Header -->
    <div>
      <h1 class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Termos de Responsabilidade</h1>
      <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">Como funciona a parceria Agzap e suas responsabilidades</p>
    </div>

    <!-- Status do aceite -->
    <div
      v-if="!loading && aceitoEm"
      class="rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-4 py-3 flex items-center gap-3"
    >
      <div class="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
        <i class="fa-solid fa-circle-check text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      </div>
      <div>
        <p class="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Termos aceitos</p>
        <p class="text-xs text-emerald-700/80 dark:text-emerald-500 mt-0.5">Você aceitou este termo em {{ formatDataHora(aceitoEm) }}</p>
      </div>
    </div>

    <!-- Resumo rápido (como funciona) -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div :class="['p-4', cardBase]">
        <i class="fa-solid fa-sack-dollar text-emerald-500 text-lg" aria-hidden="true" />
        <p class="text-xs font-bold text-slate-800 dark:text-white mt-2">Comissão por pagamento</p>
        <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">Só pagamentos confirmados do cliente geram comissão (cartão ou PIX).</p>
      </div>
      <div :class="['p-4', cardBase]">
        <i class="fa-solid fa-hourglass-half text-amber-500 text-lg" aria-hidden="true" />
        <p class="text-xs font-bold text-slate-800 dark:text-white mt-2">Liberação em 30 dias</p>
        <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">Cada pagamento fica retido 30 dias como garantia contra estornos.</p>
      </div>
      <div :class="['p-4', cardBase]">
        <i class="fa-solid fa-money-bill-transfer text-purple-500 text-lg" aria-hidden="true" />
        <p class="text-xs font-bold text-slate-800 dark:text-white mt-2">Saque em até 24h úteis</p>
        <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">Pagamento via PIX no seu nome, processado em dias úteis.</p>
      </div>
      <div :class="['p-4', cardBase]">
        <i class="fa-solid fa-ban text-red-500 text-lg" aria-hidden="true" />
        <p class="text-xs font-bold text-slate-800 dark:text-white mt-2">Estorno cancela comissão</p>
        <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">Pagamento estornado ou contestado não é liberado.</p>
      </div>
    </div>

    <!-- Termo completo -->
    <div :class="['p-5 sm:p-7', cardBase]">
      <ParceiroTermosConteudo />
    </div>

  </div>
</template>
