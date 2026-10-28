-- Apoio ao app do comprador: registro do aparelho para push e atualização em tempo real.

-- O mesmo celular pode ter sido usado antes por outro comprador (troca de conta).
-- A RLS de push_tokens não deixa "tomar" a linha de outra pessoa, então o registro
-- passa por esta função, que sempre grava para o comprador logado.
create or replace function public.registrar_push_token(p_token text, p_plataforma text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_comprador uuid := public.comprador_atual_id();
  v_empresa uuid := public.comprador_empresa_id();
begin
  if v_comprador is null then
    raise exception 'comprador não autenticado' using errcode = '42501';
  end if;
  if p_token !~ '^Expo(nent)?PushToken\[.+\]$' then
    raise exception 'token inválido' using errcode = '22023';
  end if;
  insert into public.push_tokens (empresa_id, comprador_id, expo_token, plataforma, ativo)
  values (v_empresa, v_comprador, p_token, nullif(p_plataforma, ''), true)
  on conflict (expo_token) do update
    set empresa_id = excluded.empresa_id,
        comprador_id = excluded.comprador_id,
        plataforma = excluded.plataforma,
        ativo = true;
end $$;

-- Ao sair do app, o aparelho para de receber push daquela conta.
create or replace function public.desativar_push_token(p_token text)
returns void language sql security definer set search_path = '' as $$
  update public.push_tokens set ativo = false
  where expo_token = p_token and comprador_id = public.comprador_atual_id();
$$;

revoke execute on function public.registrar_push_token(text, text), public.desativar_push_token(text) from public, anon;
grant execute on function public.registrar_push_token(text, text), public.desativar_push_token(text) to authenticated;

-- Tempo real: o app escuta mudanças nas próprias cobranças e notificações (a RLS vale aqui também).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.cobrancas, public.notificacoes;
  end if;
end $$;
