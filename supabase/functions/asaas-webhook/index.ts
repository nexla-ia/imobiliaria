/**
 * Webhook de cobranças do Asaas.
 * Entrega "at least once": grava o evento pelo id antes de processar e ignora repetidos.
 * Responde 2xx sempre que o token confere, mesmo se o processamento falhar: o erro fica
 * em asaas_webhook_eventos e o sync diário corrige. Assim a fila do Asaas nunca é pausada
 * (15 falhas seguidas interrompem a fila). Eventos gravados e não processados (a função
 * caiu no meio) são reprocessados pelo asaas-sync do cron.
 */
import { iguaisSeguro, json } from '../_shared/http.ts';
import { admin } from '../_shared/supabase.ts';
import { type EventoAsaas, processarEvento } from '../_shared/webhook.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('método não permitido', { status: 405 });

  // aceita mais de um token separado por vírgula, para trocar o token no Asaas sem perder eventos
  const aceitos = (Deno.env.get('ASAAS_WEBHOOK_TOKEN') ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  const recebido = req.headers.get('asaas-access-token') ?? '';
  if (!aceitos.some((t) => iguaisSeguro(recebido, t))) return new Response('não autorizado', { status: 401 });

  let evento: EventoAsaas;
  try {
    evento = await req.json();
  } catch {
    return new Response('corpo inválido', { status: 400 });
  }
  if (!evento.event) return json({ ok: true, ignorado: 'sem evento' });

  const db = admin();
  const recebidoEm = new Date().toISOString();
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

  await processarEvento(db, registro.id, evento, recebidoEm);
  return json({ ok: true });
});
