import {
  MENSAGEM_AFILIADO_BLOQUEADO,
  MENSAGEM_SEM_ACESSO_PAINEL,
  buscarAfiliadoLogado,
  sairDaContaAfiliado,
  situacaoParceiroLogado,
} from '~/composables/useAfiliado'

export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return
  try {
    const supabase = useSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return navigateTo('/login')

    // Parceria REMOVIDA (removido_em) conta como não ser parceiro (09/10/2026).
    const parceiro = await situacaoParceiroLogado(supabase, user.id).catch(() => null)
    if (parceiro === 'ativo') return

    // Parceiro suspenso: desloga e mostra o modal de conta bloqueada
    // (se também for afiliado ativo, vai para o portal do afiliado).
    if (parceiro === 'suspenso') {
      if ((await buscarAfiliadoLogado(supabase))?.ativo) return navigateTo('/afiliado')
      useState<boolean>('conta_bloqueada').value = true
      await supabase.auth.signOut()
      return navigateTo('/login')
    }

    // Não é parceiro: superAdmin volta ao dashboard, afiliado vai ao portal dele.
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('role')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if ((usuario as { role?: string } | null)?.role === 'superAdmin') {
      return navigateTo('/dashboard')
    }

    // Afiliado vai para o portal dele; bloqueado sai só desta sessão, com o aviso.
    const afiliado = await buscarAfiliadoLogado(supabase)
    if (afiliado?.ativo) return navigateTo('/afiliado')
    if (afiliado) {
      useToast().error(MENSAGEM_AFILIADO_BLOQUEADO)
      await sairDaContaAfiliado(supabase)
      return navigateTo('/login')
    }

    // Sem papel no painel (inclui parceria removida): aviso normal de "sem
    // acesso", nunca "Conta bloqueada". Sai só desta sessão (o app continua).
    useToast().error(MENSAGEM_SEM_ACESSO_PAINEL)
    await sairDaContaAfiliado(supabase)
    return navigateTo('/login')
  } catch {
    return navigateTo('/login')
  }
})
