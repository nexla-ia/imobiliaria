/** Status de cobrança no Asaas (GET /payments → status). */
export type StatusAsaas =
  | 'PENDING'
  | 'OVERDUE'
  | 'RECEIVED'
  | 'CONFIRMED'
  | 'RECEIVED_IN_CASH'
  | 'REFUNDED'
  | 'REFUND_REQUESTED'
  | 'REFUND_IN_PROGRESS'
  | 'CHARGEBACK_REQUESTED'
  | 'CHARGEBACK_DISPUTE'
  | 'AWAITING_CHARGEBACK_REVERSAL'
  | 'DUNNING_REQUESTED'
  | 'DUNNING_RECEIVED'
  | 'AWAITING_RISK_ANALYSIS'
  | (string & {});

/** Status mostrado no app. Espelha a coluna gerada cobrancas.status_app. */
export type StatusApp = 'em_aberto' | 'vencida' | 'paga' | 'estornada' | 'oculta';

export function statusApp(status: StatusAsaas): StatusApp {
  if (status === 'PENDING') return 'em_aberto';
  if (status === 'OVERDUE') return 'vencida';
  if (status === 'RECEIVED' || status === 'CONFIRMED' || status === 'RECEIVED_IN_CASH') return 'paga';
  if (status === 'REFUNDED' || status === 'REFUND_REQUESTED' || status === 'REFUND_IN_PROGRESS' || status.startsWith('CHARGEBACK')) {
    return 'estornada';
  }
  return 'oculta';
}

export const rotuloStatus: Record<StatusApp, string> = {
  em_aberto: 'Em aberto',
  vencida: 'Vencida',
  paga: 'Paga',
  estornada: 'Estornada',
  oculta: '',
};

/** Parcelas em que o comprador pode pedir boleto/Pix. */
export function podePagar(status: StatusApp): boolean {
  return status === 'em_aberto' || status === 'vencida';
}
