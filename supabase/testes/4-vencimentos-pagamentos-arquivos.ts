// Parte 4: paridade de status, avisos de vencimento, pagamento desfeito/refeito, reprocessamento
// de webhook, arquivos no Storage, equipe e limites. Só no ambiente de desenvolvimento (sandbox).
import { statusApp } from '../../packages/shared/src/status.ts';
import { carregarEnv } from './env.ts';
carregarEnv(new URL('../functions/.env', import.meta.url));
const BASE = 'https://boxxebvhyhtmgbqwfjji.supabase.co';
const ASAAS = 'https://api-sandbox.asaas.com/v3';
const hAsaas = { access_token: Deno.env.get('ASAAS_API_KEY')!, 'User-Agent': 'planejar-app/1.0 (Nexla)', 'Content-Type': 'application/json' };
const ANON = Deno.readTextFileSync(new URL('../../apps/mobile/.env', import.meta.url)).match(/ANON_KEY=(.+)/)![1]!.trim();
const CRON = Deno.env.get('CRON_SECRET')!;
const PG = Deno.env.get('PG')!;
const EMPRESA = '00000000-0000-4000-8000-000000000001';

const resultados: Array<{ ok: boolean; nome: string }> = [];
function checa(nome: string, ok: boolean, detalhe = '') { resultados.push({ ok, nome }); console.log(`${ok ? 'PASSOU' : 'FALHOU'}  ${nome}${detalhe ? '  -> ' + detalhe : ''}`); }
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function login(email: string, senha: string) {
  const r = await fetch(`${BASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: senha }) });
  return ((await r.json()).access_token ?? null) as string | null;
}
async function ler(r: Response) { const t = await r.text(); try { return { status: r.status, j: JSON.parse(t) }; } catch { return { status: r.status, j: t as any }; } }
const rest = async (c: string, jwt: string, init: RequestInit = {}) => ler(await fetch(`${BASE}/rest/v1/${c}`, { ...init, headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' } }));
const fn = async (n: string, corpo: unknown, jwt = ANON, extra: Record<string, string> = {}) => ler(await fetch(`${BASE}/functions/v1/${n}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(corpo) }));
async function sql(q: string): Promise<string> {
  // SQL pela entrada padrão em UTF-8: pela linha de comando o Windows estraga acentos
  const p = new Deno.Command('psql', { args: [PG, '-At', '-q', '-v', 'ON_ERROR_STOP=1', '-f', '-'], stdin: 'piped', stdout: 'piped', stderr: 'piped', env: { PGCLIENTENCODING: 'UTF8' } }).spawn();
  const w = p.stdin.getWriter();
  await w.write(new TextEncoder().encode(q));
  await w.close();
  const o = await p.output();
  if (!o.success) throw new Error(new TextDecoder().decode(o.stderr));
  return new TextDecoder().decode(o.stdout).replaceAll('\r', '').trim();
}
const storage = async (metodo: string, caminho: string, jwt: string, corpo?: BodyInit, tipo = 'application/json') =>
  ler(await fetch(`${BASE}/storage/v1/${caminho}`, { method: metodo, headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': tipo }, body: corpo }));

const ADM = (await login(Deno.env.get('ADMIN_EMAIL')!, Deno.env.get('SENHA_ADMIN')!))!;
const A = (await login('52998224725@comprador.planejar.local', Deno.env.get('SENHA_A')!))!;
const B = (await login('11144477735@comprador.planejar.local', Deno.env.get('SENHA_B')!))!;
checa('logins de teste', !!ADM && !!A && !!B);
const idA = await sql("select id from compradores where cpf='52998224725'");
const idB = await sql("select id from compradores where cpf='11144477735'");

// ---------- 1) regra de status: banco (coluna gerada) = app (statusApp) ----------
const todos = ['PENDING', 'OVERDUE', 'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL', 'DUNNING_REQUESTED', 'AWAITING_RISK_ANALYSIS'];
const valores = todos.map((s, i) => `('${EMPRESA}','${idA}','pay_paridade_${i}','2026-12-01',1,'${s}')`).join(',');
const banco = await sql(`begin; insert into cobrancas (empresa_id, comprador_id, asaas_payment_id, vencimento, valor, status_asaas) values ${valores} returning status_asaas || '=' || status_app; rollback;`);
const mapaBanco = Object.fromEntries(banco.split('\n').filter((l) => l.includes('=')).map((l) => l.split('=')));
const divergentes = todos.filter((s) => mapaBanco[s] !== statusApp(s));
checa('status do Asaas: banco e app classificam igual (13 status)', divergentes.length === 0, divergentes.map((s) => `${s}: banco ${mapaBanco[s]} / app ${statusApp(s)}`).join('; '));

// ---------- 2) avisos de vencimento ----------
const hoje = (await sql("select (now() at time zone 'America/Cuiaba')::date"));
const parcela1B = await sql(`select id || '|' || asaas_payment_id from cobrancas where comprador_id='${idB}' and numero_parcela=1`);
const [cob1B, pay1B] = parcela1B.split('|');
await sql(`delete from notificacoes where tipo='vencimento' and payload->>'cobranca_id'='${cob1B}'`); // resto de rodadas anteriores
await sql(`update cobrancas set vencimento = '${hoje}'::date + 3 where id='${cob1B}'`);
const contarVenc = () => sql(`select count(*) from notificacoes where comprador_id='${idB}' and tipo='vencimento' and payload->>'cobranca_id'='${cob1B}'`);
const antes = Number(await contarVenc());
const nv1 = await fn('notify-vencimentos', {}, ANON, { 'x-cron-secret': CRON });
const depois1 = Number(await contarVenc());
checa('aviso "vence em 3 dias" é criado', nv1.status === 200 && depois1 === antes + 1, `${antes} -> ${depois1}`);
const tit3 = await sql(`select titulo from notificacoes where comprador_id='${idB}' and payload->>'cobranca_id'='${cob1B}' order by created_at desc limit 1`);
checa('título do aviso de 3 dias', tit3 === 'Sua parcela vence em 3 dias', tit3);
await fn('notify-vencimentos', {}, ANON, { 'x-cron-secret': CRON });
checa('rodar o aviso de novo no mesmo dia não duplica', Number(await contarVenc()) === depois1);
checa('comprador vê o aviso na central', (await rest(`notificacoes?select=id&tipo=eq.vencimento`, B)).j.length >= 1);
await sql(`update cobrancas set vencimento = '${hoje}' where id='${cob1B}'`);
await fn('notify-vencimentos', {}, ANON, { 'x-cron-secret': CRON });
const titHoje = await sql(`select titulo from notificacoes where comprador_id='${idB}' and payload->>'cobranca_id'='${cob1B}' order by created_at desc limit 1`);
checa('aviso "vence hoje" no dia do vencimento', titHoje === 'Sua parcela vence hoje', titHoje);
await fn('asaas-sync', { comprador_id: idB }, ADM);
const vencRestaurado = await sql(`select vencimento from cobrancas where id='${cob1B}'`);
const vencAsaas = (await (await fetch(`${ASAAS}/payments/${pay1B}`, { headers: hAsaas })).json()).dueDate;
checa('sync devolve o vencimento verdadeiro do Asaas', vencRestaurado === vencAsaas, `${vencRestaurado} vs ${vencAsaas}`);

// ---------- 3) pagamento desfeito e refeito no Asaas ----------
const pay2A = await sql(`select asaas_payment_id from cobrancas where comprador_id='${idA}' and numero_parcela=2`);
const notifPagAntes = await sql(`select count(*) from notificacoes where comprador_id='${idA}' and tipo='pagamento'`);
const desfaz = await fetch(`${ASAAS}/payments/${pay2A}/undoReceivedInCash`, { method: 'POST', headers: hAsaas });
checa('Asaas desfaz o recebimento em dinheiro', desfaz.ok, `${desfaz.status}`);
let voltou = false;
for (let i = 0; i < 12 && !voltou; i++) { await espera(5000); voltou = (await sql(`select status_app from cobrancas where asaas_payment_id='${pay2A}'`)) !== 'paga'; }
checa('webhook: parcela volta a ficar em aberto/vencida', voltou, await sql(`select status_app from cobrancas where asaas_payment_id='${pay2A}'`));
const refaz = await fetch(`${ASAAS}/payments/${pay2A}/receiveInCash`, { method: 'POST', headers: hAsaas, body: JSON.stringify({ paymentDate: hoje, value: 1250, notifyCustomer: false }) });
checa('Asaas registra o recebimento de novo', refaz.ok, `${refaz.status}`);
let paga = false;
for (let i = 0; i < 12 && !paga; i++) { await espera(5000); paga = (await sql(`select status_app from cobrancas where asaas_payment_id='${pay2A}'`)) === 'paga'; }
checa('webhook: parcela paga de novo', paga);
checa('pagamento refeito não manda a notificação "Pagamento recebido" duas vezes', (await sql(`select count(*) from notificacoes where comprador_id='${idA}' and tipo='pagamento'`)) === notifPagAntes);

// ---------- 4) evento de webhook perdido é reprocessado pelo cron ----------
const pay3B = await sql(`select asaas_payment_id from cobrancas where comprador_id='${idB}' and numero_parcela=3`);
const pagamento3 = await (await fetch(`${ASAAS}/payments/${pay3B}`, { headers: hAsaas })).json();
await sql(`update cobrancas set descricao = 'ALTERADO PELO TESTE', atualizado_asaas_em = now() - interval '2 hours' where asaas_payment_id='${pay3B}'`);
const evId = `evt_reprocessar_${Date.now()}`;
await sql(`insert into asaas_webhook_eventos (asaas_event_id, evento, payload, created_at) values ('${evId}', 'PAYMENT_UPDATED', '${JSON.stringify({ id: evId, event: 'PAYMENT_UPDATED', payment: pagamento3 }).replaceAll("'", "''")}'::jsonb, now() - interval '1 hour')`);
const cronSync = await fn('asaas-sync', {}, ANON, { 'x-cron-secret': CRON });
checa('cron reprocessa evento que ficou sem processar', cronSync.status === 200 && (cronSync.j.eventos_reprocessados ?? 0) >= 1, JSON.stringify(cronSync.j));
checa('evento reprocessado marcado como processado', (await sql(`select processado_em is not null from asaas_webhook_eventos where asaas_event_id='${evId}'`)) === 't');
checa('dado da cobrança corrigido pelo reprocessamento', (await sql(`select descricao from cobrancas where asaas_payment_id='${pay3B}'`)) === pagamento3.description);

// ---------- 5) arquivos ----------
const restos = (await sql(`select bucket_id || '|' || name from storage.objects where name like '%/teste-bateria-%' or name like '%/logo-teste.png'`)).split('\n').filter(Boolean);
for (const r of restos) { const [b, n] = r.split('|'); await storage('DELETE', `object/${b}`, ADM, JSON.stringify({ prefixes: [n] })); }
const pdf = new TextEncoder().encode('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const caminhoB = `${EMPRESA}/${idB}/teste-bateria-${Date.now()}.pdf`;
const up = await storage('POST', `object/documentos/${caminhoB}`, ADM, pdf, 'application/pdf');
checa('equipe envia PDF na pasta do comprador', up.status === 200, `${up.status}`);
const assinB = await storage('POST', `object/sign/documentos/${caminhoB}`, B, JSON.stringify({ expiresIn: 60 }));
checa('o dono abre o próprio documento (link assinado)', assinB.status === 200 && !!assinB.j.signedURL, `${assinB.status}`);
if (assinB.j?.signedURL) {
  const baixa = await fetch(`${BASE}/storage/v1${assinB.j.signedURL}`);
  checa('download pelo link assinado traz o PDF', baixa.ok && (await baixa.text()).startsWith('%PDF'));
}
const assinA = await storage('POST', `object/sign/documentos/${caminhoB}`, A, JSON.stringify({ expiresIn: 60 }));
checa('outro comprador não abre o documento', assinA.status >= 400, `${assinA.status}`);
const anonDoc = await fetch(`${BASE}/storage/v1/object/documentos/${caminhoB}`, { headers: { apikey: ANON } });
checa('anônimo não baixa o documento', !anonDoc.ok, `${anonDoc.status}`);
const upA = await storage('POST', `object/documentos/${EMPRESA}/${idA}/invasao.pdf`, A, pdf, 'application/pdf');
checa('comprador não envia arquivo nem na própria pasta', upA.status >= 400, `${upA.status}`);
const apagou = await storage('DELETE', 'object/documentos', ADM, JSON.stringify({ prefixes: [caminhoB] }));
checa('equipe apaga o documento', apagou.status === 200 && apagou.j.length === 1, `${apagou.status}`);

// ---------- 6) equipe: operador, logo e volta de quem foi removido ----------
const emailOp = `operador.bateria4.${Date.now()}@nexla.com.br`;
const senhaOp = `Op-${crypto.randomUUID()}`;
checa('admin cria operador', (await fn('equipe-adicionar', { nome: 'Operador Bateria 4', email: emailOp, papel: 'operador', senha_provisoria: senhaOp }, ADM)).status === 200);
const OP = (await login(emailOp, senhaOp))!;
const logoOp = await storage('POST', `object/marca/${EMPRESA}/logo-teste.png`, OP, new Uint8Array([137, 80, 78, 71]), 'image/png');
checa('operador não troca a logo (bucket marca)', logoOp.status >= 400, `${logoOp.status}`);
const logoAdm = await storage('POST', `object/marca/${EMPRESA}/logo-teste.png`, ADM, new Uint8Array([137, 80, 78, 71]), 'image/png');
checa('admin envia a logo', logoAdm.status === 200, `${logoAdm.status}`);
await storage('DELETE', 'object/marca', ADM, JSON.stringify({ prefixes: [`${EMPRESA}/logo-teste.png`] }));
const idOp = (await rest(`usuarios_admin?select=id&nome=eq.Operador Bateria 4`, ADM)).j[0]?.id;
await rest(`usuarios_admin?id=eq.${idOp}`, ADM, { method: 'DELETE' });
const novaSenhaOp = `Op-${crypto.randomUUID()}`;
const volta = await fn('equipe-adicionar', { nome: 'Operador Bateria 4', email: emailOp, papel: 'operador', senha_provisoria: novaSenhaOp }, ADM);
checa('quem foi removido da equipe pode ser adicionado de novo', volta.status === 200, `${volta.status} ${JSON.stringify(volta.j).slice(0, 90)}`);
checa('volta com a senha provisória nova', !!(await login(emailOp, novaSenhaOp)));
const emailComprador = await fn('equipe-adicionar', { nome: 'x', email: '52998224725@comprador.planejar.local', papel: 'operador', senha_provisoria: novaSenhaOp }, ADM);
checa('login de comprador não pode virar equipe', emailComprador.status === 409, `${emailComprador.status}`);
const idOp2 = (await rest(`usuarios_admin?select=id&nome=eq.Operador Bateria 4`, ADM)).j[0]?.id;
await rest(`usuarios_admin?id=eq.${idOp2}`, ADM, { method: 'DELETE' });

// ---------- 7) limites e entradas ----------
const aberta = await sql(`select id from cobrancas where comprador_id='${idA}' and status_app in ('em_aberto','vencida') limit 1`);
// a janela é o minuto do relógio: 41 chamadas estouram o limite mesmo se cruzarem a virada do minuto
let chamadas = 0, bloqueou = false;
while (!bloqueou && chamadas < 41) { chamadas++; bloqueou = (await fn('asaas-boleto', { cobranca_id: aberta }, A)).status === 429; }
checa('limite de 20 consultas de boleto/Pix por minuto', bloqueou, `bloqueou na chamada ${chamadas}`);
checa('busca no Asaas por CPF sem cadastro devolve lista vazia', ((await fn('asaas-buscar-cliente', { cpf: '39053344705' }, ADM)).j.clientes ?? [1]).length === 0);
checa('busca no Asaas com CPF inválido é recusada', (await fn('asaas-buscar-cliente', { cpf: '123' }, ADM)).status === 400);
checa('comunicado inexistente devolve 404', (await fn('notify-comunicado', { comunicado_id: crypto.randomUUID() }, ADM)).status === 404);
checa('convite de comprador de outra empresa/inexistente devolve 404', (await fn('acesso-convidar', { comprador_id: crypto.randomUUID() }, ADM)).status === 404);
checa('ações do painel ficam no registro de auditoria', Number(await sql(`select count(*) from audit_log where created_at > now() - interval '1 hour'`)) > 0);

console.log(`\n${resultados.filter((r) => r.ok).length} passaram, ${resultados.filter((r) => !r.ok).length} falharam de ${resultados.length}`);
