import { ref } from 'vue'

export const useUserRole = () => {
  const isSuperAdmin = ref(false)
  const userRole = ref<'user' | 'admin' | 'manager' | 'superAdmin' | null>(null)
  const isAdmin = ref(false)
  const loading = ref(true)

  const checkUserRole = async () => {
    loading.value = true
    try {
      const supabase = useSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        isSuperAdmin.value = false
        isAdmin.value = false
        userRole.value = null
        return
      }

      const { data: usuario, error } = await supabase
        .from('usuarios')
        .select('role')
        .eq('auth_user_id', user.id)
        .single()

      if (error || !usuario) {
        isSuperAdmin.value = false
        isAdmin.value = false
        userRole.value = null
        return
      }

      userRole.value = usuario.role
      isSuperAdmin.value = usuario.role === 'superAdmin'
      isAdmin.value = usuario.role === 'admin'
    } catch {
      isSuperAdmin.value = false
      isAdmin.value = false
      userRole.value = null
    } finally {
      loading.value = false
    }
  }

  return { isSuperAdmin, isAdmin, userRole, loading, checkUserRole }
}
