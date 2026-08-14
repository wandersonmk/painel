-- ═══════════════════════════════════════════════════════════════════════════
-- APLICADO EM 13/08/2026 — migrations `hardening_creditos_parceiros` e
-- `hardening_creditos_revoke_public`. Mantido no repositório como registro.
--
-- CRÍTICO — RPCs de assinatura sem nenhuma checagem de autorização
--
-- Quatro funções SECURITY DEFINER estavam alcançáveis por qualquer usuário
-- logado pelo PostgREST e não verificavam NADA sobre quem chamou.
--
-- PoC confirmado (transação + rollback), com JWT de parceiro:
--
--   select public.renew_subscription('<auth_user_id do cliente>');
--   → empresas.subscription_renews_at = now() + 30 dias, status 'active'
--
--   Renovou cliente de terceiro, NÃO consumiu crédito e NÃO deixou rastro em
--   parceiro_renovacoes nem em parceiro_auditoria. O modelo pré-pago inteiro
--   era contornável em loop.
--
-- ATENÇÃO À ARMADILHA: `revoke ... from anon, authenticated` NÃO resolve.
-- O EXECUTE vinha do PUBLIC (acl "=X/postgres"), e revogar de um papel que
-- só herda do PUBLIC não faz nada — o primeiro teste depois do revoke ainda
-- renovou. O correto é revoke from PUBLIC + grant explícito para
-- service_role, que é como parceiro_conceder_creditos já estava.
--
-- Conferido nos dois repositórios antes de aplicar: nenhum chama essas
-- funções; o cadastro (app/server/api/auth/register) e os webhooks usam
-- service_role, e garantir_customer_stripe só é chamada em
-- server/api/stripe/create-checkout-session, também com service_role.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Cobrança só pelo backend ------------------------------------------------
revoke execute on function public.renew_subscription(uuid) from public;
revoke execute on function public.ativar_assinatura(uuid, text, text, timestamptz) from public;
revoke execute on function public.renovar_assinatura(text, timestamptz) from public;
revoke execute on function public.cancelar_assinatura(text, text) from public;
revoke execute on function public.garantir_customer_stripe(uuid, text) from public;

grant execute on function public.renew_subscription(uuid) to service_role;
grant execute on function public.ativar_assinatura(uuid, text, text, timestamptz) to service_role;
grant execute on function public.renovar_assinatura(text, timestamptz) to service_role;
grant execute on function public.cancelar_assinatura(text, text) to service_role;
grant execute on function public.garantir_customer_stripe(uuid, text) to service_role;

-- 2) ElevenLabs legado -------------------------------------------------------
-- Sem checagem de dono e sem uso no app (substituído pela MiniMax).
revoke execute on function public.salvar_elevenlabs_empresa(uuid, text, text) from public;
revoke execute on function public.atualizar_elevenlabs_voice_id(uuid, text) from public;
revoke execute on function public.remover_elevenlabs_empresa(uuid) from public;
revoke execute on function public.toggle_elevenlabs_voz(uuid, boolean) from public;

-- 3) search_path fixo (function_search_path_mutable nos advisors) -------------
alter function public.renew_subscription(uuid) set search_path to 'public', 'pg_temp';
alter function public.ativar_assinatura(uuid, text, text, timestamptz) set search_path to 'public', 'pg_temp';
alter function public.renovar_assinatura(text, timestamptz) set search_path to 'public', 'pg_temp';
alter function public.cancelar_assinatura(text, text) set search_path to 'public', 'pg_temp';
alter function public.garantir_customer_stripe(uuid, text) set search_path to 'public', 'pg_temp';
alter function public.is_super_admin() set search_path to 'public', 'pg_temp';

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- NÃO ERA FALHA: as funções da MiniMax (salvar_minimax_empresa,
-- remover_minimax_empresa, atualizar_minimax_config, toggle_minimax_voz) já
-- conferem o dono da empresa via pode_editar_integracoes_empresa(). Uma busca
-- por 'auth.uid' no corpo não acha isso porque a checagem está no helper.
--
-- VERIFICAÇÃO (deve dar ERROR 42501 nas duas):
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uid real>","role":"authenticated"}';
--   select public.renew_subscription('<auth_user_id de um cliente>');
--   rollback;
-- ═══════════════════════════════════════════════════════════════════════════
