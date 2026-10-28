/**
 * Primeiro acesso / esqueci a senha: envia um código de 6 dígitos ao WhatsApp
 * (ou e-mail) cadastrado. A resposta é sempre a mesma, exista o CPF ou não.
 */
import { cpfValido, ErroHttp, ipDaRequisicao, json, lerCorpo, servir, somenteDigitos } from '../_shared/http.ts';
import { canaisDisponiveis, enviarEmail, enviarWhatsapp, normalizarTelefone } from '../_shared/mensagens.ts';
import { admin } from '../_shared/supabase.ts';
import { hashCodigo } from '../_shared/codigo.ts';

interface Corpo {
  empresa?: string;
  cpf?: string;
  finalidade?: 'primeiro_acesso' | 'recuperar_senha';
  canal?: 'whatsapp' | 'email';
}

const VALIDADE_MIN = 10;

servir(async (req) => {
  const corpo = await lerCorpo<Corpo>(req);
  const cpf = somenteDigitos(corpo.cpf);
  const slug = typeof corpo.empresa === 'string' ? corpo.empresa : '';
  if (!cpfValido(cpf) || !slug) throw new ErroHttp(400, 'requisicao_invalida', 'Confira o CPF digitado.');

  const db = admin();
  const ip = ipDaRequisicao(req);
  const limites = await Promise.all([
    db.rpc('rate_limit_registrar', { p_chave: `codigo:ip:${ip}`, p_janela_segundos: 3600, p_limite: 20 }),
    db.rpc('rate_limit_registrar', { p_chave: `codigo:cpf:${slug}:${cpf}`, p_janela_segundos: 900, p_limite: 3 }),
    db.rpc('rate_limit_registrar', { p_chave: `codigo:cpf-dia:${slug}:${cpf}`, p_janela_segundos: 86400, p_limite: 10 }),
  ]);
  if (limites.some((l) => l.error)) throw limites.find((l) => l.error)!.error;
  if (limites.some((l) => l.data === false)) {
    throw new ErroHttp(429, 'muitas_tentativas', 'Muitas solicitações. Aguarde alguns minutos e tente de novo.');
  }

  // `automatico` diz se este ambiente envia código sozinho (WhatsApp/e-mail configurados).
  // É igual para qualquer CPF, então não revela se o CPF é cliente. Sem envio automático,
  // o app orienta a pedir a senha provisória à imobiliária.
  const disponiveis = canaisDisponiveis();
  const resposta = json({ ok: true, automatico: disponiveis.whatsapp || disponiveis.email });

  // O resto (achar o comprador, gravar e enviar) roda depois da resposta: assim o tempo de
  // resposta é o mesmo para CPF cadastrado ou não.
  const trabalho = gerarEEnviar(db, slug, cpf, corpo.canal, disponiveis).catch((e) => console.error('auth-solicitar-codigo', e));
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (runtime) runtime.waitUntil(trabalho);
  else await trabalho;
  return resposta;
});

async function gerarEEnviar(
  db: ReturnType<typeof admin>,
  slug: string,
  cpf: string,
  canalPedido: Corpo['canal'],
  disponiveis: ReturnType<typeof canaisDisponiveis>,
): Promise<void> {
  const { data: empresa } = await db.from('empresas').select('id, nome, textos').eq('slug', slug).maybeSingle();
  if (!empresa) return;
  const { data: comprador } = await db
    .from('compradores')
    .select('id, nome, telefone, email, status_acesso')
    .eq('empresa_id', empresa.id)
    .eq('cpf', cpf)
    .maybeSingle();
  if (!comprador || comprador.status_acesso === 'bloqueado') return;

  const podeWhats = disponiveis.whatsapp && !!normalizarTelefone(comprador.telefone);
  const podeEmail = disponiveis.email && !!comprador.email;
  const canal = canalPedido === 'email' && podeEmail ? 'email' : podeWhats ? 'whatsapp' : podeEmail ? 'email' : null;
  if (!canal) {
    console.warn(`comprador ${comprador.id} sem canal para receber código`);
    return;
  }

  const codigo = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, '0');
  // um código válido por vez
  await db.from('codigos_acesso').delete().eq('comprador_id', comprador.id).is('usado_em', null);
  const { error } = await db.from('codigos_acesso').insert({
    empresa_id: empresa.id,
    comprador_id: comprador.id,
    codigo_hash: await hashCodigo(comprador.id, codigo),
    canal,
    expira_em: new Date(Date.now() + VALIDADE_MIN * 60_000).toISOString(),
  });
  if (error) throw error;

  const textos = (empresa.textos ?? {}) as Record<string, string>;
  const texto = (textos.mensagem_codigo ??
    '{empresa}: seu código de acesso ao app é {codigo}. Ele vale por {minutos} minutos. Não compartilhe com ninguém.')
    .replaceAll('{empresa}', empresa.nome)
    .replaceAll('{codigo}', codigo)
    .replaceAll('{minutos}', String(VALIDADE_MIN))
    .replaceAll('{nome}', comprador.nome.split(' ')[0] ?? '');

  try {
    if (canal === 'whatsapp') await enviarWhatsapp(comprador.telefone!, texto);
    else await enviarEmail(comprador.email!, `Seu código de acesso · ${empresa.nome}`, texto);
  } catch (e) {
    // não revela a falha para quem pediu; fica no log para a equipe
    console.error(`falha ao enviar código (${canal}) para comprador ${comprador.id}`, e);
  }
}
