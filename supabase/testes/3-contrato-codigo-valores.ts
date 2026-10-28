// Parte 3: contrato cancelado, limite atômico de tentativas do código, valores pagos e carteira.
import { carregarEnv } from './env.ts';
carregarEnv(new URL('../functions/.env', import.meta.url));
const BASE = 'https://boxxebvhyhtmgbqwfjji.supabase.co';
const ANON = Deno.readTextFileSync(new URL('../../apps/mobile/.env', import.meta.url)).match(/ANON_KEY=(.+)/)![1]!.trim();
const PEPPER = Deno.env.get('CODIGO_PEPPER')!;
const SENHA_A = Deno.env.get('SENHA_A')!;
const SENHA_B = Deno.env.get('SENHA_B')!;
const PG = Deno.env.get('PG')!; // string de conexão do psql

const resultados: Array<{ ok: boolean; nome: string }> = [];
function checa(nome: string, ok: boolean, detalhe = '') { resultados.push({ ok, nome }); console.log(`${ok ? 'PASSOU' : 'FALHOU'}  ${nome}${detalhe ? '  -> ' + detalhe : ''}`); }
async function login(email: string, senha: string) {
  const r = await fetch(`${BASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: senha }) });
  return ((await r.json()).access_token ?? null) as string | null;
}
const rest = async (c: string, jwt: string, init: RequestInit = {}) => { const r = await fetch(`${BASE}/rest/v1/${c}`, { ...init, headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' } }); const t = await r.text(); try { return { status: r.status, j: JSON.parse(t) }; } catch { return { status: r.status, j: t }; } };
const fn = async (n: string, corpo: unknown, jwt = ANON) => { const r = await fetch(`${BASE}/functions/v1/${n}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }); return { status: r.status, j: await r.json().catch(() => null) }; };
async function sql(q: string): Promise<string> {
  const p = new Deno.Command('psql', { args: [PG, '-At', '-c', q], stdout: 'piped', stderr: 'piped' });
  const o = await p.output();
  return new TextDecoder().decode(o.stdout).trim();
}
async function sha256(t: string) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join(''); }

const ADM = (await login(Deno.env.get('ADMIN_EMAIL')!, Deno.env.get('SENHA_ADMIN')!))!;
const B = (await login('11144477735@comprador.planejar.local', SENHA_B))!;
const A = (await login('52998224725@comprador.planejar.local', SENHA_A))!;

// ---------- contrato cancelado ----------
const contratoB = (await rest('contratos?select=id', B)).j[0].id;
await rest(`contratos?id=eq.${contratoB}`, ADM, { method: 'PATCH', body: JSON.stringify({ status: 'cancelado' }) });
checa('contrato cancelado: comprador não vê o contrato', (await rest('contratos?select=id', B)).j.length === 0);
checa('contrato cancelado: comprador não vê as parcelas na hora', (await rest('cobrancas?select=id', B)).j.length === 0);
const bol = await fn('asaas-boleto', { cobranca_id: (await sql(`select id from cobrancas where contrato_id='${contratoB}' limit 1`)) }, B);
checa('contrato cancelado: boleto recusado', bol.status === 404, `${bol.status}`);
const sync = await fn('asaas-sync', { comprador_id: await sql(`select comprador_id from contratos where id='${contratoB}'`) }, ADM);
checa('sync não marca como removidas as parcelas de contrato cancelado', sync.status === 200 && (await sql(`select count(*) from cobrancas where contrato_id='${contratoB}' and removida`)) === '0');
await rest(`contratos?id=eq.${contratoB}`, ADM, { method: 'PATCH', body: JSON.stringify({ status: 'ativo' }) });
checa('contrato reativado: parcelas voltam', (await rest('cobrancas?select=id', B)).j.length === 12);

// ---------- limite atômico de tentativas do código ----------
const idA = await sql("select id from compradores where cpf='52998224725'");
const codigo = '731946';
await sql(`delete from codigos_acesso where comprador_id='${idA}'`);
await sql(`insert into codigos_acesso (empresa_id, comprador_id, codigo_hash, canal, expira_em) values ('00000000-0000-4000-8000-000000000001','${idA}','${await sha256(`${idA}:${codigo}:${PEPPER}`)}','whatsapp', now() + interval '10 minutes')`);
const errados = await Promise.all(Array.from({ length: 8 }, (_, i) => fn('auth-validar-codigo', { empresa: 'planejar', cpf: '52998224725', codigo: String(100000 + i), senha: 'NaoImporta2026', aceitou_termos: true })));
checa('8 códigos errados em paralelo: todos recusados', errados.every((r) => r.status === 400 || r.status === 429), errados.map((r) => r.status).join(','));
checa('tentativas contadas sem perder nenhuma (8)', (await sql(`select tentativas from codigos_acesso where comprador_id='${idA}'`)) === '8');
const certo = await fn('auth-validar-codigo', { empresa: 'planejar', cpf: '52998224725', codigo, senha: SENHA_A, aceitou_termos: true });
checa('código certo depois de esgotar as tentativas é recusado', certo.status === 400 && certo.j?.erro === 'codigo_invalido', `${certo.status} ${certo.j?.erro}`);
await sql(`delete from codigos_acesso where comprador_id='${idA}'`);
const vencido = await fn('auth-validar-codigo', { empresa: 'planejar', cpf: '52998224725', codigo, senha: SENHA_A, aceitou_termos: true });
const inexistente = await fn('auth-validar-codigo', { empresa: 'planejar', cpf: '11144477735', codigo, senha: SENHA_A, aceitou_termos: true });
checa('resposta igual sem código / CPF sem código (não revela cliente)', vencido.j?.erro === inexistente.j?.erro && vencido.status === inexistente.status, `${vencido.j?.erro} / ${inexistente.j?.erro}`);
checa('senha do comprador A não mudou com as tentativas', !!(await login('52998224725@comprador.planejar.local', SENHA_A)));

// ---------- valores ----------
const totalPago = (await rest('vw_resumo_contrato?select=total_pago', A)).j[0].total_pago;
const somaPagas = await sql(`select coalesce(sum(valor),0) from cobrancas where comprador_id='${idA}' and status_app='paga' and not removida`);
checa('total pago do resumo = soma do valor pago das parcelas', Number(totalPago) === Number(somaPagas), `${totalPago} vs ${somaPagas}`);
const recebido = await rest('rpc/recebido_no_mes', ADM, { method: 'POST', body: '{}' });
checa('recebido no mês (RPC) responde para a equipe', recebido.status === 200 && Number(recebido.j) >= 0, JSON.stringify(recebido.j));
const carteira = (await rest('vw_carteira?select=comprador_nome,status_acesso,deve_trocar_senha', ADM)).j;
checa('carteira traz deve_trocar_senha', Array.isArray(carteira) && carteira.every((l: any) => typeof l.deve_trocar_senha === 'boolean'));

// ---------- admin não troca slug nem ambiente do Asaas ----------
const slug = await rest('empresas?slug=eq.planejar', ADM, { method: 'PATCH', body: JSON.stringify({ slug: 'outra' }) });
checa('admin não altera o slug da empresa', slug.status >= 400, `${slug.status}`);
const amb = await rest('empresas?slug=eq.planejar', ADM, { method: 'PATCH', body: JSON.stringify({ asaas_ambiente: 'producao' }) });
checa('admin não altera o ambiente do Asaas', amb.status >= 400, `${amb.status}`);
const ok = await rest('empresas?slug=eq.planejar', ADM, { method: 'PATCH', body: JSON.stringify({ dias_aviso: [3, 0] }) });
checa('admin continua alterando os dias de aviso', ok.status === 200 && ok.j.length === 1, `${ok.status}`);

console.log(`\n${resultados.filter((r) => r.ok).length} passaram, ${resultados.filter((r) => !r.ok).length} falharam de ${resultados.length}`);
