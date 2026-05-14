import { ref, computed, readonly } from 'vue'
import type { User, Session } from '@supabase/supabase-js'

export function useAuth() {
  const supabase = useSupabaseClient()

  const user = useState<User | null>('auth_user', () => null)
  const session = useState<Session | null>('auth_session', () => null)
  const isLoading = useState<boolean>('auth_loading', () => import.meta.server ? false : true)
  const errorMessage = ref<string | null>(null)

  const isAuthenticated = computed(() => !!user.value && !!session.value)

  const signInWithEmailAndPassword = async (email: string, password: string) => {
    isLoading.value = true
    errorMessage.value = null
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      user.value = data.user
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
    user.value = null
    session.value = null
  }

  const initSession = async () => {
    if (import.meta.server) return
    try {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        user.value = data.session.user
        session.value = data.session
      }
    } finally {
      isLoading.value = false
    }
  }

  return {
    user: readonly(user),
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
