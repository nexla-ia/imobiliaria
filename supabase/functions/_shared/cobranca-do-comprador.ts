import type { AsaasPayment } from './asaas.ts';
import { gravarCobrancas } from './cobrancas.ts';
import { ErroHttp } from './http.ts';
import type { Admin, CompradorAtual } from './supabase.ts';

export interface CobrancaDoComprador {
  id: string;
  asaas_payment_id: string;
  empresa_id: string;
  comprador_id: string;
  contrato_id: string | null;
  status_app: string;
}

/** Garante que a cobrança é do comprador logado e ainda pode ser paga. */
export async function cobrancaPagavel(db: Admin, comprador: CompradorAtual, cobrancaId: unknown): Promise<CobrancaDoComprador> {
  if (typeof cobrancaId !== 'string' || !/^[0-9a-f-]{36}$/i.test(cobrancaId)) {
    throw new ErroHttp(400, 'requisicao_invalida', 'Parcela inválida.');
  }
  const { data, error } = await db
    .from('cobrancas')
    .select('id, asaas_payment_id, empresa_id, comprador_id, contrato_id, status_app, removida')
    .eq('id', cobrancaId)
    .eq('comprador_id', comprador.id)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.removida) throw new ErroHttp(404, 'nao_encontrado', 'Parcela não encontrada.');
  if (data.status_app !== 'em_aberto' && data.status_app !== 'vencida') {
    throw new ErroHttp(409, 'requisicao_invalida', 'Esta parcela não está em aberto.');
  }
  return data as CobrancaDoComprador;
}

/** Atualiza o cache com a versão recém-buscada no Asaas (status pode ter mudado). */
export async function atualizarCache(db: Admin, cobranca: CobrancaDoComprador, p: AsaasPayment) {
  try {
    await gravarCobrancas(db, [{
      payment: p,
      vinculo: { empresa_id: cobranca.empresa_id, comprador_id: cobranca.comprador_id, contrato_id: cobranca.contrato_id },
    }]);
  } catch (e) {
    console.error('falha ao atualizar cache da cobrança', cobranca.id, e);
  }
}

/** Se o Asaas diz que já foi paga ou removida, avisa em vez de mostrar boleto/Pix. */
export function conferirAindaPagavel(p: AsaasPayment) {
  if (p.deleted) throw new ErroHttp(404, 'nao_encontrado', 'Esta cobrança foi cancelada pela imobiliária.');
  if (p.status !== 'PENDING' && p.status !== 'OVERDUE') {
    throw new ErroHttp(409, 'requisicao_invalida', 'Esta parcela já consta como paga. Puxe a tela para atualizar.');
  }
}
