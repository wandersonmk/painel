export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return
  try {
    const supabase = useSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return navigateTo('/login')

    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('role')
      .eq('auth_user_id', user.id)
      .single()

    if (error || !usuario || usuario.role !== 'superAdmin') {
      await supabase.auth.signOut()
      return navigateTo('/login')
    }
  } catch {
    return navigateTo('/login')
  }
})
