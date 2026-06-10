export default defineNuxtRouteMiddleware(async () => {
  try {
    const supabase = useSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      // No SSR não redireciona em caso de sessão incompleta — o client revalida
      if (import.meta.server) return
      return navigateTo('/login')
    }

    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('role')
      .eq('auth_user_id', user.id)
      .single()

    const role = (usuario as { role?: string } | null)?.role
    if (error || role !== 'superAdmin') {
      // Parceiro ativo é redirecionado para o portal dele em vez de ser deslogado.
      // No SSR isso evita renderizar o painel admin antes do redirect.
      const { data: parceiro } = await supabase
        .from('parceiros')
        .select('id, ativo')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      const p = parceiro as { id: string; ativo: boolean } | null
      if (p?.ativo) {
        return navigateTo('/parceiro')
      }

      if (import.meta.server) return

      // Parceiro bloqueado: desloga e mostra o modal de conta bloqueada
      if (p) {
        useState<boolean>('conta_bloqueada').value = true
      }
      await supabase.auth.signOut()
      return navigateTo('/login')
    }
  } catch {
    if (import.meta.server) return
    return navigateTo('/login')
  }
})
