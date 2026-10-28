// Parte 2: senha provisória, operador, eventos reais do Asaas, idempotência e exclusão de conta.
import { carregarEnv } from './env.ts';
carregarEnv(new URL('../functions/.env', import.meta.url));
const BASE = 'https://boxxebvhyhtmgbqwfjji.supabase.co';
const ASAAS = 'https://api-sandbox.asaas.com/v3';
const hAsaas = { access_token: Deno.env.get('ASAAS_API_KEY')!, 'User-Agent': 'planejar-app/1.0 (Nexla)', 'Content-Type': 'application/json' };
const ANON = Deno.readTextFileSync(new URL('../../apps/mobile/.env', import.meta.url)).match(/ANON_KEY=(.+)/)![1]!.trim();
const CRON = Deno.env.get('CRON_SECRET')!;
const SENHA_B = Deno.env.get('SENHA_B')!;
const EMAIL_B = '11144477735@comprador.planejar.local';

type Resp = { status: number; j: any };
const resultados: Array<{ ok: boolean; nome: string; detalhe: string }> = [];
function checa(nome: string, ok: boolean, detalhe = '') {
  resultados.push({ ok, nome, detalhe });
  console.log(`${ok ? 'PASSOU' : 'FALHOU'}  ${nome}${detalhe ? '  -> ' + detalhe : ''}`);
}
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function login(email: string, senha: string) {
  const r = await fetch(`${BASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: senha }) });
  return ((await r.json()).access_token ?? null) as string | null;
}
async function lerResp(r: Response): Promise<Resp> { const t = await r.text(); let j: any = t; try { j = JSON.parse(t); } catch { /* */ } return { status: r.status, j }; }
const rest = async (c: string, jwt: string | null, init: RequestInit = {}) => lerResp(await fetch(`${BASE}/rest/v1/${c}`, { ...init, headers: { apikey: ANON, Authorization: `Bearer ${jwt ?? ANON}`, 'Content-Type': 'application/json', Prefer: 'return=representation' } }));
const fn = async (n: string, jwt: string | null, corpo: unknown = {}, extra: Record<string, string> = {}) => lerResp(await fetch(`${BASE}/functions/v1/${n}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${jwt ?? ANON}`, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(corpo) }));
const vazioOuNegado = (r: Resp) => r.status === 401 || r.status === 403 || (r.status >= 400 && /42501|row-level/i.test(JSON.stringify(r.j))) || (r.status === 200 && Array.isArray(r.j) && r.j.length === 0);
const patch = (c: unknown): RequestInit => ({ method: 'PATCH', body: JSON.stringify(c) });

const ADM = (await login(Deno.env.get('ADMIN_EMAIL')!, Deno.env.get('SENHA_ADMIN')!))!;
let B = (await login(EMAIL_B, SENHA_B))!;
const idB = (await rest('compradores?select=id', B)).j[0].id;
const cobB0 = (await rest('cobrancas?select=id,asaas_payment_id,numero_parcela&order=numero_parcela', B)).j;

// ---------- senha provisória: tentativas de burlar ----------
const conv = await fn('acesso-convidar', ADM, { comprador_id: idB });
checa('admin gera senha provisória', conv.status === 200 && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(conv.j.senha), `${conv.status}`);
checa('senha antiga para de funcionar ao gerar provisória', (await login(EMAIL_B, SENHA_B)) === null);
const P = (await login(EMAIL_B, conv.j.senha))!;
checa('login com provisória funciona', !!P);
checa('com provisória não lista cobranças', vazioOuNegado(await rest('cobrancas?select=id', P)));
checa('com provisória não lista contratos', vazioOuNegado(await rest('contratos?select=id', P)));
checa('com provisória não lista documentos', vazioOuNegado(await rest('documentos?select=id', P)));
checa('com provisória não lista notificações', vazioOuNegado(await rest('notificacoes?select=id', P)));
const burla = await rest(`compradores?id=eq.${idB}`, P, patch({ deve_trocar_senha: false }));
checa('com provisória não desliga deve_trocar_senha pela API', vazioOuNegado(burla), `${burla.status}`);
const bolP = await fn('asaas-boleto', P, { cobranca_id: cobB0[0].id });
checa('com provisória não pega boleto (mesmo sabendo o id)', bolP.status === 403, `${bolP.status} ${JSON.stringify(bolP.j).slice(0, 90)}`);
const pixP = await fn('asaas-pix', P, { cobranca_id: cobB0[0].id });
checa('com provisória não pega Pix (mesmo sabendo o id)', pixP.status === 403, `${pixP.status}`);
const pushP = await rest('rpc/registrar_push_token', P, { method: 'POST', body: JSON.stringify({ p_token: 'ExponentPushToken[provisoria]', p_plataforma: 'android' }) });
checa('com provisória não registra aparelho', pushP.status >= 400, `${pushP.status}`);
const exclP = await fn('conta-excluir', P, {});
checa('com provisória não exclui a conta', exclP.status === 403, `${exclP.status} ${JSON.stringify(exclP.j).slice(0, 90)}`);
const curta = await fn('conta-definir-senha', P, { senha: '123', aceitou_termos: true });
checa('definir senha curta é recusado', curta.status === 400);
const igual = await fn('conta-definir-senha', P, { senha: conv.j.senha, aceitou_termos: true });
checa('definir senha igual à provisória é recusado', igual.status === 400, `${igual.status} ${JSON.stringify(igual.j).slice(0, 80)}`);
let def: Resp = igual;
if (igual.status !== 200) def = await fn('conta-definir-senha', P, { senha: SENHA_B, aceitou_termos: true });
checa('define senha nova e volta a ter acesso', def.status === 200, `${def.status}`);
B = (await login(EMAIL_B, SENHA_B))!;
checa('depois de definir, lista as 12 cobranças', (await rest('cobrancas?select=id', B)).j.length === 12);
checa('definir senha de novo (já definida) é recusado', (await fn('conta-definir-senha', B, { senha: 'OutraSenha99', aceitou_termos: true })).status === 409);

// ---------- operador ----------
const emailOp = `operador.teste.${Date.now()}@nexla.com.br`;
const senhaOp = `Op-${crypto.randomUUID()}`; // conta descartável: removida da equipe no fim do teste
const add = await fn('equipe-adicionar', ADM, { nome: 'Operador Teste', email: emailOp, papel: 'operador', senha_provisoria: senhaOp });
checa('admin cria operador', add.status === 200, `${add.status} ${JSON.stringify(add.j).slice(0, 90)}`);
const OP = (await login(emailOp, senhaOp))!;
checa('operador entra', !!OP);
checa('operador vê compradores', (await rest('compradores?select=id', OP)).j.length >= 2);
const opEmp = await rest('empresas?slug=eq.planejar', OP, patch({ whatsapp_atendimento: '5500000000000' }));
checa('operador não altera configurações', vazioOuNegado(opEmp), `${opEmp.status}`);
const opMe = (await rest('usuarios_admin?select=id,papel', OP)).j.find((u: any) => u.papel === 'operador');
const opPromove = await rest(`usuarios_admin?id=eq.${opMe?.id}`, OP, patch({ papel: 'admin' }));
checa('operador não se promove a admin', vazioOuNegado(opPromove), `${opPromove.status}`);
checa('operador não cria membro da equipe', (await fn('equipe-adicionar', OP, { nome: 'x', email: `x${Date.now()}@x.com`, papel: 'admin', senha_provisoria: '12345678' })).status === 403);
checa('operador não roda importação em lote', (await fn('asaas-importar-clientes', OP, {})).status === 403);
checa('operador pode sincronizar um comprador', (await fn('asaas-sync', OP, { comprador_id: idB })).status === 200);
checa('equipe-adicionar com e-mail repetido é recusado', (await fn('equipe-adicionar', ADM, { nome: 'Dup', email: emailOp, papel: 'operador', senha_provisoria: senhaOp })).status === 409);
// limpa: tira o operador da equipe
await rest(`usuarios_admin?id=eq.${opMe?.id}`, ADM, { method: 'DELETE' });
checa('admin remove operador da equipe', (await rest('compradores?select=id', OP)).j.length === 0);

// ---------- eventos reais do Asaas: remover e restaurar parcela ----------
const ultima = cobB0[cobB0.length - 1];
const del = await fetch(`${ASAAS}/payments/${ultima.asaas_payment_id}`, { method: 'DELETE', headers: hAsaas });
checa('Asaas sandbox remove a parcela 12', del.ok, `${del.status}`);
let some = false;
for (let i = 0; i < 12 && !some; i++) { await espera(5000); some = (await rest('cobrancas?select=id', B)).j.length === 11; }
checa('webhook PAYMENT_DELETED esconde a parcela do comprador', some);
const rest1 = await fetch(`${ASAAS}/payments/${ultima.asaas_payment_id}/restore`, { method: 'POST', headers: hAsaas });
checa('Asaas sandbox restaura a parcela 12', rest1.ok, `${rest1.status}`);
let volta = false;
for (let i = 0; i < 12 && !volta; i++) { await espera(5000); volta = (await rest('cobrancas?select=id', B)).j.length === 12; }
checa('webhook PAYMENT_RESTORED mostra a parcela de novo', volta);

// ---------- idempotência do sync ----------
const notifAntes = (await rest('notificacoes?select=id', B)).j.length;
const s1 = await fn('asaas-sync', ADM, { comprador_id: idB });
const s2 = await fn('asaas-sync', ADM, { comprador_id: idB });
const cobDepois = ((await rest('cobrancas?select=id,numero_parcela&order=numero_parcela', B)).j) as any[];
if (!Array.isArray(cobDepois)) throw new Error('B sem sessão: ' + JSON.stringify(cobDepois));
checa('sincronizar duas vezes não duplica parcelas', s1.status === 200 && s2.status === 200 && cobDepois.length === 12);
checa('numeração das parcelas 1..12 sem buracos', cobDepois.map((c: any) => c.numero_parcela).join(',') === Array.from({ length: 12 }, (_, i) => i + 1).join(','));
checa('sincronizar não cria notificação repetida', (await rest('notificacoes?select=id', B)).j.length === notifAntes);

// ---------- exclusão de conta ----------
const excl = await fn('conta-excluir', B, {});
checa('comprador exclui a própria conta', excl.status === 200, `${excl.status}`);
checa('depois de excluir, login antigo não entra', (await login(EMAIL_B, SENHA_B)) === null);
const reconv = await fn('acesso-convidar', ADM, { comprador_id: idB });
checa('equipe consegue gerar novo acesso depois da exclusão', reconv.status === 200, `${reconv.status} ${JSON.stringify(reconv.j).slice(0, 90)}`);
const P2 = (await login(EMAIL_B, reconv.j.senha))!;
const def2 = await fn('conta-definir-senha', P2, { senha: SENHA_B, aceitou_termos: false });
checa('depois de excluir, precisa aceitar os termos de novo', def2.status === 400 && def2.j.erro === 'termos_obrigatorios');
await fn('conta-definir-senha', P2, { senha: SENHA_B, aceitou_termos: true });
checa('comprador volta a ver as parcelas após reativar', (await rest('cobrancas?select=id', (await login(EMAIL_B, SENHA_B))!)).j.length === 12);

console.log(`\n${resultados.filter((r) => r.ok).length} passaram, ${resultados.filter((r) => !r.ok).length} falharam de ${resultados.length}`);
