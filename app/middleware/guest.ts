import { buscarAfiliadoLogado, conferirAfiliadoLogado, sairDaContaAfiliado, situacaoParceiroLogado } from '~/composables/useAfiliado'

export default defineNuxtRouteMiddleware(async () => {
  const user = useSupabaseUser()
  // Durante a hidratação SSR o módulo pode expor temporariamente um objeto de
  // usuário ainda incompleto. Nunca monte um filtro UUID antes de o id existir.
  const authUserId = user.value?.id
  if (!authUserId) return

  // Parceiro logado vai para o portal dele. Verificado também no SSR para o
  // redirect acontecer no servidor, sem nunca renderizar o painel admin no meio.
  // Parceria REMOVIDA (removido_em) conta como não ser parceiro (09/10/2026).
  try {
    const supabase = useSupabaseClient()
    const parceiro = await situacaoParceiroLogado(supabase, authUserId)

    if (parceiro === 'ativo') {
      return navigateTo('/parceiro', { replace: true })
    }
    // Parceiro suspenso: desloga e mostra o modal (somente no client).
    // Se também for afiliado ativo, vai para o portal do afiliado em vez disso.
    if (parceiro === 'suspenso') {
      if (import.meta.server) return // SSR: deixa o client tratar o bloqueio
      const afiliado = await buscarAfiliadoLogado(supabase)
      if (afiliado?.ativo) return navigateTo('/afiliado', { replace: true })
      useState<boolean>('conta_bloqueada').value = true
      await supabase.auth.signOut()
      return
    }

    // Não é parceiro: superAdmin e afiliado seguem para /dashboard (o
    // super-admin.ts manda o afiliado para o portal dele, assim o superAdmin
    // afiliado não se perde). Sem papel nenhum (inclusive papel removido), fica
    // no login: mandar para /dashboard faria /dashboard → /login → … em loop.
    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('role')
      .eq('auth_user_id', authUserId)
      .maybeSingle()
    if (!error && (usuario as { role?: string } | null)?.role !== 'superAdmin') {
      // conferirAfiliadoLogado lança em erro de rede: aí segue o fluxo padrão.
      const afiliado = await conferirAfiliadoLogado(supabase)
      if (!afiliado) {
        if (import.meta.client) await sairDaContaAfiliado(supabase)
        return
      }
    }
  } catch {
    // mantém fluxo padrão
  }

  return navigateTo('/dashboard', { replace: true })
})
