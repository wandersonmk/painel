-- ═══════════════════════════════════════════════════════════════════════════
-- CRÍTICO — RPCs de assinatura sem nenhuma checagem de autorização
--
-- Quatro funções SECURITY DEFINER estão com EXECUTE liberado para `anon` e
-- `authenticated` e não verificam NADA sobre quem chamou. Qualquer usuário
-- logado (cliente ou parceiro) alcança direto pelo PostgREST com a anon key.
--
-- PoC confirmado em 13/08/2026 (transação + rollback), com JWT de parceiro:
--
--   select public.renew_subscription('<auth_user_id do cliente>');
--   → empresas.subscription_renews_at = now() + 30 dias, status 'active'
--
--   Rodou sem erro, renovou cliente de terceiro, NÃO consumiu crédito e NÃO
--   deixou rastro em parceiro_renovacoes nem em parceiro_auditoria.
--
-- Efeito prático: o modelo de licenças pré-pagas é contornável por completo.
-- Um parceiro renova todos os clientes dele de graça, para sempre, chamando a
-- função em loop — e o painel mostra tudo "Ativo", sem consumo.
--
-- As quatro:
--   renew_subscription(user_id)                     → +30d em qualquer empresa por auth_user_id
--   ativar_assinatura(empresa_id, cust, sub, venc)  → ativa qualquer empresa como 'pro' na data que quiser
--   renovar_assinatura(subscription_id, venc)       → ativa + move vencimento por subscription_id
--   cancelar_assinatura(subscription_id, status)    → cancela assinatura de terceiro (sabotagem)
--
-- E o parceiro consegue os identificadores: a policy `empresas_acesso_parceiro`
-- deixa ele ler a linha inteira dos clientes vinculados, subscription_id e
-- auth_user_id inclusive.
--
-- ANTES DE APLICAR: procurar no repositório do app (app.agzap.com.br) por
-- chamadas `rpc('renew_subscription'|'ativar_assinatura'|'renovar_assinatura'|
-- 'cancelar_assinatura')`. Se existir alguma no navegador, ela É a falha —
-- precisa virar chamada de servidor com service_role antes do revoke.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Cobrança só pelo backend ------------------------------------------------
revoke execute on function public.renew_subscription(uuid) from anon, authenticated;
revoke execute on function public.ativar_assinatura(uuid, text, text, timestamptz) from anon, authenticated;
revoke execute on function public.renovar_assinatura(text, timestamptz) from anon, authenticated;
revoke execute on function public.cancelar_assinatura(text, text) from anon, authenticated;

-- search_path fixo nas quatro (todas estão sem, é o padrão que o advisor aponta).
alter function public.renew_subscription(uuid) set search_path to 'public', 'pg_temp';
alter function public.ativar_assinatura(uuid, text, text, timestamptz) set search_path to 'public', 'pg_temp';
alter function public.renovar_assinatura(text, timestamptz) set search_path to 'public', 'pg_temp';
alter function public.cancelar_assinatura(text, text) set search_path to 'public', 'pg_temp';

-- 2) Configuração de empresa: nada para anônimo ------------------------------
-- Estas continuam disponíveis para `authenticated` porque o app chama do
-- navegador, mas ninguém deslogado tem o que fazer com elas.
revoke execute on function public.garantir_customer_stripe(uuid, text) from anon;
revoke execute on function public.salvar_elevenlabs_empresa(uuid, text, text) from anon;
revoke execute on function public.atualizar_elevenlabs_voice_id(uuid, text) from anon;
revoke execute on function public.remover_elevenlabs_empresa(uuid) from anon;
revoke execute on function public.toggle_elevenlabs_voz(uuid, boolean) from anon;
revoke execute on function public.salvar_minimax_empresa(uuid, text, text, text, text) from anon;
revoke execute on function public.remover_minimax_empresa(uuid) from anon;
revoke execute on function public.toggle_minimax_voz(uuid, boolean) from anon;

-- 3) IDOR pendente nas funções de configuração -------------------------------
-- Todas recebem p_empresa_id e não conferem se a empresa é de quem chamou:
-- qualquer usuário logado sobrescreve a chave de API, a voz ou a config de
-- QUALQUER empresa. Não é fraude de crédito, mas é adulteração de dado alheio.
--
-- O guard abaixo resolve com duas linhas dentro de cada função. Aplicar depois
-- de conferir o corpo de cada uma (elas não foram reescritas aqui de propósito,
-- para não alterar comportamento que o app depende).
create or replace function public.empresa_do_usuario(p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.empresas e
     where e.id = p_empresa_id
       and e.auth_user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.usuarios_empresas ue
      join public.usuarios u on u.id = ue.usuario_id
     where ue.empresa_id = p_empresa_id
       and u.auth_user_id = (select auth.uid())
       and coalesce(ue.ativo, true)
       and ue.papel in ('proprietario', 'admin')
  )
  or (select public.is_super_admin());
$$;

-- Trecho a inserir no começo de cada função da lista do item 2:
--
--   if not public.empresa_do_usuario(p_empresa_id) then
--     raise exception 'Empresa não pertence ao usuário autenticado';
--   end if;
--
-- Funções que precisam: garantir_customer_stripe, salvar_elevenlabs_empresa,
-- atualizar_elevenlabs_voice_id, remover_elevenlabs_empresa,
-- toggle_elevenlabs_voz, salvar_minimax_empresa, remover_minimax_empresa,
-- atualizar_minimax_config (as duas assinaturas), toggle_minimax_voz.

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (depois de aplicar, o insert abaixo deve falhar com permissão
-- negada em vez de renovar):
--
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uid de parceiro>","role":"authenticated"}';
--   select public.renew_subscription('<auth_user_id de um cliente>');  -- espera-se ERROR 42501
--   rollback;
-- ═══════════════════════════════════════════════════════════════════════════
