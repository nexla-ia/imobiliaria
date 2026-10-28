/** Boleto de uma parcela do comprador logado: link do PDF e linha digitável, buscados na hora no Asaas. */
import { AsaasErro, criarClienteAsaas } from '../_shared/asaas.ts';
import { atualizarCache, cobrancaPagavel, conferirAindaPagavel } from '../_shared/cobranca-do-comprador.ts';
import { ErroHttp, json, lerCorpo, servir } from '../_shared/http.ts';
import { admin, exigirComprador } from '../_shared/supabase.ts';

servir(async (req) => {
  const comprador = await exigirComprador(req);
  const { cobranca_id } = await lerCorpo<{ cobranca_id?: string }>(req);
  const db = admin();
  const cobranca = await cobrancaPagavel(db, comprador, cobranca_id);

  // limite por comprador: cada clique gasta 2-3 chamadas da cota do Asaas (25 mil/12 h para a conta toda)
  const { data: dentro, error: erroLimite } = await db.rpc('rate_limit_registrar', {
    p_chave: `asaas:comprador:${comprador.id}`,
    p_janela_segundos: 60,
    p_limite: 20,
  });
  if (erroLimite) throw erroLimite;
  if (!dentro) throw new ErroHttp(429, 'muitas_tentativas', 'Muitas consultas seguidas. Aguarde um minuto e tente de novo.');

  const asaas = criarClienteAsaas();
  const lidoEm = new Date().toISOString();
  let pagamento;
  try {
    pagamento = await asaas.buscarCobranca(cobranca.asaas_payment_id);
  } catch (e) {
    console.error(e);
    throw new ErroHttp(502, 'asaas_indisponivel', 'Não conseguimos buscar o boleto agora. Tente de novo em instantes.');
  }
  await atualizarCache(db, cobranca, pagamento, lidoEm);
  conferirAindaPagavel(pagamento);

  let linha: string | null = null;
  try {
    linha = (await asaas.linhaDigitavel(pagamento.id)).identificationField;
  } catch (e) {
    // cobrança só Pix/cartão não tem linha digitável; o app mostra só o link da fatura
    if (!(e instanceof AsaasErro) || e.status >= 500) console.error('identificationField', e);
  }

  return json({
    linha_digitavel: linha,
    bank_slip_url: pagamento.bankSlipUrl,
    invoice_url: pagamento.invoiceUrl,
    valor: pagamento.value,
    vencimento: pagamento.dueDate,
    status_asaas: pagamento.status,
  });
});
