-- Funções de apoio às Edge Functions e agendamentos (pg_cron + pg_net).

-- o sync diário anda por comprador (uma listagem no Asaas cobre parcelamentos e avulsas)
alter table public.compradores add column ultima_sync_em timestamptz;
create index on public.compradores (empresa_id, ultima_sync_em nulls first);

-- ---------------------------------------------------------------------------
-- Rate limit por janela fixa. Devolve true se a chamada ainda está dentro do limite.
-- ---------------------------------------------------------------------------
create or replace function public.rate_limit_registrar(p_chave text, p_janela_segundos int, p_limite int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  inicio timestamptz := to_timestamp(floor(extract(epoch from now()) / p_janela_segundos) * p_janela_segundos);
  total int;
begin
  insert into public.rate_limits as r (chave, janela_inicio, contador)
  values (p_chave, inicio, 1)
  on conflict (chave, janela_inicio) do update set contador = r.contador + 1
  returning contador into total;

  -- limpeza oportunista de janelas antigas
  if random() < 0.02 then
    delete from public.rate_limits where janela_inicio < now() - interval '2 days';
  end if;

  return total <= p_limite;
end $$;

-- ---------------------------------------------------------------------------
-- Numera as parcelas de um contrato pela ordem do vencimento original, quando o
-- Asaas não informa o número (nem no campo nem na descrição "Parcela X de Y").
-- ---------------------------------------------------------------------------
create or replace function public.renumerar_parcelas(p_contrato_id uuid)
returns void language sql security definer set search_path = '' as $$
  with ordem as (
    select id, row_number() over (order by coalesce(vencimento_original, vencimento), asaas_payment_id) as n
    from public.cobrancas
    where contrato_id = p_contrato_id and not removida
  )
  update public.cobrancas c set numero_parcela = o.n
  from ordem o
  where c.id = o.id and c.numero_parcela is distinct from o.n;
$$;

-- ---------------------------------------------------------------------------
-- Exclusão de conta pelo comprador (Apple + LGPD).
-- Apaga o que é pessoal e não é necessário para a imobiliária; o contrato e as
-- cobranças continuam existindo (a dívida não some com a exclusão do app).
-- ---------------------------------------------------------------------------
create or replace function public.comprador_excluir_conta(p_comprador_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.push_tokens where comprador_id = p_comprador_id;
  delete from public.notificacoes where comprador_id = p_comprador_id;
  delete from public.codigos_acesso where comprador_id = p_comprador_id;
  update public.compradores
     set auth_user_id = null,
         status_acesso = 'convidado',
         termos_aceitos_em = null,
         ativado_em = null,
         excluido_em = now()
   where id = p_comprador_id;
end $$;

revoke execute on function public.rate_limit_registrar(text, int, int) from public, anon, authenticated;
revoke execute on function public.renumerar_parcelas(uuid) from public, anon, authenticated;
revoke execute on function public.comprador_excluir_conta(uuid) from public, anon, authenticated;
grant execute on function public.rate_limit_registrar(text, int, int), public.renumerar_parcelas(uuid),
  public.comprador_excluir_conta(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Carteira (painel): situação de cada contrato. security_invoker = RLS de quem consulta.
-- ---------------------------------------------------------------------------
create or replace view public.vw_carteira with (security_invoker = true) as
select
  c.id as contrato_id,
  c.empresa_id,
  c.status as status_contrato,
  cp.id as comprador_id,
  cp.nome as comprador_nome,
  cp.cpf as comprador_cpf,
  cp.telefone as comprador_telefone,
  cp.status_acesso,
  i.id as imovel_id,
  i.identificacao as imovel,
  e.id as empreendimento_id,
  e.nome as empreendimento,
  r.total_parcelas,
  r.parcelas_pagas,
  r.parcelas_vencidas,
  r.total_pago,
  r.saldo_em_aberto,
  (select min(cb.vencimento) from public.cobrancas cb
    where cb.contrato_id = c.id and cb.status_app = 'vencida' and not cb.removida) as vencida_desde,
  (select coalesce(sum(cb.valor), 0) from public.cobrancas cb
    where cb.contrato_id = c.id and cb.status_app = 'vencida' and not cb.removida) as valor_vencido,
  c.ultima_sync_em
from public.contratos c
join public.compradores cp on cp.id = c.comprador_id
join public.imoveis i on i.id = c.imovel_id
left join public.empreendimentos e on e.id = i.empreendimento_id
join public.vw_resumo_contrato r on r.contrato_id = c.id;

-- ---------------------------------------------------------------------------
-- Agendamentos. As chamadas usam dois segredos do Vault, criados uma vez por ambiente:
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<mesmo valor de CRON_SECRET das functions>', 'cron_secret');
-- Em ambiente local sem esses segredos, o job roda e não faz nada.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.chamar_edge_function(p_nome text, p_corpo jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  url text;
  segredo text;
begin
  select decrypted_secret into url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into segredo from vault.decrypted_secrets where name = 'cron_secret';
  if url is null or segredo is null then
    raise notice 'chamar_edge_function(%): segredos project_url/cron_secret ausentes no Vault', p_nome;
    return;
  end if;
  perform net.http_post(
    url := url || '/functions/v1/' || p_nome,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', segredo),
    body := p_corpo,
    timeout_milliseconds := 120000
  );
end $$;
revoke execute on function public.chamar_edge_function(text, jsonb) from public, anon, authenticated;

-- Horários em UTC. Cuiabá = UTC−4 o ano todo (sem horário de verão).
-- 08:00 Cuiabá: avisos de vencimento
select cron.schedule('notify-vencimentos', '0 12 * * *', $$select public.chamar_edge_function('notify-vencimentos')$$);
-- 02:00–05:45 Cuiabá, a cada 15 min: sincronização completa com o Asaas (rede de segurança dos
-- webhooks). Cada chamada processa ~110 s de compradores com sync mais antigo que 20 h.
select cron.schedule('asaas-sync-diario', '*/15 6-9 * * *', $$select public.chamar_edge_function('asaas-sync')$$);
-- domingo 04:00 Cuiabá: limpeza de dados técnicos antigos
select cron.schedule('limpeza-semanal', '0 8 * * 0', $$
  delete from public.codigos_acesso where created_at < now() - interval '30 days';
  delete from public.rate_limits where janela_inicio < now() - interval '2 days';
  delete from public.asaas_webhook_eventos where processado_em is not null and erro is null and created_at < now() - interval '180 days';
$$);
