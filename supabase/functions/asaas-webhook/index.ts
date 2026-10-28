/**
 * Webhook de cobranças do Asaas.
 * Entrega "at least once": grava o evento pelo id antes de processar e ignora repetidos.
 * Responde 2xx sempre que o token confere, mesmo se o processamento falhar: o erro fica
 * em asaas_webhook_eventos e o sync diário corrige. Assim a fila do Asaas nunca é pausada
 * (15 falhas seguidas interrompem a fila).
 */
import type { AsaasPayment } from '../_shared/asaas.ts';
import { gravarCobrancas, vinculoDoPagamento } from '../_shared/cobrancas.ts';
import { iguaisSeguro, json } from '../_shared/http.ts';
import { admin } from '../_shared/supabase.ts';

interface EventoAsaas {
  id?: string;
  event?: string;
  dateCreated?: string;
  payment?: AsaasPayment;
}

const EVENTOS_DE_PAGAMENTO_RECEBIDO = new Set(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED']);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('método não permitido', { status: 405 });

  const esperado = Deno.env.get('ASAAS_WEBHOOK_TOKEN');
  const recebido = req.headers.get('asaas-access-token') ?? '';
  if (!esperado || !iguaisSeguro(recebido, esperado)) return new Response('não autorizado', { status: 401 });

  let evento: EventoAsaas;
  try {
    evento = await req.json();
  } catch {
    return new Response('corpo inválido', { status: 400 });
  }
  if (!evento.event) return json({ ok: true, ignorado: 'sem evento' });

  const db = admin();
  const idEvento = evento.id ?? `${evento.event}:${evento.payment?.id}:${evento.dateCreated}`;
  const { data: registro, error: erroRegistro } = await db
    .from('asaas_webhook_eventos')
    .upsert({ asaas_event_id: idEvento, evento: evento.event, payload: evento }, { onConflict: 'asaas_event_id', ignoreDuplicates: true })
    .select('id')
    .maybeSingle();
  if (erroRegistro) {
    // sem conseguir registrar, melhor o Asaas tentar de novo
    console.error('falha ao registrar evento', erroRegistro);
    return new Response('erro ao registrar', { status: 500 });
  }
  if (!registro) return json({ ok: true, duplicado: true });

  let erro: string | null = null;
  let empresaId: string | null = null;
  try {
    const p = evento.payment;
    if (evento.event.startsWith('PAYMENT_') && p?.id) {
      const vinculo = await vinculoDoPagamento(db, p);
      if (!vinculo) {
        erro = 'sem_vinculo: cobrança de cliente/parcelamento não vinculado a nenhum comprador';
      } else {
        empresaId = vinculo.empresa_id;
        const removida = evento.event === 'PAYMENT_DELETED' ? true : evento.event === 'PAYMENT_RESTORED' ? false : undefined;
        await gravarCobrancas(db, [{ payment: p, vinculo, removida }], {
          notificarNovasPagas: EVENTOS_DE_PAGAMENTO_RECEBIDO.has(evento.event),
        });
      }
    }
  } catch (e) {
    console.error('falha ao processar evento', idEvento, e);
    erro = e instanceof Error ? e.message : String(e);
  }

  await db
    .from('asaas_webhook_eventos')
    .update({ processado_em: new Date().toISOString(), erro, empresa_id: empresaId })
    .eq('id', registro.id);

  return json({ ok: true });
});
