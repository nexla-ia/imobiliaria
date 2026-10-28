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

  const asaas = criarClienteAsaas();
  try {
    const pagamento = await asaas.buscarCobranca(cobranca.asaas_payment_id);
    await atualizarCache(db, cobranca, pagamento);
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
