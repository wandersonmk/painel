begin;

-- O aplicativo do cliente lê o preço anual diretamente desta coluna. Toda
-- empresa nasce com o preço anual padrão, que depois pode ser personalizado
-- pelo super admin ou pelo parceiro.
alter table public.empresas
  alter column subscription_price_anual set default 2299.00;

update public.empresas
set subscription_price_anual = 2299.00
where subscription_price_anual is null
   or subscription_price_anual <= 0;

alter table public.empresas
  alter column subscription_price_anual set not null;

comment on column public.empresas.subscription_price_anual is
  'Preço fechado do plano de 12 meses; padrão R$ 2.299,00, personalizável por empresa.';

commit;
