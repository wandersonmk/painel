<script setup lang="ts">
import type { AfiliadoMe } from '~/composables/useAfiliado'
import {
  ERRO_SEM_SESSAO,
  MENSAGEM_AFILIACAO_ENCERRADA,
  MENSAGEM_AFILIADO_BLOQUEADO,
  conferirAfiliadoLogado,
  sairDaContaAfiliado,
  situacaoParceiroLogado,
} from '~/composables/useAfiliado'

const { isDark, init: initTheme, toggle: toggleTheme } = useTheme()
const { isCollapsed, init: initSidebar, openMobile } = useSidebar()
const toast = useToast()
const supabase = useSupabaseClient()

// Bloqueio: confere a cada 60 s e ao voltar para a aba. Se a Agzap bloquear o
// afiliado, ele sai com o aviso de bloqueio. Afiliação REMOVIDA ou apagada não
// é bloqueio (09/10/2026): se ele virou parceiro vai para o portal do parceiro;
// senão sai com o aviso de acesso encerrado. Erro de rede não desloga ninguém.
let verificador: ReturnType<typeof setInterval> | null = null
let saindo = false

async function verificarBloqueio() {
  if (saindo) return
  let afiliado: AfiliadoMe | null
  try {
    afiliado = await conferirAfiliadoLogado(supabase)
  }
  catch (e: any) {
    // Sessão acabou: volta ao login sem aviso de bloqueio. Erro de rede: ignora.
    if (e?.message === ERRO_SEM_SESSAO) {
      saindo = true
      await navigateTo('/login')
    }
    return
  }
  if (afiliado?.ativo) return
  saindo = true
  if (!afiliado) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user && (await situacaoParceiroLogado(supabase, user.id)) === 'ativo') {
        await navigateTo('/parceiro')
        return
      }
    }
    catch { /* segue para a saída */ }
    toast.error(MENSAGEM_AFILIACAO_ENCERRADA)
  }
  else {
    toast.error(afiliado.bloqueado_motivo
      ? `${MENSAGEM_AFILIADO_BLOQUEADO} Motivo: ${afiliado.bloqueado_motivo}`
      : MENSAGEM_AFILIADO_BLOQUEADO)
  }
  await sairDaContaAfiliado(supabase)
  await navigateTo('/login')
}

function aoVoltarParaAba() {
  if (document.visibilityState === 'visible') verificarBloqueio()
}

onMounted(() => {
  initTheme()
  initSidebar()
  verificador = setInterval(verificarBloqueio, 60_000)
  document.addEventListener('visibilitychange', aoVoltarParaAba)
})

onBeforeUnmount(() => {
  if (verificador) clearInterval(verificador)
  document.removeEventListener('visibilitychange', aoVoltarParaAba)
})

async function handleLogout() {
  saindo = true
  await sairDaContaAfiliado(supabase)
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white flex">
    <AfiliadoSidebar />

    <div
      class="flex-1 flex flex-col min-h-screen min-w-0 transition-[margin-left] duration-300 ease-in-out ml-0"
      :class="isCollapsed ? 'md:ml-16' : 'md:ml-60'"
    >
      <header class="sticky top-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/5">
        <div class="px-3 sm:px-6 py-3 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-4">
          <div class="flex items-center gap-3 min-w-0">
            <button
              class="md:hidden w-9 h-9 rounded flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              aria-label="Abrir menu"
              type="button"
              @click="openMobile"
            >
              <i class="fa-solid fa-bars text-base" aria-hidden="true" />
            </button>

            <div class="flex items-center gap-2 min-w-0">
              <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" aria-hidden="true" />
              <span class="text-sm text-slate-500 dark:text-slate-400 font-normal truncate">Portal do Afiliado</span>
            </div>
          </div>

          <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              class="w-9 h-9 rounded flex items-center justify-center transition-all duration-150 border"
              :class="isDark
                ? 'text-amber-400 hover:text-amber-300 bg-amber-400/10 border-amber-400/20 hover:bg-amber-400/20'
                : 'text-slate-600 hover:text-slate-800 bg-slate-100 border-slate-200 hover:bg-slate-200'"
              :title="isDark ? 'Mudar para modo claro' : 'Mudar para modo escuro'"
              type="button"
              :aria-label="isDark ? 'Ativar modo claro' : 'Ativar modo escuro'"
              @click="toggleTheme"
            >
              <i class="fa-solid text-sm" :class="isDark ? 'fa-sun' : 'fa-moon'" aria-hidden="true" />
            </button>

            <button
              class="w-9 h-9 rounded flex items-center justify-center transition-all duration-150 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
              title="Sair"
              type="button"
              aria-label="Sair da conta"
              @click="handleLogout"
            >
              <i class="fa-solid fa-arrow-right-from-bracket text-sm" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main class="flex-1 min-w-0">
        <slot />
      </main>
    </div>

    <!-- Termo do Afiliado: aceite obrigatório no 1º acesso e a cada nova versão.
         Nunca o Termo do Parceiro (esse fica só no layout do parceiro). -->
    <AfiliadoTermosModal />
  </div>
</template>
