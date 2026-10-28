-- Acesso por senha provisória (gerada no painel e enviada pelo WhatsApp da imobiliária)
-- e importação em lote dos clientes do Asaas. Decisão de 2026-10-28 no CLAUDE.md.

alter table public.compradores
  add column deve_trocar_senha boolean not null default false,
  add column senha_provisoria_expira_em timestamptz;

-- imóvel criado automaticamente na importação, a partir da descrição do parcelamento
alter table public.imoveis add column revisar boolean not null default false;

-- Enquanto a senha provisória não for trocada, o comprador não vê nada além do próprio
-- cadastro: quem pegar a mensagem do convite não acessa dados só com ela.
create or replace function public.comprador_atual_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.compradores
  where auth_user_id = auth.uid() and status_acesso = 'ativo' and not deve_trocar_senha
$$;

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
         deve_trocar_senha = false,
         senha_provisoria_expira_em = null,
         excluido_em = now()
   where id = p_comprador_id;
end $$;
