<script setup lang="ts">
import { ref, computed } from 'vue'

const email = ref('')
const password = ref('')

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null
onMounted(async () => {
  toast = await useToastSafe()
})

const { signInWithEmailAndPassword, signOut, isLoading, errorMessage, user } = useAuth()
const { checkUserRole, isSuperAdmin } = useUserRole()

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isEmailValid = computed(() => !email.value || emailRegex.test(email.value))
const emailError = computed(() => (!email.value || isEmailValid.value) ? '' : 'Email inválido')

async function handleLogin() {
  if (!email.value || !password.value) {
    toast?.warning('Preencha todos os campos')
    return
  }
  if (!emailRegex.test(email.value)) {
    toast?.error('Digite um email válido')
    return
  }

  try {
    const result = await signInWithEmailAndPassword(email.value, password.value)
    await new Promise(resolve => setTimeout(resolve, 200))

    if (!result) {
      toast?.error(errorMessage.value || 'Erro ao efetuar login. Verifique seus dados.')
      return
    }

    // Verifica se o usuário é super administrador
    await checkUserRole()
    if (!isSuperAdmin.value) {
      await signOut()
      toast?.error('Acesso negado. Esta área é restrita a super administradores.')
      return
    }

    if (user.value?.email) {
      localStorage.setItem('user_email', user.value.email)
    }

    toast?.success('Login realizado com sucesso!')
    await navigateTo('/dashboard')
  } catch {
    toast?.error('Erro inesperado ao efetuar login.')
  }
}
</script>

<template>
  <div class="w-full">
    <div class="relative rounded p-6 lg:p-8 shadow-2xl overflow-hidden">
      <div class="absolute inset-0 rounded bg-gradient-to-r from-blue-500 via-purple-600 to-pink-600 animate-gradient bg-[length:200%_auto]" aria-hidden="true" />
      <div class="absolute inset-[1px] rounded bg-[#0a0a0a]/95 backdrop-blur-xl" aria-hidden="true" />

      <div class="relative z-10">
        <div class="space-y-1">
          <h2 class="text-xl font-semibold text-white">Painel Administrativo</h2>
          <p class="text-sm text-gray-300">Acesso restrito a administradores</p>
        </div>

        <form @submit.prevent="handleLogin" class="mt-6 space-y-3" novalidate>
          <div>
            <label for="login-email" class="sr-only">Email</label>
            <AppInput
              id="login-email"
              v-model="email"
              type="email"
              placeholder="Email"
              autocomplete="email"
              required
              :invalid="!!emailError"
              :valid="!!email && isEmailValid"
            />
            <p v-if="emailError" class="text-xs text-red-400 mt-1 px-1" role="alert">
              {{ emailError }}
            </p>
          </div>

          <div>
            <label for="login-password" class="sr-only">Senha</label>
            <AppInput
              id="login-password"
              v-model="password"
              type="password"
              placeholder="Senha"
              autocomplete="current-password"
              required
              :valid="!!password"
            />
          </div>

          <AppButton
            type="submit"
            block
            :disabled="isLoading || !email || !password || !isEmailValid"
            class="bg-purple-600 hover:bg-purple-700 text-white mt-2"
          >
            <span v-if="isLoading">Entrando...</span>
            <span v-else>Entrar</span>
          </AppButton>
        </form>
      </div>
    </div>
  </div>
</template>
