/**
 * Ressincroniza cobranças com o Asaas.
 * - Painel (equipe): { contrato_id } ou { comprador_id } sincroniza na hora aquele comprador;
 *   { pendentes: true } sincroniza os que nunca foram sincronizados (depois de uma importação).
 * - Cron (x-cron-secret): sem corpo, anda pelos compradores com sync mais antigo, dentro de
 *   um limite de tempo; o pg_cron chama várias vezes de madrugada até cobrir todos.
 */
import { criarClienteAsaas } from '../_shared/asaas.ts';
import { sincronizarComprador, type CompradorSync } from '../_shared/cobrancas.ts';
import { ErroHttp, json, servir } from '../_shared/http.ts';
import { admin, chamadaDoCron, exigirEquipe } from '../_shared/supabase.ts';

const ORCAMENTO_MS = 110_000;
const INTERVALO_MINIMO_HORAS = 20;

servir(async (req) => {
  const inicio = Date.now();
  const db = admin();
  const doCron = chamadaDoCron(req);
  const equipe = doCron ? null : await exigirEquipe(req);
  const corpo = (await req.json().catch(() => ({}))) as { contrato_id?: string; comprador_id?: string; pendentes?: boolean };

  let fila: CompradorSync[];
  if (corpo.contrato_id || corpo.comprador_id) {
    let compradorId = corpo.comprador_id;
    if (corpo.contrato_id) {
      const { data: contrato } = await db.from('contratos').select('comprador_id, empresa_id').eq('id', corpo.contrato_id).maybeSingle();
      if (!contrato || (equipe && contrato.empresa_id !== equipe.empresa_id)) {
        throw new ErroHttp(404, 'nao_encontrado', 'Contrato não encontrado.');
      }
      compradorId = contrato.comprador_id;
    }
    const { data: comprador } = await db
      .from('compradores')
      .select('id, empresa_id, asaas_customer_id')
      .eq('id', compradorId!)
      .maybeSingle();
    if (!comprador || (equipe && comprador.empresa_id !== equipe.empresa_id)) {
      throw new ErroHttp(404, 'nao_encontrado', 'Comprador não encontrado.');
    }
    fila = [comprador as CompradorSync];
  } else if (corpo.pendentes && equipe) {
    const { data, error } = await db
      .from('compradores')
      .select('id, empresa_id, asaas_customer_id')
      .eq('empresa_id', equipe.empresa_id)
      .not('asaas_customer_id', 'is', null)
      .is('ultima_sync_em', null)
      .limit(500);
    if (error) throw error;
    fila = (data ?? []) as CompradorSync[];
  } else {
    if (!doCron) throw new ErroHttp(400, 'requisicao_invalida', 'Informe o contrato ou o comprador.');
    const limite = new Date(Date.now() - INTERVALO_MINIMO_HORAS * 3600_000).toISOString();
    const { data, error } = await db
      .from('compradores')
      .select('id, empresa_id, asaas_customer_id')
      .not('asaas_customer_id', 'is', null)
      .or(`ultima_sync_em.is.null,ultima_sync_em.lt.${limite}`)
      .order('ultima_sync_em', { ascending: true, nullsFirst: true })
      .limit(500);
    if (error) throw error;
    fila = (data ?? []) as CompradorSync[];
  }

  const asaas = criarClienteAsaas();
  const resultado = { compradores: 0, contratos: 0, cobrancas: 0, erros: [] as string[], pendentes: 0 };
  for (const [i, comprador] of fila.entries()) {
    if (Date.now() - inicio > ORCAMENTO_MS) {
      resultado.pendentes = fila.length - i;
      break;
    }
    try {
      const r = await sincronizarComprador(db, asaas, comprador);
      resultado.compradores++;
      resultado.contratos += r.contratos;
      resultado.cobrancas += r.cobrancas;
    } catch (e) {
      console.error('sync comprador', comprador.id, e);
      resultado.erros.push(`${comprador.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!doCron && !corpo.pendentes && resultado.erros.length) {
    throw new ErroHttp(502, 'asaas_indisponivel', 'Não foi possível sincronizar com o Asaas agora. Tente de novo em instantes.');
  }
  return json(resultado);
});
