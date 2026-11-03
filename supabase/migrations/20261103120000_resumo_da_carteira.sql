-- Números da Carteira no painel: quanto falta receber, quanto está vencido, o previsto
-- do mês e a previsão mês a mês. Só somam o `valor` que veio do Asaas (sem calcular juros)
-- e rodam com a permissão de quem chama (RLS): a equipe vê só a própria empresa.
-- Entram as cobranças dos contratos não cancelados; avulsas ficam de fora, como na Carteira.

create or replace function public.resumo_carteira(p_empreendimento_id uuid default null)
returns jsonb language sql stable set search_path = '' as $$
  with base as (
    select cb.valor, cb.status_app, cb.vencimento, cb.data_pagamento, cb.contrato_id,
           (now() at time zone e.fuso_horario)::date as hoje
    from public.cobrancas cb
    join public.contratos ct on ct.id = cb.contrato_id and ct.status <> 'cancelado'
    join public.imoveis i on i.id = ct.imovel_id
    join public.empresas e on e.id = cb.empresa_id
    where not cb.removida
      and cb.status_app in ('em_aberto', 'vencida', 'paga')
      and (p_empreendimento_id is null or i.empreendimento_id = p_empreendimento_id)
  ),
  b as (select *, date_trunc('month', hoje)::date as mes from base)
  select jsonb_build_object(
    'a_vencer',             coalesce(sum(valor) filter (where status_app = 'em_aberto'), 0),
    'parcelas_a_vencer',    count(*) filter (where status_app = 'em_aberto'),
    'vencido',              coalesce(sum(valor) filter (where status_app = 'vencida'), 0),
    'parcelas_vencidas',    count(*) filter (where status_app = 'vencida'),
    'contratos_em_atraso',  count(distinct contrato_id) filter (where status_app = 'vencida'),
    'previsto_mes',         coalesce(sum(valor) filter (where vencimento >= mes and vencimento < mes + interval '1 month'), 0),
    'pago_do_previsto_mes', coalesce(sum(valor) filter (where status_app = 'paga' and vencimento >= mes and vencimento < mes + interval '1 month'), 0),
    'recebido_mes',         coalesce(sum(valor) filter (where status_app = 'paga' and data_pagamento >= mes), 0),
    'recebido_total',       coalesce(sum(valor) filter (where status_app = 'paga'), 0),
    'proximos_30_dias',     coalesce(sum(valor) filter (where status_app = 'em_aberto' and vencimento between hoje and hoje + 30), 0),
    'parcelas_proximos_30', count(*) filter (where status_app = 'em_aberto' and vencimento between hoje and hoje + 30)
  )
  from b;
$$;

-- Parcelas em aberto agrupadas pelo mês do vencimento, do mês atual em diante.
-- Meses sem parcela aparecem com zero.
create or replace function public.previsao_recebimento(p_empreendimento_id uuid default null, p_meses int default 6)
returns table (mes date, valor numeric, parcelas int) language sql stable set search_path = '' as $$
  with inicio as (
    select date_trunc('month', now() at time zone fuso_horario)::date as mes
    from public.empresas
    where id = coalesce(public.admin_empresa_id(), public.comprador_empresa_id())
  ),
  meses as (
    select (i.mes + make_interval(months => n))::date as mes
    from inicio i, generate_series(0, greatest(1, least(p_meses, 24)) - 1) as n
  ),
  abertas as (
    select date_trunc('month', cb.vencimento)::date as mes, cb.valor
    from public.cobrancas cb
    join public.contratos ct on ct.id = cb.contrato_id and ct.status <> 'cancelado'
    join public.imoveis i on i.id = ct.imovel_id
    where not cb.removida
      and cb.status_app = 'em_aberto'
      and (p_empreendimento_id is null or i.empreendimento_id = p_empreendimento_id)
  )
  select m.mes, coalesce(sum(a.valor), 0), count(a.valor)::int
  from meses m
  left join abertas a on a.mes = m.mes
  group by m.mes
  order by m.mes;
$$;

grant execute on function public.resumo_carteira(uuid) to authenticated;
grant execute on function public.previsao_recebimento(uuid, int) to authenticated;
