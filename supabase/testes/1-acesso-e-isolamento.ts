// Bateria de testes do sistema contra o backend de desenvolvimento (sandbox).
import { carregarEnv } from './env.ts';
carregarEnv(new URL('../functions/.env', import.meta.url));
const BASE = 'https://boxxebvhyhtmgbqwfjji.supabase.co';
const ANON = Deno.readTextFileSync(new URL('../../apps/mobile/.env', import.meta.url)).match(/ANON_KEY=(.+)/)![1]!.trim();
const CRON = Deno.env.get('CRON_SECRET')!;
const WEBHOOK = Deno.env.get('ASAAS_WEBHOOK_TOKEN')!;
const SENHA_A = Deno.env.get('SENHA_A')!;
const SENHA_B = Deno.env.get('SENHA_B')!;
const EMPRESA = '00000000-0000-4000-8000-000000000001';

type Resp = { status: number; j: any };
const resultados: Array<{ ok: boolean; nome: string; detalhe: string }> = [];
function checa(nome: string, ok: boolean, detalhe = '') {
  resultados.push({ ok, nome, detalhe });
  console.log(`${ok ? 'PASSOU' : 'FALHOU'}  ${nome}${detalhe ? '  -> ' + detalhe : ''}`);
}

async function login(email: string, senha: string): Promise<string | null> {
  const r = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  });
  return (await r.json()).access_token ?? null;
}
async function lerResp(r: Response): Promise<Resp> {
  const t = await r.text();
  let j: any = t;
  try { j = JSON.parse(t); } catch { /* texto */ }
  return { status: r.status, j };
}
async function rest(caminho: string, jwt: string | null, init: RequestInit = {}): Promise<Resp> {
  return lerResp(await fetch(`${BASE}/rest/v1/${caminho}`, {
    ...init,
    headers: { apikey: ANON, Authorization: `Bearer ${jwt ?? ANON}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  }));
}
async function fn(nome: string, jwt: string | null, corpo: unknown = {}, extra: Record<string, string> = {}): Promise<Resp> {
  return lerResp(await fetch(`${BASE}/functions/v1/${nome}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${jwt ?? ANON}`, 'Content-Type': 'application/json', ...extra },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  }));
}
const negado = (r: Resp) => r.status === 401 || r.status === 403 || (r.status >= 400 && /42501|permission|row-level/i.test(JSON.stringify(r.j)));
const vazioOuNegado = (r: Resp) => negado(r) || (r.status === 200 && Array.isArray(r.j) && r.j.length === 0);
const post = (corpo: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(corpo) });
const patch = (corpo: unknown): RequestInit => ({ method: 'PATCH', body: JSON.stringify(corpo) });

// ---------- contas ----------
const A = await login('52998224725@comprador.planejar.local', SENHA_A);
const B = await login('11144477735@comprador.planejar.local', SENHA_B);
const ADM = await login(Deno.env.get('ADMIN_EMAIL')!, Deno.env.get('SENHA_ADMIN')!);
checa('login comprador A, comprador B e admin', !!A && !!B && !!ADM);
const idA = (await rest('compradores?select=id', A)).j[0].id;
const idB = (await rest('compradores?select=id', B)).j[0].id;
const cobA = (await rest('cobrancas?select=id,numero_parcela,status_app&order=numero_parcela', A)).j;
const cobB = (await rest('cobrancas?select=id,numero_parcela,status_app&order=numero_parcela', B)).j;

// ---------- anônimo ----------
for (const t of ['empresas', 'compradores', 'cobrancas', 'contratos', 'documentos', 'notificacoes', 'usuarios_admin', 'audit_log']) {
  checa(`anônimo não lê ${t}`, negado(await rest(`${t}?select=id&limit=1`, null)));
}
checa('anônimo não chama asaas-boleto', (await fn('asaas-boleto', null, { cobranca_id: cobA[0].id })).status === 401);
checa('anônimo não chama registrar_push_token', negado(await rest('rpc/registrar_push_token', null, post({ p_token: 'ExponentPushToken[x]', p_plataforma: 'android' }))));
checa('anônimo não chama rate_limit_registrar', negado(await rest('rpc/rate_limit_registrar', null, post({ p_chave: 'x', p_janela_segundos: 60, p_limite: 1 }))));
checa('anônimo não chama comprador_excluir_conta', negado(await rest('rpc/comprador_excluir_conta', null, post({ p_comprador_id: idA }))));
checa('comprador não chama comprador_excluir_conta direto', negado(await rest('rpc/comprador_excluir_conta', A, post({ p_comprador_id: idB }))));
checa('comprador não chama renumerar_parcelas', negado(await rest('rpc/renumerar_parcelas', A, post({ p_contrato_id: idA }))));
checa('comprador não chama chamar_edge_function', negado(await rest('rpc/chamar_edge_function', A, post({ p_nome: 'asaas-sync' }))));

// ---------- isolamento entre compradores ----------
checa('A vê só as próprias cobranças (3)', cobA.length === 3, `viu ${cobA.length}`);
checa('B vê só as próprias cobranças (12)', cobB.length === 12, `viu ${cobB.length}`);
checa('A não vê cobranças de B filtrando pelo id de B', vazioOuNegado(await rest(`cobrancas?select=id&comprador_id=eq.${idB}`, A)));
checa('A não vê o cadastro de B', vazioOuNegado(await rest(`compradores?select=id&id=eq.${idB}`, A)));
checa('A vê só o próprio imóvel', (await rest('imoveis?select=id', A)).j.length === 1);
checa('A vê só o próprio resumo de contrato', (await rest('vw_resumo_contrato?select=contrato_id', A)).j.length === 1);
checa('A vê na carteira só a própria linha', (await rest('vw_carteira?select=comprador_id', A)).j.every((l: any) => l.comprador_id === idA));
const boletoCruzado = await fn('asaas-boleto', A, { cobranca_id: cobB[0].id });
checa('A não pega boleto de parcela de B', boletoCruzado.status === 404, `${boletoCruzado.status}`);
checa('A não pega Pix de parcela de B', (await fn('asaas-pix', A, { cobranca_id: cobB[0].id })).status === 404);

// ---------- comprador não escreve onde não pode ----------
const upCad = await rest(`compradores?id=eq.${idA}`, A, patch({ status_acesso: 'ativo', deve_trocar_senha: false, nome: 'Hacker' }));
checa('A não altera o próprio cadastro', vazioOuNegado(upCad), `${upCad.status}`);
const upCob = await rest(`cobrancas?id=eq.${cobA[0].id}`, A, patch({ valor: 1 }));
checa('A não altera cobrança', vazioOuNegado(upCob), `${upCob.status}`);
checa('A não cria notificação', negado(await rest('notificacoes', A, post({ empresa_id: EMPRESA, comprador_id: idA, tipo: 'comunicado', titulo: 'x', corpo: 'x' }))));
const notA = (await rest('notificacoes?select=id&limit=1', A)).j;
if (notA.length) {
  checa('A não altera título da notificação', negado(await rest(`notificacoes?id=eq.${notA[0].id}`, A, patch({ titulo: 'hack' }))));
  const lida = await rest(`notificacoes?id=eq.${notA[0].id}`, A, patch({ lida_em: new Date().toISOString() }));
  checa('A marca a própria notificação como lida', lida.status === 200 && lida.j.length === 1, `${lida.status}`);
}
checa('A não registra push token em nome de B', negado(await rest('push_tokens', A, post({ empresa_id: EMPRESA, comprador_id: idB, expo_token: 'ExponentPushToken[cruzado]' }))));
checa('registrar_push_token recusa formato inválido', (await rest('rpc/registrar_push_token', A, post({ p_token: 'qualquer-coisa', p_plataforma: 'android' }))).status >= 400);
for (const t of ['codigos_acesso', 'asaas_webhook_eventos', 'rate_limits', 'usuarios_admin', 'audit_log', 'comunicados']) {
  checa(`A não lê ${t}`, vazioOuNegado(await rest(`${t}?select=*&limit=1`, A)));
}
const upEmp = await rest('empresas?slug=eq.planejar', A, patch({ whatsapp_atendimento: '5500000000000' }));
checa('A não altera configurações da empresa', vazioOuNegado(upEmp), `${upEmp.status}`);
const insImovel = await rest('imoveis', A, post({ empresa_id: EMPRESA, identificacao: 'invasão' }));
checa('A não cria imóvel', negado(insImovel), `${insImovel.status}`);

// ---------- funções da equipe chamadas por comprador ----------
const funcoesEquipe: Array<[string, unknown]> = [
  ['asaas-sync', { comprador_id: idA }],
  ['asaas-buscar-cliente', { cpf: '11144477735' }],
  ['notify-comunicado', { comunicado_id: idA }],
  ['acesso-convidar', { comprador_id: idB }],
  ['equipe-adicionar', { nome: 'x', email: 'x@x.com', papel: 'admin', senha_provisoria: '12345678' }],
  ['asaas-importar-clientes', {}],
];
for (const [f, corpo] of funcoesEquipe) {
  const r = await fn(f, A, corpo);
  checa(`comprador não usa ${f}`, r.status === 403, `${r.status}`);
}

// ---------- boleto/Pix: entradas ----------
const paga = cobA.find((c: any) => c.status_app === 'paga');
if (paga) checa('boleto de parcela paga é recusado', (await fn('asaas-boleto', A, { cobranca_id: paga.id })).status === 409);
checa('boleto com id inválido é recusado', (await fn('asaas-boleto', A, { cobranca_id: 'abc' })).status === 400);
checa('boleto com corpo inválido é recusado', (await fn('asaas-boleto', A, 'nao-json')).status === 400);
const aberta = cobA.find((c: any) => c.status_app !== 'paga');
const pixOk = await fn('asaas-pix', A, { cobranca_id: aberta.id });
checa('Pix de parcela em aberto funciona', pixOk.status === 200 && !!pixOk.j.copia_e_cola, `${pixOk.status}`);
const boletoOk = await fn('asaas-boleto', A, { cobranca_id: aberta.id });
checa('boleto de parcela em aberto funciona', boletoOk.status === 200 && !!boletoOk.j.linha_digitavel, `${boletoOk.status}`);

// ---------- webhook ----------
const wh = (corpo: string, token: string) => fetch(`${BASE}/functions/v1/asaas-webhook`, { method: 'POST', headers: { 'asaas-access-token': token, 'Content-Type': 'application/json' }, body: corpo });
checa('webhook com token errado é recusado', (await wh('{"event":"PAYMENT_UPDATED"}', 'errado')).status === 401);
checa('webhook sem token é recusado', (await fetch(`${BASE}/functions/v1/asaas-webhook`, { method: 'POST', body: '{}' })).status === 401);
const corpoEv = JSON.stringify({ id: `evt_bateria_${Date.now()}`, event: 'PAYMENT_UPDATED', payment: { id: 'pay_inexistente_bateria', customer: 'cus_nao_vinculado', installment: null, status: 'PENDING', value: 10, dueDate: '2026-12-01', deleted: false } });
const ev1 = await (await wh(corpoEv, WEBHOOK)).json();
const ev2 = await (await wh(corpoEv, WEBHOOK)).json();
checa('webhook de cobrança não vinculada responde 2xx', ev1.ok === true, JSON.stringify(ev1));
checa('webhook repetido (mesmo id) é ignorado', ev2.duplicado === true, JSON.stringify(ev2));
checa('webhook com JSON quebrado responde 400', (await wh('{quebrado', WEBHOOK)).status === 400);

// ---------- cron ----------
checa('notify-vencimentos sem segredo é recusado', (await fn('notify-vencimentos', null, {})).status === 401);
const nv = await fn('notify-vencimentos', null, {}, { 'x-cron-secret': CRON });
checa('notify-vencimentos com segredo roda', nv.status === 200, JSON.stringify(nv.j));
const sc = await fn('asaas-sync', null, {}, { 'x-cron-secret': CRON });
checa('asaas-sync do cron roda', sc.status === 200, JSON.stringify(sc.j));
checa('asaas-sync com segredo errado é recusado', (await fn('asaas-sync', null, {}, { 'x-cron-secret': 'errado' })).status === 401);

// ---------- código de acesso ----------
checa('solicitar código com CPF inválido é recusado', (await fn('auth-solicitar-codigo', null, { empresa: 'planejar', cpf: '12345678900', finalidade: 'primeiro_acesso' })).status === 400);
const digitos = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
const dv = (b: number[], p: number) => { const r = (b.reduce((s, v, i) => s + v * (p - i), 0) * 10) % 11; return r === 10 ? 0 : r; };
digitos.push(dv(digitos, 10)); digitos.push(dv(digitos, 11));
const cpfAleatorio = digitos.join('');
const rInex = await fn('auth-solicitar-codigo', null, { empresa: 'planejar', cpf: cpfAleatorio, finalidade: 'primeiro_acesso' });
const rEx = await fn('auth-solicitar-codigo', null, { empresa: 'planejar', cpf: '52998224725', finalidade: 'recuperar_senha' });
checa('resposta igual para CPF cadastrado e não cadastrado', JSON.stringify(rInex.j) === JSON.stringify(rEx.j), `${JSON.stringify(rInex.j)} vs ${JSON.stringify(rEx.j)}`);
let bloqueios = 0;
for (let i = 0; i < 4; i++) { if ((await fn('auth-solicitar-codigo', null, { empresa: 'planejar', cpf: cpfAleatorio, finalidade: 'primeiro_acesso' })).status === 429) bloqueios++; }
checa('limite de pedidos de código por CPF', bloqueios >= 1, `${bloqueios} bloqueios em 4 tentativas extras`);
checa('validar código com senha curta é recusado', (await fn('auth-validar-codigo', null, { empresa: 'planejar', cpf: '52998224725', codigo: '123456', senha: '123', aceitou_termos: true })).status === 400);

console.log(`\n${resultados.filter((r) => r.ok).length} passaram, ${resultados.filter((r) => !r.ok).length} falharam de ${resultados.length}`);

