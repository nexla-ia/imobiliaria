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

export interface ItemGravacao {
  payment: AsaasPayment;
  vinculo: Vinculo;
  /**
   * true quando o vínculo vem do contrato ativo do parcelamento: vale mais que o gravado
   * (o parcelamento pode ter sido religado a outro contrato depois de um cancelamento).
   * Para avulsas fica false: o vínculo feito à mão no painel é mantido.
   */
  vinculoDoContrato?: boolean;
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
  atualizado_asaas_em: string;
}

const LOTE = 150; // UUIDs por .in() sem estourar o tamanho da URL

/** "Parcela 3 de 60." → 3 (descrição automática do Asaas em parcelamentos). */
export function numeroDaDescricao(descricao: string | null | undefined): number | null {
  const m = descricao?.match(/parcela\s+(\d+)\s+de\s+\d+/i);
  return m ? Number(m[1]) : null;
}

function exigirOk<T extends { error: unknown }>(r: T): T {
  if (r.error) throw r.error;
  return r;
}

async function buscarExistentes(db: Admin, paymentIds: string[]): Promise<Map<string, LinhaExistente>> {
  const mapa = new Map<string, LinhaExistente>();
  for (let i = 0; i < paymentIds.length; i += LOTE) {
    const { data } = exigirOk(
      await db
        .from('cobrancas')
        .select('id, asaas_payment_id, empresa_id, comprador_id, contrato_id, status_app, numero_parcela, atualizado_asaas_em')
        .in('asaas_payment_id', paymentIds.slice(i, i + LOTE)),
    );
    for (const l of data ?? []) mapa.set(l.asaas_payment_id, l as LinhaExistente);
  }
  return mapa;
}

/**
 * Grava (insere ou atualiza) as cobranças e dispara a notificação de pagamento
 * para as que passaram a "paga". Linhas novas já pagas só notificam quando
 * notificarNovasPagas = true (webhook); na importação inicial, não.
 *
 * `lidoEm`: quando a informação foi lida do Asaas. Linhas atualizadas depois disso
 * (por um webhook mais novo) não são sobrescritas por esta leitura mais antiga.
 */
export async function gravarCobrancas(
  db: Admin,
  itensBrutos: ItemGravacao[],
  opcoes: { notificarNovasPagas?: boolean; lidoEm?: string } = {},
): Promise<{ gravadas: number; pagasAgora: number }> {
  // paginação por offset numa lista que muda pode repetir uma cobrança; o upsert não aceita repetidas
  const porId = new Map(itensBrutos.map((i) => [i.payment.id, i]));
  if (porId.size === 0) return { gravadas: 0, pagasAgora: 0 };
  const existentes = await buscarExistentes(db, [...porId.keys()]);

  const itens = [...porId.values()].filter((i) => {
    const atual = existentes.get(i.payment.id);
    return !(opcoes.lidoEm && atual && atual.atualizado_asaas_em > opcoes.lidoEm);
  });
  if (itens.length === 0) return { gravadas: 0, pagasAgora: 0 };

  const linhas = itens.map(({ payment, vinculo, vinculoDoContrato, removida }) => {
    const atual = existentes.get(payment.id);
    const base = cobrancaParaLinha(payment);
    const usarVinculo = !atual || vinculoDoContrato;
    return {
      ...base,
      empresa_id: usarVinculo ? vinculo.empresa_id : atual!.empresa_id,
      comprador_id: usarVinculo ? vinculo.comprador_id : atual!.comprador_id,
      contrato_id: usarVinculo ? vinculo.contrato_id : atual!.contrato_id,
      numero_parcela: base.numero_parcela ?? numeroDaDescricao(payment.description) ?? atual?.numero_parcela ?? null,
      removida: removida ?? base.removida,
    };
  });

  const { data: gravadas } = exigirOk(
    await db
      .from('cobrancas')
      .upsert(linhas, { onConflict: 'asaas_payment_id' })
      .select('id, asaas_payment_id, empresa_id, comprador_id, contrato_id, status_app, numero_parcela, valor, descricao, removida'),
  );

  // parcelas sem número: numera pela ordem de vencimento
  const contratosSemNumero = new Set(
    (gravadas ?? []).filter((g) => g.contrato_id && g.numero_parcela == null).map((g) => g.contrato_id as string),
  );
  for (const contratoId of contratosSemNumero) exigirOk(await db.rpc('renumerar_parcelas', { p_contrato_id: contratoId }));

  const contratosTocados = [...new Set((gravadas ?? []).map((g) => g.contrato_id).filter(Boolean) as string[])];
  await atualizarStatusContratos(db, contratosTocados);

  // notificação de pagamento recebido (não para contrato cancelado nem avulsa escondida no app)
  const candidatas = (gravadas ?? []).filter((g) => {
    if (g.status_app !== 'paga' || g.removida) return false;
    const antes = existentes.get(g.asaas_payment_id);
    return antes ? antes.status_app !== 'paga' : !!opcoes.notificarNovasPagas;
  });
  const pagas = await semContratoCanceladoNemAvulsaOculta(db, candidatas);
  if (pagas.length) {
    const totais = await totalDeParcelas(db, pagas.map((p) => p.contrato_id).filter(Boolean) as string[]);
    const numeros = await numerosAtuais(db, pagas.map((p) => p.id));
    const notificacoes: NovaNotificacao[] = pagas.map((p) => {
      const valor = formatarMoeda(Number(p.valor));
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

async function semContratoCanceladoNemAvulsaOculta<T extends { contrato_id: string | null; empresa_id: string }>(db: Admin, linhas: T[]): Promise<T[]> {
  if (!linhas.length) return linhas;
  const contratoIds = [...new Set(linhas.map((l) => l.contrato_id).filter(Boolean) as string[])];
  const cancelados = new Set<string>();
  for (let i = 0; i < contratoIds.length; i += LOTE) {
    const { data } = exigirOk(await db.from('contratos').select('id').in('id', contratoIds.slice(i, i + LOTE)).eq('status', 'cancelado'));
    for (const c of data ?? []) cancelados.add(c.id);
  }
  const empresaIds = [...new Set(linhas.filter((l) => !l.contrato_id).map((l) => l.empresa_id))];
  const avulsasVisiveis = new Set<string>();
  if (empresaIds.length) {
    const { data } = exigirOk(await db.from('empresas').select('id').in('id', empresaIds).eq('mostrar_cobrancas_avulsas', true));
    for (const e of data ?? []) avulsasVisiveis.add(e.id);
  }
  return linhas.filter((l) => (l.contrato_id ? !cancelados.has(l.contrato_id) : avulsasVisiveis.has(l.empresa_id)));
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
  for (let i = 0; i < contratoIds.length; i += LOTE) {
    const { data } = exigirOk(
      await db
        .from('vw_resumo_contrato')
        .select('contrato_id, total_parcelas, parcelas_pagas, saldo_em_aberto')
        .in('contrato_id', contratoIds.slice(i, i + LOTE)),
    );
    for (const r of data ?? []) {
      const quitado = r.total_parcelas > 0 && r.parcelas_pagas >= r.total_parcelas && Number(r.saldo_em_aberto) === 0;
      exigirOk(
        await db
          .from('contratos')
          .update({ status: quitado ? 'quitado' : 'ativo' })
          .eq('id', r.contrato_id)
          .neq('status', 'cancelado')
          .neq('status', quitado ? 'quitado' : 'ativo'),
      );
    }
  }
}

export interface CompradorSync {
  id: string;
  empresa_id: string;
  asaas_customer_id: string | null;
}

/**
 * Ressincroniza um comprador:
 * - cada contrato ativo pelo próprio parcelamento (GET /payments?installment=), o que funciona
 *   mesmo se o CPF tiver mais de um cadastro no Asaas;
 * - as cobranças avulsas pelo cliente do Asaas do comprador.
 * Contratos cancelados não são tocados. O que estava no cache e sumiu da listagem
 * correspondente foi removido no Asaas.
 */
export async function sincronizarComprador(db: Admin, asaas: ClienteAsaas, comprador: CompradorSync) {
  const lidoEm = new Date().toISOString();
  const { data: contratos } = exigirOk(
    await db.from('contratos').select('id, asaas_installment_id').eq('comprador_id', comprador.id).neq('status', 'cancelado'),
  );
  const { data: existentesLista } = exigirOk(
    await db.from('cobrancas').select('asaas_payment_id, contrato_id, removida').eq('comprador_id', comprador.id),
  );

  const itens: ItemGravacao[] = [];
  const vistos = new Set<string>();
  const vinculo = (contratoId: string | null): Vinculo => ({ empresa_id: comprador.empresa_id, comprador_id: comprador.id, contrato_id: contratoId });

  // 1) parcelamentos dos contratos
  const contratosSincronizados = new Set<string>();
  for (const c of contratos ?? []) {
    if (!c.asaas_installment_id) continue;
    const pagamentos = await asaas.listarCobrancasDoParcelamento(c.asaas_installment_id);
    contratosSincronizados.add(c.id);
    for (const p of pagamentos) {
      vistos.add(p.id);
      itens.push({ payment: p, vinculo: vinculo(c.id), vinculoDoContrato: true });
    }
    const ativas = pagamentos.filter((p) => !p.deleted).length;
    if (ativas > 0) {
      exigirOk(await db.from('contratos').update({ numero_parcelas: ativas }).eq('id', c.id).or(`numero_parcelas.is.null,numero_parcelas.neq.${ativas}`));
    }
  }

  // 2) avulsas pelo cliente do Asaas (mantém o vínculo manual a um contrato, se houver)
  let avulsasListadas = false;
  if (comprador.asaas_customer_id) {
    const doCliente = await asaas.listarCobrancasDoCliente(comprador.asaas_customer_id);
    avulsasListadas = true;
    const contratoAtual = new Map((existentesLista ?? []).map((e) => [e.asaas_payment_id, e.contrato_id]));
    for (const p of doCliente) {
      if (p.installment) continue; // parcelamentos vêm do passo 1 (só os vinculados)
      vistos.add(p.id);
      itens.push({ payment: p, vinculo: vinculo(contratoAtual.get(p.id) ?? null) });
    }
  }

  // o que sumiu da listagem correspondente foi removido no Asaas
  const sumiram = (existentesLista ?? [])
    .filter((e) => !e.removida && !vistos.has(e.asaas_payment_id))
    .filter((e) => (e.contrato_id ? contratosSincronizados.has(e.contrato_id) : avulsasListadas))
    .map((e) => e.asaas_payment_id);
  for (let i = 0; i < sumiram.length; i += LOTE) {
    exigirOk(
      await db.from('cobrancas')
        .update({ removida: true, atualizado_asaas_em: new Date().toISOString() })
        .in('asaas_payment_id', sumiram.slice(i, i + LOTE))
        .lt('atualizado_asaas_em', lidoEm),
    );
  }

  const r = await gravarCobrancas(db, itens, { lidoEm });
  const agora = new Date().toISOString();
  exigirOk(await db.from('compradores').update({ ultima_sync_em: agora }).eq('id', comprador.id));
  if (contratosSincronizados.size) {
    exigirOk(await db.from('contratos').update({ ultima_sync_em: agora }).in('id', [...contratosSincronizados]));
  }
  if (sumiram.length) await atualizarStatusContratos(db, [...contratosSincronizados]);
  return { cobrancas: r.gravadas, contratos: contratosSincronizados.size };
}

/**
 * Descobre a quem pertence uma cobrança que chegou pelo webhook.
 * Parcelamento → contrato ativo dele (ignora contrato cancelado). Avulsa → vínculo já
 * gravado, senão o comprador do cliente do Asaas.
 */
export async function vinculoDoPagamento(db: Admin, p: AsaasPayment): Promise<{ vinculo: Vinculo; doContrato: boolean } | null> {
  if (p.installment) {
    const { data: contrato } = exigirOk(
      await db
        .from('contratos')
        .select('id, empresa_id, comprador_id')
        .eq('asaas_installment_id', p.installment)
        .neq('status', 'cancelado')
        .limit(1)
        .maybeSingle(),
    );
    return contrato
      ? { vinculo: { empresa_id: contrato.empresa_id, comprador_id: contrato.comprador_id, contrato_id: contrato.id }, doContrato: true }
      : null;
  }

  const { data: existente } = exigirOk(
    await db.from('cobrancas').select('empresa_id, comprador_id, contrato_id').eq('asaas_payment_id', p.id).maybeSingle(),
  );
  if (existente) return { vinculo: existente as Vinculo, doContrato: false };

  const { data: comprador } = exigirOk(
    await db.from('compradores').select('id, empresa_id').eq('asaas_customer_id', p.customer).limit(1).maybeSingle(),
  );
  return comprador ? { vinculo: { empresa_id: comprador.empresa_id, comprador_id: comprador.id, contrato_id: null }, doContrato: false } : null;
}
