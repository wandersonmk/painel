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
  const texto = `Conheça a Agzap: atendimento com IA no WhatsApp. Crie sua conta por aqui: ${link.value}`
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
}
</script>

<template>
  <section class="rounded-xl border border-purple-200 dark:border-purple-500/25 bg-gradient-to-br from-purple-50 to-white dark:from-purple-500/10 dark:to-transparent p-4 sm:p-5">
    <div class="flex flex-col lg:flex-row lg:items-center gap-4">
      <div class="flex items-start gap-3 min-w-0 lg:flex-1">
        <span class="w-10 h-10 rounded-lg bg-purple-600 text-white flex items-center justify-center flex-shrink-0">
          <i class="fa-solid fa-link" aria-hidden="true" />
        </span>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-slate-900 dark:text-white">Seu link de indicação</p>
          <p class="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
            Quem criar a conta por este link entra direto na sua carteira de clientes. Você já vê o cliente aqui e pode renovar com crédito, sem precisar falar com a Agzap.
          </p>
        </div>
      </div>

      <div class="flex flex-col sm:flex-row sm:items-center gap-2 lg:w-[min(560px,55%)]">
        <div class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-700 dark:text-slate-300 truncate">
          <span v-if="carregando" class="inline-block h-3 w-48 rounded bg-slate-200 dark:bg-slate-700 animate-pulse align-middle" />
          <span v-else-if="erro" class="text-red-500">{{ erro }}</span>
          <span v-else :title="link || ''">{{ link }}</span>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            :disabled="!link"
            @click="copiar"
            class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white transition-colors"
          >
            <i :class="copiado ? 'fa-solid fa-check' : 'fa-regular fa-copy'" aria-hidden="true" />
            {{ copiado ? 'Copiado!' : 'Copiar link' }}
          </button>
          <button
            type="button"
            :disabled="!link"
            @click="compartilharWhatsApp"
            class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
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
