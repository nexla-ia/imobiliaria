/** QR Code Pix de uma parcela do comprador logado, gerado na hora pelo Asaas. */
import { criarClienteAsaas } from '../_shared/asaas.ts';
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
  try {
    const pagamento = await asaas.buscarCobranca(cobranca.asaas_payment_id);
    await atualizarCache(db, cobranca, pagamento, lidoEm);
    conferirAindaPagavel(pagamento);
    const qr = await asaas.pixQrCode(pagamento.id);
    return json({
      qr_code_base64: qr.encodedImage,
      copia_e_cola: qr.payload,
      expira_em: qr.expirationDate ?? null,
      invoice_url: pagamento.invoiceUrl,
      valor: pagamento.value,
      status_asaas: pagamento.status,
    });
  } catch (e) {
    if (e instanceof ErroHttp) throw e;
    console.error(e);
    throw new ErroHttp(502, 'asaas_indisponivel', 'Não conseguimos gerar o Pix agora. Tente de novo ou use o boleto.');
  }
});
