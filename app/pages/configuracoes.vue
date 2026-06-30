<script setup lang="ts">
import { computed, ref } from 'vue'

definePageMeta({
  middleware: ['auth', 'super-admin'],
  layout: 'dashboard',
})

const { user, signOut } = useAuth()
const { isDark, toggle: toggleTheme } = useTheme()
const { hideValues, toggle: toggleHideValues } = useHideValues()
const supabase = useSupabaseClient()

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null
onMounted(async () => {
  toast = await useToastSafe()
})

const userInitial = computed(() => user.value?.email?.charAt(0).toUpperCase() || '?')

// ───────── Alterar senha ─────────
const novaSenha = ref('')
const confirmarSenha = ref('')
const salvandoSenha = ref(false)

async function alterarSenha() {
  if (novaSenha.value.length < 6) {
    toast?.error('A nova senha deve ter pelo menos 6 caracteres.')
    return
  }
  if (novaSenha.value !== confirmarSenha.value) {
    toast?.error('As senhas não conferem.')
    return
  }
  salvandoSenha.value = true
  try {
    const { error } = await supabase.auth.updateUser({ password: novaSenha.value })
    if (error) throw error
    novaSenha.value = ''
    confirmarSenha.value = ''
    toast?.success('Senha alterada com sucesso.')
  } catch (err: any) {
    toast?.error(err?.message || 'Não foi possível alterar a senha.')
  } finally {
    salvandoSenha.value = false
  }
}

// ───────── Sair ─────────
const saindo = ref(false)
async function sair() {
  saindo.value = true
  try {
    await signOut()
    await navigateTo('/login')
  } finally {
    saindo.value = false
  }
}
</script>

<template>
  <div class="p-3 sm:p-6 md:p-10">
    <div class="max-w-[900px] mx-auto space-y-4 sm:space-y-8">
      <!-- Header -->
      <div class="space-y-1">
        <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Configurações</h1>
        <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm">
          Gerencie as preferências do painel e da sua conta
        </p>
      </div>

      <!-- Conta -->
      <section class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 sm:p-6">
        <div class="flex items-center gap-2 mb-4">
          <i class="fa-solid fa-circle-user text-purple-500" aria-hidden="true" />
          <h2 class="text-sm font-semibold text-slate-900 dark:text-white">Conta</h2>
        </div>
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center shrink-0 shadow">
            <span class="text-white text-base font-bold">{{ userInitial }}</span>
          </div>
          <div class="min-w-0">
            <p class="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{{ user?.email || 'Não autenticado' }}</p>
            <p class="text-xs text-slate-500 dark:text-slate-400">Administrador</p>
          </div>
        </div>
      </section>

      <!-- Aparência -->
      <section class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 sm:p-6">
        <div class="flex items-center gap-2 mb-4">
          <i class="fa-solid fa-palette text-purple-500" aria-hidden="true" />
          <h2 class="text-sm font-semibold text-slate-900 dark:text-white">Aparência</h2>
        </div>
        <div class="divide-y divide-slate-100 dark:divide-slate-800">
          <!-- Tema -->
          <div class="flex items-center justify-between py-3 first:pt-0">
            <div class="min-w-0 pr-4">
              <p class="text-sm font-medium text-slate-900 dark:text-slate-100">Tema escuro</p>
              <p class="text-xs text-slate-500 dark:text-slate-400">Alterna entre o modo claro e escuro do painel</p>
            </div>
            <button
              @click="toggleTheme"
              type="button"
              role="switch"
              :aria-checked="isDark"
              class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
              :class="isDark ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-700'"
            >
              <span
                class="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform"
                :class="isDark ? 'translate-x-5' : 'translate-x-0.5'"
              />
            </button>
          </div>
          <!-- Ocultar valores -->
          <div class="flex items-center justify-between py-3 last:pb-0">
            <div class="min-w-0 pr-4">
              <p class="text-sm font-medium text-slate-900 dark:text-slate-100">Ocultar valores</p>
              <p class="text-xs text-slate-500 dark:text-slate-400">Mascara os valores monetários exibidos no painel</p>
            </div>
            <button
              @click="toggleHideValues"
              type="button"
              role="switch"
              :aria-checked="hideValues"
              class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
              :class="hideValues ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-700'"
            >
              <span
                class="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform"
                :class="hideValues ? 'translate-x-5' : 'translate-x-0.5'"
              />
            </button>
          </div>
        </div>
      </section>

      <!-- Segurança -->
      <section class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 sm:p-6">
        <div class="flex items-center gap-2 mb-4">
          <i class="fa-solid fa-shield-halved text-purple-500" aria-hidden="true" />
          <h2 class="text-sm font-semibold text-slate-900 dark:text-white">Segurança</h2>
        </div>
        <form @submit.prevent="alterarSenha" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label for="nova-senha" class="block text-xs font-medium text-slate-600 dark:text-slate-300">Nova senha</label>
              <input
                id="nova-senha"
                v-model="novaSenha"
                type="password"
                autocomplete="new-password"
                placeholder="Mínimo 6 caracteres"
                class="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 transition"
              />
            </div>
            <div class="space-y-1.5">
              <label for="confirmar-senha" class="block text-xs font-medium text-slate-600 dark:text-slate-300">Confirmar nova senha</label>
              <input
                id="confirmar-senha"
                v-model="confirmarSenha"
                type="password"
                autocomplete="new-password"
                placeholder="Repita a nova senha"
                class="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 transition"
              />
            </div>
          </div>
          <div class="flex justify-end">
            <button
              type="submit"
              :disabled="salvandoSenha"
              class="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm shadow-purple-600/30"
            >
              <i class="fa-solid" :class="salvandoSenha ? 'fa-spinner fa-spin' : 'fa-key'" aria-hidden="true" />
              {{ salvandoSenha ? 'Salvando...' : 'Alterar senha' }}
            </button>
          </div>
        </form>
      </section>

      <!-- Sessão -->
      <section class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 sm:p-6">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div class="min-w-0">
            <h2 class="text-sm font-semibold text-slate-900 dark:text-white">Encerrar sessão</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">Você precisará entrar novamente para acessar o painel</p>
          </div>
          <button
            @click="sair"
            :disabled="saindo"
            type="button"
            class="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm shadow-red-600/30"
          >
            <i class="fa-solid" :class="saindo ? 'fa-spinner fa-spin' : 'fa-right-from-bracket'" aria-hidden="true" />
            {{ saindo ? 'Saindo...' : 'Sair' }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
