<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

const mostrar = ref(false)
const leuTudo = ref(false)
const aceitouCheckbox = ref(false)
const salvando = ref(false)
const scrollArea = ref<HTMLElement | null>(null)

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

onMounted(async () => {
  toast = await useToastSafe()
  try {
    const supabase = useSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('parceiros')
      .select('dados_split')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    const termos = (data as any)?.dados_split?.termos
    if (!termos?.aceito_em) {
      mostrar.value = true
      await nextTick()
      checarScroll()
    }
  } catch {
    // sem registro de parceiro ou erro de leitura: o middleware cuida do acesso
  }
})

function checarScroll() {
  const el = scrollArea.value
  if (!el) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 16) {
    leuTudo.value = true
  }
}

async function aceitar() {
  if (!leuTudo.value || !aceitouCheckbox.value || salvando.value) return
  salvando.value = true
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/parceiro/aceitar-termos', {
      method: 'POST',
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro')
    mostrar.value = false
    toast?.success('Termos aceitos — bem-vindo à parceria Agzap! 🎉')
  } catch (err: any) {
    toast?.error(err?.data?.statusMessage || err?.message || 'Erro ao registrar o aceite')
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <!-- Sem fechamento por clique fora, sem botão X: o aceite é obrigatório -->
    <div
      v-if="mostrar"
      class="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Termo de responsabilidade da parceria"
    >
      <div class="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        <!-- Header -->
        <div class="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 shrink-0">
          <div class="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-500/15 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-file-contract text-purple-600 dark:text-purple-400" aria-hidden="true" />
          </div>
          <div>
            <h2 class="text-base font-bold text-slate-900 dark:text-white">Termo de Responsabilidade</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">Leia até o final para liberar o aceite — obrigatório no primeiro acesso</p>
          </div>
        </div>

        <!-- Conteúdo scrollável -->
        <div
          ref="scrollArea"
          @scroll="checarScroll"
          class="flex-1 overflow-y-auto px-5 sm:px-6 py-4 min-h-0"
        >
          <ParceiroTermosConteudo />
        </div>

        <!-- Footer -->
        <div class="px-5 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 shrink-0 space-y-3">
          <!-- Aviso de rolagem -->
          <div
            v-if="!leuTudo"
            class="flex items-center justify-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400"
          >
            <i class="fa-solid fa-arrow-down animate-bounce" aria-hidden="true" />
            Role até o final do termo para liberar o aceite
          </div>

          <!-- Checkbox de aceite -->
          <label
            class="flex items-start gap-2.5 select-none"
            :class="leuTudo ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'"
          >
            <input
              v-model="aceitouCheckbox"
              type="checkbox"
              :disabled="!leuTudo"
              class="mt-0.5 w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-purple-600 focus:ring-purple-500 disabled:cursor-not-allowed"
            />
            <span class="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              Li e <strong>aceito o Termo de Responsabilidade</strong> do Programa de Parceria da Agzap Systems, incluindo as regras de comissão, prazos de liberação e penalidades.
            </span>
          </label>

          <button
            @click="aceitar"
            :disabled="!leuTudo || !aceitouCheckbox || salvando"
            class="w-full px-4 py-3 rounded font-semibold text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2"
            type="button"
          >
            <i v-if="salvando" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
            <i v-else class="fa-solid fa-check text-xs" aria-hidden="true" />
            {{ salvando ? 'Registrando…' : 'Aceito os termos' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
