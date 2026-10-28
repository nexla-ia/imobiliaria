-- Dados de desenvolvimento local (supabase db reset). Não roda em produção.

insert into public.empresas (id, slug, nome, creci, cor_primaria, cor_destaque, whatsapp_atendimento, dias_aviso, fuso_horario)
values (
  '00000000-0000-4000-8000-000000000001',
  'planejar',
  'Planejar Assessoria',
  'CRECI 4.447 MT',
  '#000D38',
  '#0AC1FA',
  '5565999373761',
  '{3,0}',
  'America/Cuiaba'
)
on conflict (id) do nothing;
