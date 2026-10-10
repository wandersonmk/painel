<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { erroAfiliado } from '~/composables/useAfiliado'

definePageMeta({
  middleware: ['auth', 'afiliado'],
  layout: 'afiliado',
})

useHead({ title: 'Meu link · Portal do Afiliado' })

/** Link fixo do afiliado: nunca muda. Quem cria a conta por ele vira 1ª conexão. */
const link = ref<string | null>(null)
const primeiroNome = ref<string>('')
const carregando = ref(true)
const erro = ref<string | null>(null)
const copiado = ref(false)
const campoLink = ref<HTMLInputElement | null>(null)
const toast = useToast()

onMounted(async () => {
  try {
    const resp = await $fetch<{ success: boolean; data?: { codigo: string; url: string; primeiro_nome: string }; error?: string }>(
      '/api/afiliado/link',
      { headers: await useAdminAuthHeaders() },
    )
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Não foi possível carregar o seu link.')
    link.value = resp.data.url
    primeiroNome.value = resp.data.primeiro_nome
  }
  catch (e: any) {
    erro.value = erroAfiliado(e, 'Não foi possível carregar o seu link.')
  }
  finally {
    carregando.value = false
  }
})

function marcarCopiado() {
  copiado.value = true
  setTimeout(() => { copiado.value = false }, 2000)
}

async function copiar() {
  if (!link.value) return
  try {
    await navigator.clipboard.writeText(link.value)
    marcarCopiado()
    return
  }
  catch { /* sem permissão: cai no plano B */ }
  // Plano B: seleciona o texto do campo e tenta o comando antigo de copiar.
  const campo = campoLink.value
  if (!campo) return
  campo.focus()
  campo.select()
  campo.setSelectionRange(0, campo.value.length)
  let ok = false
  try {
    ok = document.execCommand('copy')
  }
  catch { ok = false }
  if (ok) marcarCopiado()
  else toast.info('O link está selecionado. Use Ctrl+C (ou "Copiar" no celular) para copiar.')
}

function compartilharWhatsApp() {
  if (!link.value) return
  const nome = primeiroNome.value || 'Um amigo'
  const texto = `🎁 *Convite Agzap*\n\n${nome} te convidou para conhecer a Agzap, o sistema que atende seus clientes no WhatsApp com IA. Crie sua conta pelo link oficial:\n${link.value}`
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer')
}

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <div class="p-4 sm:p-6 md:p-8 space-y-6 w-full">

    <div>
      <h1 class="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Meu link</h1>
      <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
        Compartilhe o seu link de afiliado. Ele é o mesmo para sempre.
      </p>
    </div>

    <div v-if="erro" class="p-4 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
      <span>{{ erro }}</span>
    </div>

    <div class="grid gap-3 lg:grid-cols-2 items-start">
      <!-- Link -->
      <section :class="[cardBase, 'p-4 sm:p-5 space-y-4']">
        <div class="flex items-start gap-3">
          <span class="w-10 h-10 rounded bg-purple-600 text-white flex items-center justify-center shrink-0">
            <i class="fa-solid fa-link" aria-hidden="true" />
          </span>
          <div class="min-w-0">
            <p class="text-sm font-medium text-slate-900 dark:text-white">Seu link de afiliado</p>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Mande para quem pode usar a Agzap.</p>
          </div>
        </div>

        <div>
          <label for="af-link" class="sr-only">Seu link de afiliado</label>
          <div v-if="carregando" class="h-11 rounded bg-slate-100 dark:bg-white/10 animate-pulse" />
          <input
            v-else
            id="af-link"
            ref="campoLink"
            :value="link || ''"
            type="text"
            readonly
            class="w-full px-3.5 py-2.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-xs sm:text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
            @focus="($event.target as HTMLInputElement).select()"
          >
        </div>

        <div class="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            :disabled="!link"
            class="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded text-sm font-normal bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white transition-colors"
            @click="copiar"
          >
            <i :class="copiado ? 'fa-solid fa-check' : 'fa-regular fa-copy'" aria-hidden="true" />
            {{ copiado ? 'Copiado!' : 'Copiar link' }}
          </button>
          <button
            type="button"
            :disabled="!link"
            class="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded text-sm font-normal border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
            @click="compartilharWhatsApp"
          >
            <i class="fa-brands fa-whatsapp" aria-hidden="true" />
            Compartilhar no WhatsApp
          </button>
        </div>
      </section>

      <!-- Como funciona -->
      <section :class="[cardBase, 'p-4 sm:p-5 space-y-3']">
        <p class="text-sm font-medium text-slate-900 dark:text-white">Como funciona</p>
        <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          Seu link é fixo e nunca muda. Quem criar a conta por ele vira sua 1ª conexão; quem essas pessoas indicarem entra na sua rede até a 5ª conexão.
        </p>
        <ul class="space-y-2 text-xs text-slate-500 dark:text-slate-400">
          <li class="flex gap-2">
            <i class="fa-solid fa-user-plus text-purple-500 mt-0.5 w-4 text-center shrink-0" aria-hidden="true" />
            <span>1ª conexão: 30% no 1º pagamento e 15% nos seguintes.</span>
          </li>
          <li class="flex gap-2">
            <i class="fa-solid fa-sitemap text-purple-500 mt-0.5 w-4 text-center shrink-0" aria-hidden="true" />
            <span>Da 2ª à 5ª conexão: 5%, 3%, 2% e 2%, liberadas conforme seus clientes ativos (10, 15, 20 e 50).</span>
          </li>
          <li class="flex gap-2">
            <i class="fa-solid fa-circle-info text-purple-500 mt-0.5 w-4 text-center shrink-0" aria-hidden="true" />
            <span>Quem já tem conta na Agzap não entra pelo link: a conexão vale para contas novas.</span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
