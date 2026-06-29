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
    if (role === 'superAdmin') return

    // Não é superAdmin (ou não foi possível carregar o papel).
    // Parceiro ativo vai para o portal dele em vez de ser deslogado.
    const { data: parceiro } = await supabase
      .from('parceiros')
      .select('id, ativo')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    const p = parceiro as { id: string; ativo: boolean } | null
    if (p?.ativo) {
      return navigateTo('/parceiro')
    }

    // No servidor: se o papel foi carregado e NÃO é superAdmin, redireciona já —
    // nunca deixa o HTML do painel admin sair na resposta SSR. Só faz fall-through
    // (deixando o client revalidar) quando a consulta de papel falhou (error),
    // para não derrubar uma sessão válida por um soluço transitório no SSR.
    if (import.meta.server) {
      if (error) return
      return navigateTo('/login')
    }

    // Cliente: parceiro bloqueado mostra o modal de conta bloqueada.
    if (p) {
      useState<boolean>('conta_bloqueada').value = true
    }
    await supabase.auth.signOut()
    return navigateTo('/login')
  } catch {
    if (import.meta.server) return
    return navigateTo('/login')
  }
})
