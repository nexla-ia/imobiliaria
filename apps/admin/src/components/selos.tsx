import { rotuloStatus, type StatusAcesso, type StatusApp, type StatusContrato } from '@planejar/shared';
import { Selo } from './ui';

export function SeloCobranca({ status, removida }: { status: StatusApp; removida?: boolean }) {
  if (removida) return <Selo>Removida no Asaas</Selo>;
  const tom = status === 'paga' ? 'ok' : status === 'vencida' ? 'erro' : status === 'estornada' ? 'alerta' : status === 'em_aberto' ? 'info' : 'neutro';
  return <Selo tom={tom}>{rotuloStatus[status] || 'Oculta'}</Selo>;
}

const rotulosAcesso: Record<StatusAcesso, string> = { convidado: 'Não ativou', ativo: 'App ativo', bloqueado: 'Bloqueado' };

/** `aguardando`: já tem senha provisória, mas ainda não entrou e criou a própria. */
export function SeloAcesso({ status, aguardando }: { status: StatusAcesso; aguardando?: boolean }) {
  if (status === 'ativo' && aguardando) return <Selo tom="alerta">Aguardando 1º acesso</Selo>;
  return <Selo tom={status === 'ativo' ? 'ok' : status === 'bloqueado' ? 'erro' : 'neutro'}>{rotulosAcesso[status]}</Selo>;
}

const rotulosContrato: Record<StatusContrato, string> = { ativo: 'Ativo', quitado: 'Quitado', cancelado: 'Cancelado' };

export function SeloContrato({ status }: { status: StatusContrato }) {
  return <Selo tom={status === 'quitado' ? 'ok' : status === 'cancelado' ? 'neutro' : 'info'}>{rotulosContrato[status]}</Selo>;
}
