import { ref, computed, readonly } from 'vue'
import type { Session } from '@supabase/supabase-js'

export function useAuth() {
  const supabase = useSupabaseClient()

  // user é o estado mantido pelo módulo @nuxtjs/supabase — sobrevive a refreshes
  const user = useSupabaseUser()
  const session = useState<Session | null>('auth_session', () => null)
  // Só fica true durante o login. Começava true no navegador e só o
  // initSession (que nenhuma tela chama) desligava: quem chegava ao /login sem
  // recarregar (depois de sair, ou pelo voltar) via o botão preso em
  // "Entrando..." até dar F5 (09/10/2026).
  const isLoading = useState<boolean>('auth_loading', () => false)
  const errorMessage = ref<string | null>(null)

  // O estado do módulo pode existir antes de a hidratação preencher o UUID.
  // Considerar autenticado só quando há uma identidade utilizável evita
  // consultas como `auth_user_id=eq.undefined`.
  const isAuthenticated = computed(() => !!user.value?.id)

  const signInWithEmailAndPassword = async (email: string, password: string) => {
    isLoading.value = true
    errorMessage.value = null
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      session.value = data.session
      return data.user
    } catch (err: any) {
      errorMessage.value = String(err?.message || err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    session.value = null
  }

  const initSession = async () => {
    if (import.meta.server) return
    try {
      const { data } = await supabase.auth.getSession()
      if (data.session) session.value = data.session
    } finally {
      isLoading.value = false
    }
  }

  return {
    user,
    session: readonly(session),
    isAuthenticated,
    isLoading: readonly(isLoading),
    errorMessage: readonly(errorMessage),
    signInWithEmailAndPassword,
    signOut,
    initSession,
    clearError: () => { errorMessage.value = null },
  }
}
