-- Correções da bateria de testes e da revisão de código de 2026-10-28.

-- 1) Contrato cancelado: some do app de verdade e o parcelamento pode ser religado.
drop policy cobrancas_comprador on public.cobrancas;
create policy cobrancas_comprador on public.cobrancas for select to authenticated
  using (
    comprador_id = public.comprador_atual_id()
    and not removida
    and status_app <> 'oculta'
    and (
      (contrato_id is not null and exists (
        select 1 from public.contratos c where c.id = cobrancas.contrato_id and c.status <> 'cancelado'
      ))
      or (contrato_id is null and exists (
        select 1 from public.empresas e where e.id = cobrancas.empresa_id and e.mostrar_cobrancas_avulsas
      ))
    )
  );

drop index public.contratos_empresa_id_asaas_installment_id_idx;
create unique index contratos_parcelamento_ativo on public.contratos (empresa_id, asaas_installment_id)
  where asaas_installment_id is not null and status <> 'cancelado';

-- 2) Total pago = o que entrou de fato. No Asaas, `value` de uma cobrança paga com juros
--    é o valor pago e `originalValue` o valor antes dos juros.
create or replace view public.vw_resumo_contrato with (security_invoker = true) as
select
  c.id as contrato_id,
  c.empresa_id,
  c.comprador_id,
  c.imovel_id,
  coalesce(c.numero_parcelas, count(cb.id) filter (where cb.contrato_id is not null))::int as total_parcelas,
  count(cb.id) filter (where cb.status_app = 'paga')::int as parcelas_pagas,
  count(cb.id) filter (where cb.status_app = 'vencida')::int as parcelas_vencidas,
  coalesce(sum(cb.valor) filter (where cb.status_app = 'paga'), 0) as total_pago,
  coalesce(sum(cb.valor) filter (where cb.status_app in ('em_aberto', 'vencida')), 0) as saldo_em_aberto,
  (select cb2.id from public.cobrancas cb2
    where cb2.contrato_id = c.id and cb2.status_app in ('em_aberto', 'vencida') and not cb2.removida
    order by cb2.vencimento limit 1) as proxima_cobranca_id
from public.contratos c
left join public.cobrancas cb on cb.contrato_id = c.id and not cb.removida
group by c.id;

-- 3) Carteira sabe quem só recebeu a senha provisória (não conta como "App ativo").
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
  c.ultima_sync_em,
  cp.deve_trocar_senha
from public.contratos c
join public.compradores cp on cp.id = c.comprador_id
join public.imoveis i on i.id = c.imovel_id
left join public.empreendimentos e on e.id = i.empreendimento_id
join public.vw_resumo_contrato r on r.contrato_id = c.id;

-- 4) Recebido no mês somado no banco (sem o corte de 1000 linhas da API), no fuso da empresa.
create or replace function public.recebido_no_mes()
returns numeric language sql stable set search_path = '' as $$
  select coalesce(sum(cb.valor), 0)
  from public.cobrancas cb
  join public.empresas e on e.id = cb.empresa_id
  where cb.status_app = 'paga'
    and not cb.removida
    and cb.data_pagamento >= date_trunc('month', now() at time zone e.fuso_horario)::date
$$;
grant execute on function public.recebido_no_mes() to authenticated;

-- 5) Admin altera só as configurações da tela; slug (usado no login dos compradores),
--    ambiente do Asaas e fuso ficam com a Nexla.
revoke update on public.empresas from authenticated;
grant update (whatsapp_atendimento, dias_aviso, mostrar_cobrancas_avulsas, textos, logo_url,
  cor_primaria, cor_destaque, permitir_alterar_vencimento) on public.empresas to authenticated;

-- 6) Logo (bucket marca): só admin; operador segue com imoveis e documentos.
drop policy storage_equipe on storage.objects;
create policy storage_equipe on storage.objects for all to authenticated
  using (bucket_id in ('imoveis', 'documentos')
         and (storage.foldername(name))[1] = public.admin_empresa_id()::text)
  with check (bucket_id in ('imoveis', 'documentos')
              and (storage.foldername(name))[1] = public.admin_empresa_id()::text);
create policy storage_marca_admin on storage.objects for all to authenticated
  using (bucket_id = 'marca' and public.admin_papel() = 'admin'
         and (storage.foldername(name))[1] = public.admin_empresa_id()::text)
  with check (bucket_id = 'marca' and public.admin_papel() = 'admin'
              and (storage.foldername(name))[1] = public.admin_empresa_id()::text);

-- 7) Sair do app desativa o aparelho mesmo para comprador bloqueado ou com senha provisória.
create or replace function public.desativar_push_token(p_token text)
returns void language sql security definer set search_path = '' as $$
  update public.push_tokens t set ativo = false
  from public.compradores c
  where t.expo_token = p_token and t.comprador_id = c.id and c.auth_user_id = auth.uid();
$$;

-- 8) Tentativa de código contada de forma atômica (antes de comparar), para chamadas
--    em paralelo não passarem do limite de 5.
create or replace function public.codigo_registrar_tentativa(p_id uuid)
returns int language sql security definer set search_path = '' as $$
  update public.codigos_acesso set tentativas = tentativas + 1
  where id = p_id
  returning tentativas;
$$;
revoke execute on function public.codigo_registrar_tentativa(uuid) from public, anon, authenticated;
grant execute on function public.codigo_registrar_tentativa(uuid) to service_role;
