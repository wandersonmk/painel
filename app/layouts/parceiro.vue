<script setup lang="ts">
import {
  MENSAGEM_PARCERIA_ENCERRADA,
  buscarAfiliadoLogado,
  sairDaContaAfiliado,
  situacaoParceiroLogado,
} from '~/composables/useAfiliado'

const { signOut } = useAuth()
const { isDark, init: initTheme, toggle: toggleTheme } = useTheme()
const { isCollapsed, init: initSidebar, openMobile } = useSidebar()
const { bloqueado } = useContaBloqueada()
const supabase = useSupabaseClient()
const toast = useToast()

// Bloqueio em tempo real: confere a cada 15s e ao voltar para a aba.
// Suspenso → modal "Conta bloqueada". Parceria REMOVIDA (ou excluída) não é
// bloqueio (09/10/2026): se ele virou afiliado vai para o portal do afiliado;
// senão sai com o aviso de que o acesso foi encerrado.
let verificadorBloqueio: ReturnType<typeof setInterval> | null = null
let encerrando = false

async function verificarBloqueio() {
  if (bloqueado.value || encerrando) return
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    let situacao
    try {
      situacao = await situacaoParceiroLogado(supabase, user.id)
    }
    catch {
      return // erro de rede não bloqueia ninguém
    }
    if (situacao === 'ativo') return
    if (situacao === 'suspenso') {
      bloqueado.value = true
      return
    }
    encerrando = true
    if ((await buscarAfiliadoLogado(supabase))?.ativo) {
      await navigateTo('/afiliado')
      return
    }
    toast.error(MENSAGEM_PARCERIA_ENCERRADA)
    await sairDaContaAfiliado(supabase)
    await navigateTo('/login')
  } catch {
    // best-effort
  }
}

function aoVoltarParaAba() {
  if (document.visibilityState === 'visible') verificarBloqueio()
}

onMounted(() => {
  // Restaura a preferência salva em vez de forçar o modo claro a cada acesso.
  initTheme()
  initSidebar()
  verificadorBloqueio = setInterval(verificarBloqueio, 15000)
  document.addEventListener('visibilitychange', aoVoltarParaAba)
})

onBeforeUnmount(() => {
  if (verificadorBloqueio) clearInterval(verificadorBloqueio)
  document.removeEventListener('visibilitychange', aoVoltarParaAba)
})

async function handleLogout() {
  await signOut()
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white flex">
    <!-- Sidebar -->
    <ParceiroSidebar />

    <!-- Main area -->
    <div
      class="flex-1 flex flex-col min-h-screen min-w-0 transition-[margin-left] duration-300 ease-in-out ml-0"
      :class="isCollapsed ? 'md:ml-16' : 'md:ml-60'"
    >
      <!-- Header -->
      <header class="sticky top-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/5">
        <div class="px-3 sm:px-6 py-3 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-4">
          <!-- Left: mobile hamburger + badge -->
          <div class="flex items-center gap-3 min-w-0">
            <!-- Mobile menu toggle -->
            <button
              @click="openMobile"
              class="md:hidden w-9 h-9 rounded flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              aria-label="Abrir menu"
              type="button"
            >
              <i class="fa-solid fa-bars text-base" aria-hidden="true" />
            </button>

            <div class="hidden sm:flex items-center gap-2">
              <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
              <span class="text-sm text-slate-500 dark:text-slate-400 font-medium">Portal do Parceiro</span>
            </div>
          </div>

          <!-- Right actions -->
          <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <!-- Dark / Light mode toggle -->
            <button
              @click="toggleTheme"
              class="w-9 h-9 rounded flex items-center justify-center transition-all duration-150 border"
              :class="isDark
                ? 'text-amber-400 hover:text-amber-300 bg-amber-400/10 border-amber-400/20 hover:bg-amber-400/20'
                : 'text-slate-600 hover:text-slate-800 bg-slate-100 border-slate-200 hover:bg-slate-200'"
              :title="isDark ? 'Mudar para modo claro' : 'Mudar para modo escuro'"
              type="button"
              :aria-label="isDark ? 'Ativar modo claro' : 'Ativar modo escuro'"
            >
              <i
                class="fa-solid text-sm"
                :class="isDark ? 'fa-sun' : 'fa-moon'"
                aria-hidden="true"
              />
            </button>

            <!-- Logout -->
            <button
              @click="handleLogout"
              class="w-9 h-9 rounded flex items-center justify-center transition-all duration-150 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
              title="Sair"
              type="button"
              aria-label="Sair da conta"
            >
              <i class="fa-solid fa-arrow-right-from-bracket text-sm" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <!-- Page content -->
      <main class="flex-1 min-w-0">
        <slot />
      </main>
    </div>

    <!-- Termo de aceite obrigatório no primeiro acesso -->
    <ParceiroTermosModal />
  </div>
</template>
