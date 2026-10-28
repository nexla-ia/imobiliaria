// Testes unitários das funções puras (sem rede nem banco).
// Rodar: npx deno@2.9.6 test supabase/testes/unitarios.test.ts
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { cpfValido as cpfValidoApp, diasAte, formatarCpf, formatarData, formatarMoeda, formatarTelefone, linkWhatsapp, somenteDigitos } from '../../packages/shared/src/format.ts';
import { podePagar, statusApp } from '../../packages/shared/src/status.ts';
import { AsaasErro, cobrancaParaLinha, criarClienteAsaas, type AsaasPayment } from '../functions/_shared/asaas.ts';
import { numeroDaDescricao } from '../functions/_shared/cobrancas.ts';
import { cpfValido as cpfValidoServidor, dataNoFuso, formatarData as formatarDataServidor, formatarMoeda as formatarMoedaServidor, iguaisSeguro } from '../functions/_shared/http.ts';
import { normalizarTelefone } from '../functions/_shared/mensagens.ts';

// ---------------- formatação BR ----------------
Deno.test('moeda no padrão R$ 1.250,00 (app e servidor iguais)', () => {
  for (const [v, esperado] of [[1250, 'R$ 1.250,00'], [0, 'R$ 0,00'], [1276.25, 'R$ 1.276,25'], [1234567.891, 'R$ 1.234.567,89'], [0.5, 'R$ 0,50']] as const) {
    assertEquals(formatarMoeda(v), esperado);
    assertEquals(formatarMoedaServidor(v), esperado);
  }
});

Deno.test('CPF: formatação e validação (app e servidor iguais)', () => {
  assertEquals(formatarCpf('52998224725'), '529.982.247-25');
  assertEquals(formatarCpf('529.982.247-25'), '529.982.247-25');
  assertEquals(formatarCpf('1234567890'), '012.345.678-90'); // CPF sem o zero à esquerda (planilha/Excel)
  const casos: Array<[string, boolean]> = [
    ['52998224725', true], ['11144477735', true], ['12345678900', false], ['11111111111', false],
    ['00000000000', false], ['5299822472', false], ['529982247250', false], ['', false],
  ];
  for (const [cpf, ok] of casos) {
    assertEquals(cpfValidoApp(cpf), ok, `app ${cpf}`);
    assertEquals(cpfValidoServidor(cpf), ok, `servidor ${cpf}`);
  }
  assert(cpfValidoApp('529.982.247-25'), 'app aceita CPF com máscara');
});

Deno.test('telefone: formatação e normalização para WhatsApp', () => {
  assertEquals(formatarTelefone('5565999373761'), '(65) 9 9937-3761');
  assertEquals(formatarTelefone('65999373761'), '(65) 9 9937-3761');
  assertEquals(formatarTelefone('6533221100'), '(65) 3322-1100');
  assertEquals(normalizarTelefone('(65) 9 9937-3761'), '5565999373761');
  assertEquals(normalizarTelefone('5565999373761'), '5565999373761');
  assertEquals(normalizarTelefone('6533221100'), '556533221100');
  assertEquals(normalizarTelefone('999'), null);
  assertEquals(normalizarTelefone(null), null);
  assertEquals(normalizarTelefone(''), null);
});

Deno.test('datas: dd/mm/aaaa e dias até o vencimento', () => {
  assertEquals(formatarData('2026-10-20'), '20/10/2026');
  assertEquals(formatarData('2026-10-20T03:00:00Z'), '20/10/2026');
  assertEquals(formatarDataServidor('2027-01-05'), '05/01/2027');
  const hoje = new Date(2026, 9, 23);
  assertEquals(diasAte('2026-10-23', hoje), 0);
  assertEquals(diasAte('2026-10-26', hoje), 3);
  assertEquals(diasAte('2026-10-20', hoje), -3);
  assertEquals(diasAte('2026-11-02', hoje), 10); // virada de mês
  assertEquals(diasAte('2027-01-01', new Date(2026, 11, 31)), 1); // virada de ano
});

Deno.test('dataNoFuso: dia de calendário de Cuiabá, somando dias', () => {
  const hoje = dataNoFuso('America/Cuiaba');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(hoje));
  const [a, m, d] = hoje.split('-').map(Number);
  const mais3 = new Date(Date.UTC(a!, m! - 1, d! + 3)).toISOString().slice(0, 10);
  assertEquals(dataNoFuso('America/Cuiaba', 3), mais3);
  assertEquals(dataNoFuso('America/Cuiaba', 0), hoje);
  // Cuiabá e São Paulo podem diferir no dia entre 23h e 24h de Brasília, nunca mais que 1 dia
  const sp = dataNoFuso('America/Sao_Paulo');
  assert(Math.abs(Date.parse(sp) - Date.parse(hoje)) <= 86_400_000);
});

Deno.test('link do WhatsApp com mensagem codificada', () => {
  assertEquals(linkWhatsapp('(65) 9 9937-3761', 'Olá! Lote 12 · Quadra B & cia'), 'https://wa.me/5565999373761?text=Ol%C3%A1!%20Lote%2012%20%C2%B7%20Quadra%20B%20%26%20cia');
  assertEquals(linkWhatsapp('5565999373761', 'oi'), 'https://wa.me/5565999373761?text=oi');
  assertEquals(somenteDigitos('a1b2-3'), '123');
});

// ---------------- status do Asaas ----------------
Deno.test('status do Asaas → status do app', () => {
  const casos: Record<string, string> = {
    PENDING: 'em_aberto', OVERDUE: 'vencida', RECEIVED: 'paga', CONFIRMED: 'paga', RECEIVED_IN_CASH: 'paga',
    REFUNDED: 'estornada', REFUND_REQUESTED: 'estornada', REFUND_IN_PROGRESS: 'estornada',
    CHARGEBACK_REQUESTED: 'estornada', CHARGEBACK_DISPUTE: 'estornada',
    AWAITING_CHARGEBACK_REVERSAL: 'oculta', DUNNING_REQUESTED: 'oculta', AWAITING_RISK_ANALYSIS: 'oculta', QUALQUER: 'oculta',
  };
  for (const [asaas, app] of Object.entries(casos)) assertEquals(statusApp(asaas), app, asaas);
  assert(podePagar('em_aberto') && podePagar('vencida'));
  assert(!podePagar('paga') && !podePagar('estornada') && !podePagar('oculta'));
});

Deno.test('número da parcela pela descrição automática do Asaas', () => {
  assertEquals(numeroDaDescricao('Parcela 1 de 3. TESTE NEXLA - Lote 12 Quadra B'), 1);
  assertEquals(numeroDaDescricao('parcela 12 de 60'), 12);
  assertEquals(numeroDaDescricao('Taxa de transferência'), null);
  assertEquals(numeroDaDescricao(null), null);
});

Deno.test('cobrança do Asaas → linha do cache', () => {
  const p = {
    id: 'pay_1', customer: 'cus_1', installment: 'ins_1', installmentNumber: 3, status: 'RECEIVED', value: 1276.25,
    netValue: 1250.1, originalValue: 1250, interestValue: 26.25, description: 'Parcela 3 de 60.', billingType: 'PIX',
    dueDate: '2026-10-20', originalDueDate: '2026-10-20', paymentDate: '2026-10-22', clientPaymentDate: '2026-10-21',
    invoiceUrl: 'https://x/i', bankSlipUrl: 'https://x/b', transactionReceiptUrl: 'https://x/c', deleted: false,
  } satisfies AsaasPayment;
  const l = cobrancaParaLinha(p);
  assertEquals(l.numero_parcela, 3);
  assertEquals(l.valor, 1276.25); // valor pago (com juros)
  assertEquals(l.valor_original, 1250); // antes dos juros
  assertEquals(l.data_pagamento, '2026-10-21'); // data em que o cliente pagou
  assertEquals(l.comprovante_url, 'https://x/c');
  assertEquals(l.removida, false);
});

// ---------------- segurança ----------------
Deno.test('comparação de segredos', () => {
  assert(iguaisSeguro('abc', 'abc'));
  assert(!iguaisSeguro('abc', 'abd'));
  assert(!iguaisSeguro('abc', 'abcd'));
  assert(!iguaisSeguro('', 'x'));
});

// ---------------- cliente do Asaas (fetch simulado) ----------------
function simularFetch(respostas: Array<() => Response>) {
  const original = globalThis.fetch;
  const chamadas: string[] = [];
  let i = 0;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    chamadas.push(`${init?.method ?? 'GET'} ${String(url)} ${(init?.headers as Record<string, string>)?.access_token ? 'com-chave' : 'sem-chave'}`);
    const r = respostas[Math.min(i++, respostas.length - 1)]!;
    return Promise.resolve(r());
  }) as typeof fetch;
  return { chamadas, restaurar: () => { globalThis.fetch = original; } };
}
const jsonResp = (corpo: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const config = { apiKey: '$aact_hmlg_teste', ambiente: 'sandbox' as const };

Deno.test('cliente Asaas: pagina até hasMore = false', async () => {
  const pagina = (n: number, hasMore: boolean) => () => jsonResp({ hasMore, totalCount: 250, limit: 100, offset: n * 100, data: Array.from({ length: hasMore ? 100 : 50 }, (_, i) => ({ id: `pay_${n}_${i}` })) });
  const f = simularFetch([pagina(0, true), pagina(1, true), pagina(2, false)]);
  try {
    const lista = await criarClienteAsaas(config).listarCobrancasDoParcelamento('ins_1');
    assertEquals(lista.length, 250);
    assertEquals(f.chamadas.length, 3);
    assert(f.chamadas[1]!.includes('offset=100') && f.chamadas[1]!.includes('limit=100'));
    assert(f.chamadas.every((c) => c.includes('api-sandbox.asaas.com') && c.endsWith('com-chave')));
  } finally {
    f.restaurar();
  }
});

Deno.test('cliente Asaas: tenta de novo em 503 e devolve o resultado', async () => {
  const f = simularFetch([() => jsonResp({}, 503), () => jsonResp({ id: 'pay_1', status: 'PENDING' })]);
  try {
    const p = await criarClienteAsaas(config).buscarCobranca('pay_1');
    assertEquals(p.id, 'pay_1');
    assertEquals(f.chamadas.length, 2);
  } finally {
    f.restaurar();
  }
});

Deno.test('cliente Asaas: 404 não tenta de novo e traz o corpo do erro', async () => {
  const f = simularFetch([() => jsonResp({ errors: [{ code: 'not_found' }] }, 404)]);
  try {
    const e = await assertRejects(() => criarClienteAsaas(config).buscarCobranca('pay_x'), AsaasErro);
    assertEquals(e.status, 404);
    assertEquals(f.chamadas.length, 1);
  } finally {
    f.restaurar();
  }
});

Deno.test('cliente Asaas: cota esgotada (429 com reset longo) desiste na hora', async () => {
  const f = simularFetch([() => jsonResp({ errors: [] }, 429, { 'RateLimit-Reset': '3600' })]);
  try {
    const e = await assertRejects(() => criarClienteAsaas(config).buscarCobranca('pay_1'), AsaasErro);
    assertEquals(e.status, 429);
    assertEquals(f.chamadas.length, 1);
  } finally {
    f.restaurar();
  }
});

Deno.test('cliente Asaas: id com caractere especial vai codificado na URL', async () => {
  const f = simularFetch([() => jsonResp({ id: 'x' })]);
  try {
    await criarClienteAsaas(config).buscarCobranca('pay/../customers');
    assert(f.chamadas[0]!.includes('/payments/pay%2F..%2Fcustomers'), f.chamadas[0]);
  } finally {
    f.restaurar();
  }
});

Deno.test('cliente Asaas: recusa chave de produção no ambiente sandbox', () => {
  Deno.env.set('ASAAS_API_KEY', '$aact_prod_xyz');
  Deno.env.set('ASAAS_AMBIENTE', 'sandbox');
  let erro = '';
  try {
    criarClienteAsaas();
  } catch (e) {
    erro = (e as Error).message;
  }
  assert(/não corresponde/.test(erro), erro);
});
