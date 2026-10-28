/** Processamento de um evento de cobrança do Asaas (usado pelo webhook e pelo reprocessamento do cron). */
import type { AsaasPayment } from './asaas.ts';
import { gravarCobrancas, vinculoDoPagamento } from './cobrancas.ts';
import type { Admin } from './supabase.ts';

export interface EventoAsaas {
  id?: string;
  event?: string;
  dateCreated?: string;
  payment?: AsaasPayment;
}

const EVENTOS_DE_PAGAMENTO_RECEBIDO = new Set(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED']);

/** Aplica o evento no cache e marca o registro em asaas_webhook_eventos como processado. */
export async function processarEvento(db: Admin, registroId: string, evento: EventoAsaas, recebidoEm: string) {
  let erro: string | null = null;
  let empresaId: string | null = null;
  try {
    const p = evento.payment;
    if (evento.event?.startsWith('PAYMENT_') && p?.id) {
      const destino = await vinculoDoPagamento(db, p);
      if (!destino) {
        erro = 'sem_vinculo: cobrança de cliente/parcelamento não vinculado a um contrato ativo';
      } else {
        empresaId = destino.vinculo.empresa_id;
        const removida = evento.event === 'PAYMENT_DELETED' ? true : evento.event === 'PAYMENT_RESTORED' ? false : undefined;
        await gravarCobrancas(db, [{ payment: p, vinculo: destino.vinculo, vinculoDoContrato: destino.doContrato, removida }], {
          notificarNovasPagas: EVENTOS_DE_PAGAMENTO_RECEBIDO.has(evento.event),
          // um evento mais antigo (reentrega atrasada) não sobrescreve uma atualização mais nova
          lidoEm: recebidoEm,
        });
      }
    }
  } catch (e) {
    console.error('falha ao processar evento', evento.id, e);
    erro = e instanceof Error ? e.message : String(e);
  }
  await db
    .from('asaas_webhook_eventos')
    .update({ processado_em: new Date().toISOString(), erro, empresa_id: empresaId })
    .eq('id', registroId);
  return { erro };
}
