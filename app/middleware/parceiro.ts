export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return
  try {
    const supabase = useSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return navigateTo('/login')

    const { data: parceiro } = await supabase
      .from('parceiros')
      .select('id, ativo')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if ((parceiro as { id: string; ativo: boolean } | null)?.ativo) return

    // Parceiro bloqueado: desloga e mostra o modal de conta bloqueada
    if (parceiro) {
      useState<boolean>('conta_bloqueada').value = true
      await supabase.auth.signOut()
      return navigateTo('/login')
    }

    // Não é parceiro: superAdmin volta ao dashboard, demais são deslogados
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('role')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (usuario?.role === 'superAdmin') return navigateTo('/dashboard')

    await supabase.auth.signOut()
    return navigateTo('/login')
  } catch {
    return navigateTo('/login')
  }
})
