/** Painel: envia um comunicado já salvo para todos, um empreendimento ou um comprador. */
import { ErroHttp, json, lerCorpo, servir } from '../_shared/http.ts';
import { notificar } from '../_shared/push.ts';
import { admin, exigirEquipe, registrarAuditoria } from '../_shared/supabase.ts';

servir(async (req) => {
  const equipe = await exigirEquipe(req);
  const { comunicado_id } = await lerCorpo<{ comunicado_id?: string }>(req);
  const db = admin();

  const { data: comunicado } = await db
    .from('comunicados')
    .select('id, empresa_id, titulo, corpo, alvo, alvo_id, enviado_em')
    .eq('id', comunicado_id ?? '')
    .eq('empresa_id', equipe.empresa_id)
    .maybeSingle();
  if (!comunicado) throw new ErroHttp(404, 'nao_encontrado', 'Comunicado não encontrado.');
  if (comunicado.enviado_em) throw new ErroHttp(409, 'requisicao_invalida', 'Este comunicado já foi enviado.');

  let compradorIds: string[] = [];
  if (comunicado.alvo === 'comprador') {
    compradorIds = [comunicado.alvo_id];
  } else {
    let consulta = db
      .from('contratos')
      .select('comprador_id, imoveis!inner(empreendimento_id)')
      .eq('empresa_id', equipe.empresa_id)
      .neq('status', 'cancelado');
    if (comunicado.alvo === 'empreendimento') consulta = consulta.eq('imoveis.empreendimento_id', comunicado.alvo_id);
    const { data, error } = await consulta;
    if (error) throw error;
    compradorIds = [...new Set((data ?? []).map((c) => c.comprador_id))];
  }

  // só quem já ativou o app recebe; a notificação fica na central dele
  const ativos: string[] = [];
  for (let i = 0; i < compradorIds.length; i += 500) {
    const { data } = await db
      .from('compradores')
      .select('id')
      .eq('empresa_id', equipe.empresa_id)
      .eq('status_acesso', 'ativo')
      .in('id', compradorIds.slice(i, i + 500));
    ativos.push(...(data ?? []).map((c) => c.id));
  }

  const r = await notificar(
    db,
    ativos.map((id) => ({
      empresa_id: equipe.empresa_id,
      comprador_id: id,
      tipo: 'comunicado' as const,
      titulo: comunicado.titulo,
      corpo: comunicado.corpo,
      payload: { comunicado_id: comunicado.id, tela: 'notificacoes' },
      chave_dedup: `comunicado:${comunicado.id}:${id}`,
    })),
  );

  await db
    .from('comunicados')
    .update({ enviado_em: new Date().toISOString(), total_destinatarios: ativos.length })
    .eq('id', comunicado.id);
  await registrarAuditoria(equipe.empresa_id, equipe.auth_user_id, 'enviar', 'comunicados', comunicado.id, {
    destinatarios: ativos.length,
    pushes: r.pushes,
  });

  return json({ destinatarios: ativos.length, pushes: r.pushes });
});
