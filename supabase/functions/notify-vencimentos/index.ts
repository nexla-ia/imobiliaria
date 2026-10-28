/**
 * Cron diário (08:00 no fuso da empresa): avisa as parcelas que vencem daqui a N dias,
 * conforme empresas.dias_aviso (padrão 3 dias antes e no dia). Rodar de novo no mesmo dia
 * não duplica nada (chave_dedup).
 */
import { dataNoFuso, ErroHttp, formatarData, formatarMoeda, json, servir } from '../_shared/http.ts';
import { notificar, type NovaNotificacao } from '../_shared/push.ts';
import { admin, chamadaDoCron } from '../_shared/supabase.ts';

servir(async (req) => {
  if (!chamadaDoCron(req)) throw new ErroHttp(401, 'nao_autenticado', 'Somente o agendador pode chamar esta função.');
  const db = admin();

  const { data: empresas, error } = await db.from('empresas').select('id, dias_aviso, fuso_horario, mostrar_cobrancas_avulsas');
  if (error) throw error;

  let total = 0;
  let pushes = 0;
  for (const empresa of empresas ?? []) {
    for (const dias of empresa.dias_aviso as number[]) {
      const alvo = dataNoFuso(empresa.fuso_horario, dias);
      let consulta = db
        .from('cobrancas')
        .select('id, asaas_payment_id, comprador_id, contrato_id, numero_parcela, valor, descricao, vencimento, compradores!inner(status_acesso, deve_trocar_senha), contratos(status)')
        .eq('empresa_id', empresa.id)
        .eq('status_app', 'em_aberto')
        .eq('removida', false)
        .eq('vencimento', alvo)
        .eq('compradores.status_acesso', 'ativo')
        .eq('compradores.deve_trocar_senha', false);
      if (!empresa.mostrar_cobrancas_avulsas) consulta = consulta.not('contrato_id', 'is', null);
      const { data: todas, error: e } = await consulta;
      if (e) throw e;
      const cobrancas = (todas ?? []).filter((c) => (c.contratos as { status?: string } | null)?.status !== 'cancelado');
      if (!cobrancas?.length) continue;

      const totais = new Map<string, number>();
      const contratoIds = [...new Set(cobrancas.map((c) => c.contrato_id).filter(Boolean))] as string[];
      if (contratoIds.length) {
        const { data } = await db.from('vw_resumo_contrato').select('contrato_id, total_parcelas').in('contrato_id', contratoIds);
        for (const r of data ?? []) totais.set(r.contrato_id, r.total_parcelas);
      }

      const itens: NovaNotificacao[] = cobrancas.map((c) => {
        const qual = c.contrato_id && c.numero_parcela
          ? `Parcela ${c.numero_parcela}${totais.get(c.contrato_id) ? ` de ${totais.get(c.contrato_id)}` : ''}`
          : c.descricao || 'Sua cobrança';
        return {
          empresa_id: empresa.id,
          comprador_id: c.comprador_id,
          tipo: 'vencimento',
          titulo: dias === 0 ? 'Sua parcela vence hoje' : dias === 1 ? 'Sua parcela vence amanhã' : `Sua parcela vence em ${dias} dias`,
          corpo: `${qual} · ${formatarMoeda(Number(c.valor))} · vence em ${formatarData(c.vencimento)}. Toque para pagar com boleto ou Pix.`,
          payload: { cobranca_id: c.id, tela: 'pagar' },
          chave_dedup: `vencimento:${c.asaas_payment_id}:${c.vencimento}:${dias}`,
        };
      });
      const r = await notificar(db, itens);
      total += r.novas;
      pushes += r.pushes;
    }
  }
  return json({ notificacoes: total, pushes });
});
