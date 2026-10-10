import type { AfiliadoMe } from '~/composables/useAfiliado'
import {
  ERRO_SEM_SESSAO,
  MENSAGEM_AFILIADO_BLOQUEADO,
  MENSAGEM_SEM_ACESSO_PAINEL,
  conferirAfiliadoLogado,
  sairDaContaAfiliado,
  situacaoParceiroLogado,
} from '~/composables/useAfiliado'

/**
 * Portal do Afiliado: só afiliado ativo entra. Roda só no client, como o
 * middleware do parceiro — a conferência passa por /api/afiliado/me porque as
 * tabelas de afiliado não têm policy de RLS. Afiliação REMOVIDA volta como
 * "não é afiliado" (a rota devolve null), nunca como bloqueio.
 */
export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return
  try {
    const supabase = useSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return navigateTo('/login')

    // Uma nova tentativa antes de concluir que não é afiliado: um soluço de
    // rede não pode deslogar ninguém. Se a conferência FALHOU (servidor fora,
    // 500/503, rede) nas duas tentativas, a navegação segue: as rotas de dados
    // conferem o afiliado no servidor e a página mostra o próprio erro. Antes,
    // falha virava "não é afiliado" → saída da conta + cadeia de redirects, e a
    // tela anterior ficava parada (09/10/2026, servidor de dev com a API fora).
    let afiliado: AfiliadoMe | null = null
    try {
      afiliado = await conferirAfiliadoLogado(supabase)
    }
    catch {
      try {
        afiliado = await conferirAfiliadoLogado(supabase)
      }
      catch (erro: any) {
        // Sem sessão ou token recusado (401): é login vencido, não servidor fora.
        if (erro?.message === ERRO_SEM_SESSAO || erro?.statusCode === 401 || erro?.status === 401) return navigateTo('/login')
        console.error('[middleware:afiliado] não deu para conferir o acesso agora', erro)
        useToast().warning('Não foi possível conferir seu acesso agora. Se algo não carregar, atualize a página.')
        return
      }
    }

    if (afiliado?.ativo) return

    if (afiliado) {
      useToast().error(MENSAGEM_AFILIADO_BLOQUEADO)
      await sairDaContaAfiliado(supabase)
      return navigateTo('/login')
    }

    // Não é afiliado: superAdmin volta ao dashboard, parceiro ativo vai ao portal dele.
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('role')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if ((usuario as { role?: string } | null)?.role === 'superAdmin') {
      return navigateTo('/dashboard')
    }

    const parceiro = await situacaoParceiroLogado(supabase, user.id).catch(() => null)
    if (parceiro === 'ativo') {
      return navigateTo('/parceiro')
    }
    // Parceiro suspenso: modal de conta bloqueada.
    if (parceiro === 'suspenso') {
      useState<boolean>('conta_bloqueada').value = true
      await sairDaContaAfiliado(supabase)
      return navigateTo('/login')
    }

    // Sem papel no painel (inclui afiliação removida): aviso normal de "sem acesso".
    useToast().error(MENSAGEM_SEM_ACESSO_PAINEL)
    await sairDaContaAfiliado(supabase)
    return navigateTo('/login')
  }
  catch {
    return navigateTo('/login')
  }
})
