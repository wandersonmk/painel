import {
  MENSAGEM_AFILIADO_BLOQUEADO,
  MENSAGEM_SEM_ACESSO_PAINEL,
  buscarAfiliadoLogado,
  sairDaContaAfiliado,
  situacaoParceiroLogado,
} from '~/composables/useAfiliado'

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
    // Parceria REMOVIDA (removido_em) conta como não ser parceiro (09/10/2026).
    const parceiro = await situacaoParceiroLogado(supabase, user.id).catch(() => null)
    if (parceiro === 'ativo') {
      return navigateTo('/parceiro')
    }

    // Afiliado vai para o portal dele. No SSR vai mesmo bloqueado: mandar para
    // /login faria guest → /dashboard → /login em loop; lá o middleware do
    // afiliado (client) desloga com o aviso.
    const afiliado = await buscarAfiliadoLogado(supabase)
    if (afiliado?.ativo || (afiliado && import.meta.server)) {
      return navigateTo('/afiliado')
    }

    // No servidor: se o papel foi carregado e NÃO é superAdmin, redireciona já —
    // nunca deixa o HTML do painel admin sair na resposta SSR. Só faz fall-through
    // (deixando o client revalidar) quando a consulta de papel falhou (error),
    // para não derrubar uma sessão válida por um soluço transitório no SSR.
    if (import.meta.server) {
      if (error) return
      return navigateTo('/login')
    }

    // Cliente: afiliado bloqueado sai só desta sessão, com o aviso.
    if (afiliado && parceiro !== 'suspenso') {
      useToast().error(MENSAGEM_AFILIADO_BLOQUEADO)
      await sairDaContaAfiliado(supabase)
      return navigateTo('/login')
    }

    // Cliente: parceiro suspenso mostra o modal de conta bloqueada.
    if (parceiro === 'suspenso') {
      useState<boolean>('conta_bloqueada').value = true
      await supabase.auth.signOut()
      return navigateTo('/login')
    }

    // Cliente: sem papel no painel (inclui papel removido). Aviso normal de
    // "sem acesso" e sai só desta sessão (o app da Agzap continua logado).
    useToast().error(MENSAGEM_SEM_ACESSO_PAINEL)
    await sairDaContaAfiliado(supabase)
    return navigateTo('/login')
  } catch {
    if (import.meta.server) return
    return navigateTo('/login')
  }
})
