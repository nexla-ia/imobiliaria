-- Schema inicial: App do Comprador (Planejar Assessoria) × Asaas
-- Multi-tenant desde o dia 1: toda tabela de negócio carrega empresa_id.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  nome text not null,
  creci text,
  logo_url text,
  cor_primaria text not null default '#000D38',
  cor_destaque text not null default '#0AC1FA',
  whatsapp_atendimento text,                         -- só dígitos, com DDI: 5565999373761
  dias_aviso int[] not null default '{3,0}',
  fuso_horario text not null default 'America/Cuiaba',
  asaas_ambiente text not null default 'sandbox' check (asaas_ambiente in ('sandbox', 'producao')),
  mostrar_cobrancas_avulsas boolean not null default false,
  permitir_alterar_vencimento boolean not null default false,
  textos jsonb not null default '{}'::jsonb,         -- mensagens padrão (WhatsApp, push etc.)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.usuarios_admin (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id),
  nome text not null,
  papel text not null default 'operador' check (papel in ('admin', 'operador')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.compradores (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  empresa_id uuid not null references public.empresas (id),
  nome text not null,
  cpf text not null check (cpf ~ '^[0-9]{11}$'),
  email text,
  telefone text,                                     -- só dígitos, com DDI
  asaas_customer_id text,
  status_acesso text not null default 'convidado' check (status_acesso in ('convidado', 'ativo', 'bloqueado')),
  termos_aceitos_em timestamptz,
  ativado_em timestamptz,
  excluido_em timestamptz,                           -- conta excluída pelo próprio comprador (dados anonimizados)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, cpf)
);
create index on public.compradores (empresa_id, asaas_customer_id);

create table public.empreendimentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  nome text not null,
  cidade text,
  uf char(2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.imoveis (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  empreendimento_id uuid references public.empreendimentos (id),
  identificacao text not null,                       -- "Lote 12 · Quadra B"
  endereco text,
  lat double precision,
  lng double precision,
  metragem_m2 numeric(10, 2),
  descricao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.imoveis (empresa_id, empreendimento_id);

create table public.imovel_fotos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  imovel_id uuid not null references public.imoveis (id) on delete cascade,
  storage_path text not null,                        -- bucket imoveis: {empresa_id}/{imovel_id}/{arquivo}
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.imovel_fotos (imovel_id, ordem);

create table public.contratos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  comprador_id uuid not null references public.compradores (id),
  imovel_id uuid not null references public.imoveis (id),
  asaas_installment_id text,
  numero_parcelas int,
  data_inicio date,
  status text not null default 'ativo' check (status in ('ativo', 'quitado', 'cancelado')),
  ultima_sync_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.contratos (comprador_id);
create index on public.contratos (empresa_id, status);
create unique index on public.contratos (empresa_id, asaas_installment_id) where asaas_installment_id is not null;

create table public.cobrancas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  comprador_id uuid not null references public.compradores (id),
  contrato_id uuid references public.contratos (id),  -- null = cobrança avulsa (fora do parcelamento)
  asaas_payment_id text not null unique,
  numero_parcela int,
  descricao text,
  vencimento date not null,
  vencimento_original date,
  valor numeric(12, 2) not null,                     -- "value" do Asaas
  valor_original numeric(12, 2),                     -- "originalValue" (quando pago com juros/multa/desconto)
  valor_liquido numeric(12, 2),                      -- "netValue"
  valor_juros numeric(12, 2),                        -- "interestValue"
  status_asaas text not null,
  status_app text generated always as (
    case
      when status_asaas = 'PENDING' then 'em_aberto'
      when status_asaas = 'OVERDUE' then 'vencida'
      when status_asaas in ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH') then 'paga'
      when status_asaas in ('REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS')
        or status_asaas like 'CHARGEBACK%' then 'estornada'
      else 'oculta'
    end
  ) stored,
  removida boolean not null default false,           -- DELETED no Asaas
  data_pagamento date,
  billing_type text,
  invoice_url text,
  bank_slip_url text,
  comprovante_url text,                              -- "transactionReceiptUrl"
  atualizado_asaas_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.cobrancas (comprador_id, vencimento);
create index on public.cobrancas (contrato_id, numero_parcela);
create index on public.cobrancas (empresa_id, status_app, vencimento);

create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  comprador_id uuid not null references public.compradores (id),
  contrato_id uuid references public.contratos (id),
  titulo text not null,
  storage_path text not null,                        -- bucket documentos: {empresa_id}/{comprador_id}/{arquivo}
  tipo text not null default 'outro' check (tipo in ('contrato', 'aditivo', 'escritura', 'outro')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.documentos (comprador_id);

create table public.comunicados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  titulo text not null,
  corpo text not null,
  alvo text not null check (alvo in ('todos', 'empreendimento', 'comprador')),
  alvo_id uuid,
  criado_por uuid references auth.users (id),
  enviado_em timestamptz,
  total_destinatarios int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((alvo = 'todos') = (alvo_id is null))
);

create table public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  comprador_id uuid not null references public.compradores (id) on delete cascade,
  tipo text not null check (tipo in ('vencimento', 'pagamento', 'comunicado')),
  titulo text not null,
  corpo text not null,
  lida_em timestamptz,
  payload jsonb not null default '{}'::jsonb,
  -- evita aviso de vencimento duplicado quando o cron roda de novo no mesmo dia
  chave_dedup text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.notificacoes (comprador_id, created_at desc);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  comprador_id uuid not null references public.compradores (id) on delete cascade,
  expo_token text not null unique,
  plataforma text check (plataforma in ('ios', 'android')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.codigos_acesso (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  comprador_id uuid not null references public.compradores (id) on delete cascade,
  codigo_hash text not null,
  canal text not null check (canal in ('whatsapp', 'email')),
  expira_em timestamptz not null,
  tentativas int not null default 0,
  usado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.codigos_acesso (comprador_id, created_at desc);

create table public.rate_limits (
  chave text not null,                               -- ex.: "codigo:cpf:12345678900", "codigo:ip:1.2.3.4"
  janela_inicio timestamptz not null,
  contador int not null default 0,
  primary key (chave, janela_inicio)
);

create table public.asaas_webhook_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas (id),
  asaas_event_id text not null unique,
  evento text not null,
  payload jsonb not null,
  processado_em timestamptz,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas (id),
  ator_id uuid,
  acao text not null,
  entidade text not null,
  entidade_id uuid,
  dados jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.audit_log (empresa_id, created_at desc);

-- updated_at automático
do $$
declare t text;
begin
  foreach t in array array[
    'empresas', 'usuarios_admin', 'compradores', 'empreendimentos', 'imoveis', 'imovel_fotos',
    'contratos', 'cobrancas', 'documentos', 'comunicados', 'notificacoes', 'push_tokens',
    'codigos_acesso', 'asaas_webhook_eventos', 'audit_log'
  ] loop
    execute format('create trigger trg_%1$s_updated_at before update on public.%1$I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Funções de identidade usadas nas políticas (security definer evita recursão de RLS)
-- ---------------------------------------------------------------------------

create or replace function public.admin_empresa_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select empresa_id from public.usuarios_admin where auth_user_id = auth.uid()
$$;

create or replace function public.admin_papel()
returns text language sql stable security definer set search_path = '' as $$
  select papel from public.usuarios_admin where auth_user_id = auth.uid()
$$;

create or replace function public.comprador_atual_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.compradores
  where auth_user_id = auth.uid() and status_acesso = 'ativo'
$$;

create or replace function public.comprador_empresa_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select empresa_id from public.compradores
  where auth_user_id = auth.uid() and status_acesso = 'ativo'
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.empresas enable row level security;
alter table public.usuarios_admin enable row level security;
alter table public.compradores enable row level security;
alter table public.empreendimentos enable row level security;
alter table public.imoveis enable row level security;
alter table public.imovel_fotos enable row level security;
alter table public.contratos enable row level security;
alter table public.cobrancas enable row level security;
alter table public.documentos enable row level security;
alter table public.comunicados enable row level security;
alter table public.notificacoes enable row level security;
alter table public.push_tokens enable row level security;
alter table public.codigos_acesso enable row level security;     -- sem políticas: só service_role
alter table public.rate_limits enable row level security;        -- sem políticas: só service_role
alter table public.asaas_webhook_eventos enable row level security; -- sem políticas: só service_role
alter table public.audit_log enable row level security;

-- Anônimo não lê nada direto do banco; o que é público passa por Edge Function.
revoke all on all tables in schema public from anon;

-- empresas
create policy empresas_select on public.empresas for select to authenticated
  using (id = public.admin_empresa_id() or id = public.comprador_empresa_id());
create policy empresas_update on public.empresas for update to authenticated
  using (id = public.admin_empresa_id() and public.admin_papel() = 'admin')
  with check (id = public.admin_empresa_id());

-- usuarios_admin (só admin gerencia a equipe)
create policy usuarios_admin_select on public.usuarios_admin for select to authenticated
  using (empresa_id = public.admin_empresa_id());
create policy usuarios_admin_write on public.usuarios_admin for all to authenticated
  using (empresa_id = public.admin_empresa_id() and public.admin_papel() = 'admin')
  with check (empresa_id = public.admin_empresa_id() and public.admin_papel() = 'admin');

-- Tabelas de cadastro: equipe lê e escreve dentro da empresa
do $$
declare t text;
begin
  foreach t in array array['compradores', 'empreendimentos', 'imoveis', 'imovel_fotos', 'contratos', 'documentos'] loop
    execute format('create policy %1$s_equipe on public.%1$I for all to authenticated
                    using (empresa_id = public.admin_empresa_id())
                    with check (empresa_id = public.admin_empresa_id())', t);
  end loop;
end $$;

-- Comprador: só o que é dele
create policy compradores_self on public.compradores for select to authenticated
  using (auth_user_id = auth.uid());

create policy contratos_comprador on public.contratos for select to authenticated
  using (comprador_id = public.comprador_atual_id() and status <> 'cancelado');

create policy imoveis_comprador on public.imoveis for select to authenticated
  using (exists (
    select 1 from public.contratos c
    where c.imovel_id = imoveis.id and c.comprador_id = public.comprador_atual_id() and c.status <> 'cancelado'
  ));

create policy imovel_fotos_comprador on public.imovel_fotos for select to authenticated
  using (exists (
    select 1 from public.contratos c
    where c.imovel_id = imovel_fotos.imovel_id and c.comprador_id = public.comprador_atual_id() and c.status <> 'cancelado'
  ));

create policy empreendimentos_comprador on public.empreendimentos for select to authenticated
  using (exists (
    select 1 from public.contratos c join public.imoveis i on i.id = c.imovel_id
    where i.empreendimento_id = empreendimentos.id and c.comprador_id = public.comprador_atual_id()
  ));

create policy documentos_comprador on public.documentos for select to authenticated
  using (comprador_id = public.comprador_atual_id());

-- cobrancas: escrita só via service_role (webhook/sync); equipe e comprador só leem
create policy cobrancas_equipe on public.cobrancas for select to authenticated
  using (empresa_id = public.admin_empresa_id());
create policy cobrancas_comprador on public.cobrancas for select to authenticated
  using (
    comprador_id = public.comprador_atual_id()
    and not removida
    and status_app <> 'oculta'
    and (
      contrato_id is not null
      or exists (select 1 from public.empresas e where e.id = cobrancas.empresa_id and e.mostrar_cobrancas_avulsas)
    )
  );
revoke insert, update, delete on public.cobrancas from authenticated;

-- comunicados: equipe cria e lê; envio de fato é pela Edge Function notify-comunicado
create policy comunicados_equipe on public.comunicados for all to authenticated
  using (empresa_id = public.admin_empresa_id())
  with check (empresa_id = public.admin_empresa_id());

-- notificacoes: comprador lê as próprias e só marca como lida
create policy notificacoes_comprador_select on public.notificacoes for select to authenticated
  using (comprador_id = public.comprador_atual_id());
create policy notificacoes_comprador_update on public.notificacoes for update to authenticated
  using (comprador_id = public.comprador_atual_id())
  with check (comprador_id = public.comprador_atual_id());
create policy notificacoes_equipe on public.notificacoes for select to authenticated
  using (empresa_id = public.admin_empresa_id());
revoke insert, update, delete on public.notificacoes from authenticated;
grant update (lida_em) on public.notificacoes to authenticated;

-- push_tokens: comprador registra/desativa os próprios
create policy push_tokens_comprador on public.push_tokens for all to authenticated
  using (comprador_id = public.comprador_atual_id())
  with check (comprador_id = public.comprador_atual_id() and empresa_id = public.comprador_empresa_id());

-- audit_log: equipe lê; gravação pelos gatilhos abaixo e pelas Edge Functions
create policy audit_log_equipe on public.audit_log for select to authenticated
  using (empresa_id = public.admin_empresa_id());
revoke insert, update, delete on public.audit_log from authenticated;

-- Tabelas internas: nem leitura para usuários logados
revoke all on public.codigos_acesso, public.rate_limits, public.asaas_webhook_eventos from authenticated;

-- ---------------------------------------------------------------------------
-- Auditoria automática das ações do painel
-- ---------------------------------------------------------------------------

create or replace function public.registrar_auditoria()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  linha jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  -- só registra ações de pessoas da equipe; escritas de service_role (sync/webhook) ficam de fora
  if public.admin_empresa_id() is null then
    return null;
  end if;
  insert into public.audit_log (empresa_id, ator_id, acao, entidade, entidade_id, dados)
  values (
    coalesce(linha ->> 'empresa_id', case when tg_table_name = 'empresas' then linha ->> 'id' end)::uuid,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    (linha ->> 'id')::uuid,
    case when tg_op = 'UPDATE' then jsonb_build_object('antes', to_jsonb(old), 'depois', to_jsonb(new)) else linha end
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['compradores', 'contratos', 'comunicados', 'documentos', 'usuarios_admin', 'empresas'] loop
    execute format('create trigger trg_%1$s_audit after insert or update or delete on public.%1$I
                    for each row execute function public.registrar_auditoria()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Visão de resumo usada na tela Início e em Minhas parcelas (respeita a RLS de quem consulta)
-- ---------------------------------------------------------------------------

create or replace view public.vw_resumo_contrato with (security_invoker = true) as
select
  c.id as contrato_id,
  c.empresa_id,
  c.comprador_id,
  c.imovel_id,
  coalesce(c.numero_parcelas, count(cb.id) filter (where cb.contrato_id is not null))::int as total_parcelas,
  count(cb.id) filter (where cb.status_app = 'paga')::int as parcelas_pagas,
  count(cb.id) filter (where cb.status_app = 'vencida')::int as parcelas_vencidas,
  coalesce(sum(coalesce(cb.valor_original, cb.valor)) filter (where cb.status_app = 'paga'), 0) as total_pago,
  coalesce(sum(cb.valor) filter (where cb.status_app in ('em_aberto', 'vencida')), 0) as saldo_em_aberto,
  (select cb2.id from public.cobrancas cb2
    where cb2.contrato_id = c.id and cb2.status_app in ('em_aberto', 'vencida') and not cb2.removida
    order by cb2.vencimento limit 1) as proxima_cobranca_id
from public.contratos c
left join public.cobrancas cb on cb.contrato_id = c.id and not cb.removida
group by c.id;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values
  ('imoveis', 'imoveis', false),
  ('documentos', 'documentos', false),
  ('marca', 'marca', true)
on conflict (id) do nothing;

-- equipe: tudo dentro da pasta da própria empresa
create policy storage_equipe on storage.objects for all to authenticated
  using (bucket_id in ('imoveis', 'documentos', 'marca')
         and (storage.foldername(name))[1] = public.admin_empresa_id()::text)
  with check (bucket_id in ('imoveis', 'documentos', 'marca')
              and (storage.foldername(name))[1] = public.admin_empresa_id()::text);

-- comprador: documentos da própria pasta
create policy storage_documentos_comprador on storage.objects for select to authenticated
  using (bucket_id = 'documentos'
         and (storage.foldername(name))[1] = public.comprador_empresa_id()::text
         and (storage.foldername(name))[2] = public.comprador_atual_id()::text);

-- comprador: fotos dos imóveis vinculados a ele
create policy storage_imoveis_comprador on storage.objects for select to authenticated
  using (bucket_id = 'imoveis' and exists (
    select 1 from public.contratos c
    where c.comprador_id = public.comprador_atual_id()
      and c.imovel_id::text = (storage.foldername(name))[2]
  ));
