-- ═══════════════════════════════════════════════════════════════════════════
-- Hardening: impedir que um usuário logado crie empresa já paga (auto-concessão)
--
-- PROBLEMA (confirmado em 13/08/2026 com PoC em transação + rollback):
--   A policy `empresas_acesso_proprietario` é FOR ALL com check
--   `auth_user_id = auth.uid()`, e o GRANT de INSERT para `authenticated`
--   inclui TODAS as colunas de cobrança e limite. Resultado: qualquer usuário
--   logado (parceiro inclusive) consegue, direto no PostgREST com a anon key:
--
--     POST /rest/v1/empresas
--     { "nome":"X", "auth_user_id":"<próprio uid>", "subscription_status":"active",
--       "subscription_plan":"enterprise", "subscription_renews_at":"2099-01-01",
--       "max_instancias":50, "envios_habilitado":true }
--
--   → empresa enterprise vitalícia, sem Stripe e sem consumir crédito de parceiro.
--   Repetindo com outros e-mails de cadastro, o parceiro entrega conta ao cliente
--   final sem gastar 1 crédito.
--
--   O UPDATE já está protegido: o GRANT de UPDATE para `authenticated` não
--   inclui as colunas de cobrança/limite. O buraco é só no INSERT.
--
-- ESTRATÉGIA:
--   Não revogar o INSERT (o cadastro do app pode depender dele). Em vez disso,
--   um BEFORE INSERT normaliza as colunas sensíveis para o padrão de trial
--   sempre que o autor NÃO for o backend (service_role) nem superAdmin.
--   Cadastro continua funcionando; plano pago passa a ser impossível de forjar.
--
-- APLICAR: revisar com o time do app antes. Se o cadastro do app grava
-- subscription_* no insert do cliente, ele passa a virar trial de 7 dias — que
-- é justamente o comportamento correto.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Trigger de normalização ------------------------------------------------
-- SECURITY INVOKER de propósito: dentro de SECURITY DEFINER `current_user`
-- viraria o dono da função (postgres) e o teste de papel não valeria nada.
create or replace function public.empresas_normalizar_plano_no_insert()
returns trigger
language plpgsql
as $$
begin
  -- Backend da Agzap (service_role) e superAdmin gravam o que precisarem.
  if current_user in ('service_role', 'postgres', 'supabase_admin')
     or public.is_super_admin() then
    return new;
  end if;

  -- Cobrança: sempre trial novo, nunca plano pago.
  new.subscription_status    := 'trial';
  new.subscription_plan      := 'free';
  new.subscription_period    := 'trial';
  new.subscription_price     := null;
  new.subscription_renews_at := null;
  new.trial_ends_at          := least(
    coalesce(new.trial_ends_at, now() + interval '7 days'),
    now() + interval '7 days'
  );
  new.cancel_at_period_end   := false;
  new.customer_id            := null;
  new.subscription_id        := null;
  new.ativo                  := true;

  -- Limites e add-ons: valores de fábrica.
  new.max_instancias        := 1;
  new.max_agentes           := 1;
  new.max_webhooks_entrada  := 5;
  new.max_webhooks_saida    := 5;
  new.max_profissionais     := 20;
  new.max_clientes          := 100000;
  new.max_cobrancas_dia     := 200;
  new.max_stickers          := 20;
  new.max_envios_mes        := 0;
  new.envios_habilitado     := false;  -- add-on pago: nunca liberado por omissão
  new.usa_token_global      := false;
  new.modelo_ia_habilitado  := false;

  return new;
end;
$$;

drop trigger if exists trg_empresas_normalizar_plano_no_insert on public.empresas;
create trigger trg_empresas_normalizar_plano_no_insert
  before insert on public.empresas
  for each row execute function public.empresas_normalizar_plano_no_insert();

-- 2) anon não escreve em empresas -------------------------------------------
-- Hoje o RLS já barra (auth.uid() é null e nenhuma policy casa), mas o GRANT
-- aberto para `anon` é uma bomba armada: basta alguém criar uma policy
-- permissiva no futuro para virar escrita pública.
revoke insert, update on public.empresas from anon;

-- 3) search_path fixo em is_super_admin() ------------------------------------
-- É SECURITY DEFINER e hoje roda sem search_path fixo — é o padrão que o
-- advisor do Supabase sinaliza (function_search_path_mutable).
alter function public.is_super_admin() set search_path to 'public', 'pg_temp';

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (rodar depois de aplicar — deve terminar em ROLLBACK e a linha
-- retornada precisa vir com status 'trial'/'free', não 'active'/'enterprise'):
--
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uid real>","role":"authenticated"}';
--   insert into public.empresas (nome, email, auth_user_id, subscription_status,
--     subscription_plan, subscription_renews_at, max_instancias, envios_habilitado)
--   values ('TESTE', 't@e.invalid', '<uid real>', 'active', 'enterprise',
--     '2099-01-01', 50, true)
--   returning subscription_status, subscription_plan, max_instancias, envios_habilitado;
--   rollback;
-- ═══════════════════════════════════════════════════════════════════════════
