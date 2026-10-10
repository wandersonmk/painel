<script setup lang="ts">
import { onMounted, ref } from 'vue'

/**
 * Link de indicação do parceiro (06/10/2026). Quem se cadastra por ele já nasce
 * vinculado ao parceiro: aparece em Clientes do portal e no painel admin, pronto
 * para o parceiro renovar com crédito, sem falar com a Agzap.
 */
const link = ref<string | null>(null)
const carregando = ref(true)
const erro = ref<string | null>(null)
const copiado = ref(false)

onMounted(async () => {
  try {
    const resp = await $fetch<{ success: boolean; data?: { codigo: string; url: string }; error?: string }>(
      '/api/parceiro/link',
      { headers: await useAdminAuthHeaders() },
    )
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Erro')
    link.value = resp.data.url
  } catch (e: any) {
    erro.value = e?.data?.statusMessage || e?.message || 'Não foi possível carregar o seu link.'
  } finally {
    carregando.value = false
  }
})

async function copiar() {
  if (!link.value) return
  try {
    await navigator.clipboard.writeText(link.value)
    copiado.value = true
    setTimeout(() => { copiado.value = false }, 2000)
  } catch { /* navegador sem permissão: o link continua visível para copiar à mão */ }
}

function compartilharWhatsApp() {
  if (!link.value) return
  // Link na última linha: no WhatsApp ele vira o cartão de convite (imagem
  // de indicação), montado pelo app em server/plugins/og-publico.ts.
  const texto = `🎁 *Convite Agzap*\n\nConheça a Agzap: atendimento com IA no WhatsApp. Crie sua conta pelo link oficial:\n${link.value}`
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
}
</script>

<template>
  <!-- Mesmo visual dos painéis do dashboard (09/10/2026): superfície clara,
       cantos de 2xl, ícone em bloco suave e botões arredondados. -->
  <section class="rounded-2xl bg-white dark:bg-slate-900/60 ring-1 ring-inset ring-slate-200/70 dark:ring-white/10 p-4 sm:p-5">
    <div class="flex flex-col lg:flex-row lg:items-center gap-3.5 lg:gap-6">
      <div class="flex items-start gap-2.5 min-w-0 lg:flex-1">
        <span class="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-300 flex items-center justify-center flex-shrink-0">
          <i class="fa-solid fa-link text-sm" aria-hidden="true" />
        </span>
        <div class="min-w-0">
          <h2 class="text-[15px] font-medium text-slate-800 dark:text-slate-100">Seu link de indicação</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
            Quem criar a conta por este link entra direto na sua carteira de clientes. Você já vê o cliente aqui e pode renovar com crédito, sem precisar falar com a Agzap.
          </p>
        </div>
      </div>

      <div class="flex flex-col sm:flex-row sm:items-center gap-2 lg:w-[min(560px,55%)]">
        <div class="flex-1 min-w-0 h-9 flex items-center px-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 ring-1 ring-inset ring-slate-200/70 dark:ring-white/5 font-mono text-xs text-slate-700 dark:text-slate-300">
          <span v-if="carregando" class="inline-block h-3 w-48 max-w-full rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
          <span v-else-if="erro" class="block truncate text-red-500" :title="erro">{{ erro }}</span>
          <span v-else class="block truncate" :title="link || ''">{{ link }}</span>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            :disabled="!link"
            @click="copiar"
            class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-xl text-xs font-medium bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white shadow-sm shadow-purple-600/20 transition-colors"
          >
            <i :class="copiado ? 'fa-solid fa-check' : 'fa-regular fa-copy'" aria-hidden="true" />
            {{ copiado ? 'Copiado!' : 'Copiar link' }}
          </button>
          <button
            type="button"
            :disabled="!link"
            @click="compartilharWhatsApp"
            class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-xl text-xs font-medium ring-1 ring-inset ring-emerald-200 dark:ring-emerald-500/25 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
            title="Compartilhar no WhatsApp"
          >
            <i class="fa-brands fa-whatsapp" aria-hidden="true" />
            WhatsApp
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
