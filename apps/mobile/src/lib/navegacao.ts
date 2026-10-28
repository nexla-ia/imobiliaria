import type { Notificacao } from '@planejar/shared';
import { router } from 'expo-router';

/** Abre a tela certa ao tocar numa notificação (push ou central do app). */
export function abrirDestino(payload: Notificacao['payload'] | undefined) {
  if (!payload) return;
  if ((payload.tela === 'pagar' || payload.tela === 'parcela') && payload.cobranca_id) {
    router.push({ pathname: '/cobranca/[id]', params: { id: payload.cobranca_id } });
  } else if (payload.tela === 'notificacoes') {
    router.navigate('/notificacoes');
  }
}
