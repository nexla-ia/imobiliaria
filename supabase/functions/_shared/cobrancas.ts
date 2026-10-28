/**
 * Grava cobranças vindas do Asaas no cache local (public.cobrancas).
 * Usado pelo webhook, pelo sync diário e pelo botão "Sincronizar" do painel.
 * Nunca calcula valores: só copia o que o Asaas informa.
 */
import { type AsaasPayment, type ClienteAsaas, cobrancaParaLinha } from './asaas.ts';
import { formatarMoeda } from './http.ts';
import { notificar, type NovaNotificacao } from './push.ts';
import type { Admin } from './supabase.ts';

export interface Vinculo {
  empresa_id: string;
  comprador_id: string;
  contrato_id: string | null;
}

interface ItemGravacao {
  payment: AsaasPayment;
  vinculo: Vinculo;
  removida?: boolean;
}

interface LinhaExistente {
  id: string;
  asaas_payment_id: string;
  empresa_id: string;
  comprador_id: string;
  contrato_id: string | null;
  status_app: string;
  numero_parcela: number | null;
}

/** "Parcela 3 de 60." → 3 (descrição automática do Asaas em parcelamentos). */
export function numeroDaDescricao(descricao: string | null | undefined): number | null {
  const m = descricao?.match(/parcela\s+(\d+)\s+de\s+\d+/i);
  return m ? Number(m[1]) : null;
}

async function buscarExistentes(db: Admin, paymentIds: string[]): Promise<Map<string, LinhaExistente>> {
  const mapa = new Map<string, LinhaExistente>();
  for (let i = 0; i < paymentIds.length; i += 200) {
    const { data, error } = await db
      .from('cobrancas')
      .select('id, asaas_payment_id, empresa_id, comprador_id, contrato_id, status_app, numero_parcela')
      .in('asaas_payment_id', paymentIds.slice(i, i + 200));
    if (error) throw error;
    for (const l of data ?? []) mapa.set(l.asaas_payment_id, l as LinhaExistente);
  }
  return mapa;
}

/**
 * Grava (insere ou atualiza) as cobranças e dispara a notificação de pagamento
 * para as que passaram a "paga". Linhas novas já pagas só notificam quando
 * notificarNovasPagas = true (webhook); na importação inicial, não.
 */
export async function gravarCobrancas(
  db: Admin,
  itens: ItemGravacao[],
  opcoes: { notificarNovasPagas?: boolean } = {},
): Promise<{ gravadas: number; pagasAgora: number }> {
  if (itens.length === 0) return { gravadas: 0, pagasAgora: 0 };
  const existentes = await buscarExistentes(db, itens.map((i) => i.payment.id));

  const linhas = itens.map(({ payment, vinculo, removida }) => {
    const atual = existentes.get(payment.id);
    const base = cobrancaParaLinha(payment);
    return {
      ...base,
      // o vínculo já gravado vale mais que o deduzido agora (pode ter sido feito à mão no painel)
      empresa_id: atual?.empresa_id ?? vinculo.empresa_id,
      comprador_id: atual?.comprador_id ?? vinculo.comprador_id,
      contrato_id: atual ? atual.contrato_id : vinculo.contrato_id,
      numero_parcela: base.numero_parcela ?? numeroDaDescricao(payment.description) ?? atual?.numero_parcela ?? null,
      removida: removida ?? base.removida,
    };
  });

  const { data: gravadas, error } = await db
    .from('cobrancas')
    .upsert(linhas, { onConflict: 'asaas_payment_id' })
    .select('id, asaas_payment_id, empresa_id, comprador_id, contrato_id, status_app, numero_parcela, valor, valor_original, descricao, removida');
  if (error) throw error;

  // parcelas sem número: numera pela ordem de vencimento
  const contratosSemNumero = new Set(
    (gravadas ?? []).filter((g) => g.contrato_id && g.numero_parcela == null).map((g) => g.contrato_id as string),
  );
  for (const contratoId of contratosSemNumero) {
    const { error: e } = await db.rpc('renumerar_parcelas', { p_contrato_id: contratoId });
    if (e) throw e;
  }

  const contratosTocados = [...new Set((gravadas ?? []).map((g) => g.contrato_id).filter(Boolean) as string[])];
  await atualizarStatusContratos(db, contratosTocados);

  // notificação de pagamento recebido
  const pagas = (gravadas ?? []).filter((g) => {
    if (g.status_app !== 'paga' || g.removida) return false;
    const antes = existentes.get(g.asaas_payment_id);
    return antes ? antes.status_app !== 'paga' : !!opcoes.notificarNovasPagas;
  });
  if (pagas.length) {
    const totais = await totalDeParcelas(db, pagas.map((p) => p.contrato_id).filter(Boolean) as string[]);
    const numeros = await numerosAtuais(db, pagas.map((p) => p.id));
    const notificacoes: NovaNotificacao[] = pagas.map((p) => {
      const valor = formatarMoeda(Number(p.valor_original ?? p.valor));
      const numero = numeros.get(p.id);
      const total = p.contrato_id ? totais.get(p.contrato_id) : null;
      const oQue = p.contrato_id && numero
        ? `da parcela ${numero}${total ? ` de ${total}` : ''}`
        : `de ${p.descricao || 'sua cobrança'}`;
      return {
        empresa_id: p.empresa_id,
        comprador_id: p.comprador_id,
        tipo: 'pagamento',
        titulo: 'Pagamento recebido',
        corpo: `Recebemos o pagamento ${oQue} (${valor}). Obrigado!`,
        payload: { cobranca_id: p.id, tela: 'parcela' },
        chave_dedup: `pagamento:${p.asaas_payment_id}`,
      };
    });
    await notificar(db, notificacoes);
  }

  return { gravadas: gravadas?.length ?? 0, pagasAgora: pagas.length };
}

async function totalDeParcelas(db: Admin, contratoIds: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (!contratoIds.length) return mapa;
  const { data } = await db.from('vw_resumo_contrato').select('contrato_id, total_parcelas').in('contrato_id', [...new Set(contratoIds)]);
  for (const r of data ?? []) mapa.set(r.contrato_id, r.total_parcelas);
  return mapa;
}

async function numerosAtuais(db: Admin, cobrancaIds: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  const { data } = await db.from('cobrancas').select('id, numero_parcela').in('id', cobrancaIds);
  for (const r of data ?? []) if (r.numero_parcela) mapa.set(r.id, r.numero_parcela);
  return mapa;
}

/** ativo ↔ quitado conforme as parcelas. Contrato cancelado não muda. */
export async function atualizarStatusContratos(db: Admin, contratoIds: string[]) {
  if (!contratoIds.length) return;
  const { data, error } = await db
    .from('vw_resumo_contrato')
    .select('contrato_id, total_parcelas, parcelas_pagas, saldo_em_aberto')
    .in('contrato_id', contratoIds);
  if (error) throw error;
  for (const r of data ?? []) {
    const quitado = r.total_parcelas > 0 && r.parcelas_pagas >= r.total_parcelas && Number(r.saldo_em_aberto) === 0;
    await db
      .from('contratos')
      .update({ status: quitado ? 'quitado' : 'ativo' })
      .eq('id', r.contrato_id)
      .neq('status', 'cancelado')
      .neq('status', quitado ? 'quitado' : 'ativo');
  }
}

export interface CompradorSync {
  id: string;
  empresa_id: string;
  asaas_customer_id: string | null;
}

/**
 * Ressincroniza tudo de um comprador com uma única listagem no Asaas:
 * cobranças de parcelamentos vinculados vão para o contrato; as sem parcelamento
 * ficam como avulsas (ou no contrato a que foram ligadas no painel).
 * Cobranças de parcelamentos que não estão vinculados a nenhum contrato são ignoradas.
 */
export async function sincronizarComprador(db: Admin, asaas: ClienteAsaas, comprador: CompradorSync) {
  if (!comprador.asaas_customer_id) return { cobrancas: 0, contratos: 0 };

  const [pagamentos, contratosRes, existentesRes] = await Promise.all([
    asaas.listarCobrancasDoCliente(comprador.asaas_customer_id),
    db.from('contratos').select('id, asaas_installment_id').eq('comprador_id', comprador.id).neq('status', 'cancelado'),
    db.from('cobrancas').select('asaas_payment_id, contrato_id, removida').eq('comprador_id', comprador.id),
  ]);
  if (contratosRes.error) throw contratosRes.error;
  if (existentesRes.error) throw existentesRes.error;

  const porParcelamento = new Map<string, string>();
  for (const c of contratosRes.data ?? []) if (c.asaas_installment_id) porParcelamento.set(c.asaas_installment_id, c.id);
  const existentes = new Map((existentesRes.data ?? []).map((e) => [e.asaas_payment_id, e]));

  const itens: ItemGravacao[] = [];
  const vistos = new Set<string>();
  for (const p of pagamentos) {
    let contratoId: string | null;
    if (p.installment) {
      const c = porParcelamento.get(p.installment);
      if (!c) continue;
      contratoId = c;
    } else {
      contratoId = existentes.get(p.id)?.contrato_id ?? null;
    }
    vistos.add(p.id);
    itens.push({ payment: p, vinculo: { empresa_id: comprador.empresa_id, comprador_id: comprador.id, contrato_id: contratoId } });
  }

  // o que estava no cache e sumiu da listagem foi removido no Asaas
  const sumiram = [...existentes.values()].filter((e) => !e.removida && !vistos.has(e.asaas_payment_id)).map((e) => e.asaas_payment_id);
  if (sumiram.length) {
    await db.from('cobrancas').update({ removida: true, atualizado_asaas_em: new Date().toISOString() }).in('asaas_payment_id', sumiram);
  }

  const r = await gravarCobrancas(db, itens);
  const agora = new Date().toISOString();
  await db.from('compradores').update({ ultima_sync_em: agora }).eq('id', comprador.id);
  await db.from('contratos').update({ ultima_sync_em: agora }).eq('comprador_id', comprador.id);
  if (sumiram.length) await atualizarStatusContratos(db, (contratosRes.data ?? []).map((c) => c.id));
  return { cobrancas: r.gravadas, contratos: contratosRes.data?.length ?? 0 };
}

/** Descobre a quem pertence uma cobrança que chegou pelo webhook. */
export async function vinculoDoPagamento(db: Admin, p: AsaasPayment): Promise<Vinculo | null> {
  const { data: existente } = await db
    .from('cobrancas')
    .select('empresa_id, comprador_id, contrato_id')
    .eq('asaas_payment_id', p.id)
    .maybeSingle();
  if (existente) return existente as Vinculo;

  if (p.installment) {
    const { data: contrato } = await db
      .from('contratos')
      .select('id, empresa_id, comprador_id')
      .eq('asaas_installment_id', p.installment)
      .neq('status', 'cancelado')
      .maybeSingle();
    return contrato ? { empresa_id: contrato.empresa_id, comprador_id: contrato.comprador_id, contrato_id: contrato.id } : null;
  }

  const { data: comprador } = await db
    .from('compradores')
    .select('id, empresa_id')
    .eq('asaas_customer_id', p.customer)
    .limit(1)
    .maybeSingle();
  return comprador ? { empresa_id: comprador.empresa_id, comprador_id: comprador.id, contrato_id: null } : null;
}
