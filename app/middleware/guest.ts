export default defineNuxtRouteMiddleware(async () => {
  const user = useSupabaseUser()
  if (!user.value) return

  // Parceiro logado vai para o portal dele. Verificado também no SSR para o
  // redirect acontecer no servidor, sem nunca renderizar o painel admin no meio.
  try {
    const supabase = useSupabaseClient()
    const { data: parceiro } = await supabase
      .from('parceiros')
      .select('id, ativo')
      .eq('auth_user_id', user.value.id)
      .maybeSingle()

    const p = parceiro as { id: string; ativo: boolean } | null
    if (p?.ativo) {
      return navigateTo('/parceiro', { replace: true })
    }
    // Parceiro bloqueado: desloga e mostra o modal (somente no client)
    if (p && import.meta.client) {
      useState<boolean>('conta_bloqueada').value = true
      await supabase.auth.signOut()
      return
    }
    if (p) return // SSR: deixa o client tratar o bloqueio
  } catch {
    // mantém fluxo padrão
  }

  return navigateTo('/dashboard', { replace: true })
})
