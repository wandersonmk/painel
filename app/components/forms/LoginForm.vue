<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  MENSAGEM_AFILIADO_BLOQUEADO,
  MENSAGEM_SEM_ACESSO_PAINEL,
  buscarAfiliadoLogado,
  sairDaContaAfiliado,
  situacaoParceiroLogado,
} from '~/composables/useAfiliado'

const email = ref('')
const password = ref('')
const showPassword = ref(false)

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
      // Ordem: superAdmin → parceiro → afiliado. Papel REMOVIDO (removido_em)
      // conta como não ter o papel; suspenso/bloqueado mostra o aviso de bloqueio.
      const supabase = useSupabaseClient()
      const parceiro = await situacaoParceiroLogado(supabase, result.id).catch(() => null)
      if (parceiro === 'ativo') {
        if (user.value?.email) {
          localStorage.setItem('user_email', user.value.email)
        }
        toast?.success('Login realizado com sucesso!')
        await navigateTo('/parceiro')
        return
      }

      // Afiliado ativo entra no portal do afiliado (afiliação removida = null)
      const afiliado = await buscarAfiliadoLogado(supabase)
      if (afiliado?.ativo) {
        if (user.value?.email) {
          localStorage.setItem('user_email', user.value.email)
        }
        toast?.success('Login realizado com sucesso!')
        await navigateTo('/afiliado')
        return
      }

      // Afiliado bloqueado (e não parceiro suspenso): sai só desta sessão, com o aviso
      if (afiliado && parceiro !== 'suspenso') {
        await sairDaContaAfiliado(supabase)
        toast?.error(MENSAGEM_AFILIADO_BLOQUEADO)
        return
      }

      // Parceiro suspenso: mostra o modal explicativo com o contato
      if (parceiro === 'suspenso') {
        useContaBloqueada().bloqueado.value = true
        await signOut()
        return
      }

      // Sem papel no painel (inclui parceria/afiliação removida): aviso normal,
      // nunca "Conta bloqueada". Sai só desta sessão: o mesmo login pode estar
      // aberto no app da Agzap.
      await sairDaContaAfiliado(supabase)
      toast?.error(MENSAGEM_SEM_ACESSO_PAINEL)
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
          <h2 class="text-xl font-semibold text-white">Painel Agzap</h2>
          <p class="text-sm text-gray-300">Acesso de administradores, parceiros e afiliados</p>
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
            <div class="relative">
              <AppInput
                id="login-password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="Senha"
                autocomplete="current-password"
                required
                :valid="!!password"
                class="!pr-11"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                tabindex="-1"
                class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:text-white transition-colors"
                :aria-label="showPassword ? 'Ocultar senha' : 'Mostrar senha'"
                :title="showPassword ? 'Ocultar senha' : 'Mostrar senha'"
              >
                <i class="fa-solid text-sm" :class="showPassword ? 'fa-eye-slash' : 'fa-eye'" aria-hidden="true" />
              </button>
            </div>
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

        <p class="mt-5 text-center text-sm text-gray-400">
          Quer indicar a Agzap e ganhar em dinheiro?
          <NuxtLink to="/afiliado/cadastro" class="text-purple-300 hover:text-purple-200 underline-offset-2 hover:underline">Cadastre-se como afiliado</NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>
