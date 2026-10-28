/**
 * Confere o código de 6 dígitos e define a senha do comprador.
 * Cria o login no Supabase Auth no primeiro acesso; depois, só troca a senha.
 */
import { cpfValido, ErroHttp, iguaisSeguro, ipDaRequisicao, json, lerCorpo, servir, somenteDigitos } from '../_shared/http.ts';
import { admin } from '../_shared/supabase.ts';
import { emailDoComprador, hashCodigo } from '../_shared/codigo.ts';

interface Corpo {
  empresa?: string;
  cpf?: string;
  codigo?: string;
  senha?: string;
  aceitou_termos?: boolean;
}

const MAX_TENTATIVAS = 5;

servir(async (req) => {
  const corpo = await lerCorpo<Corpo>(req);
  const cpf = somenteDigitos(corpo.cpf);
  const codigo = somenteDigitos(corpo.codigo);
  const slug = typeof corpo.empresa === 'string' ? corpo.empresa : '';
  const senha = typeof corpo.senha === 'string' ? corpo.senha : '';
  if (!cpfValido(cpf) || !slug || codigo.length !== 6) {
    throw new ErroHttp(400, 'requisicao_invalida', 'Confira o CPF e o código.');
  }
  if (senha.length < 8 || senha.length > 72) {
    throw new ErroHttp(400, 'senha_fraca', 'A senha precisa ter de 8 a 72 caracteres.');
  }

  const db = admin();
  const { data: ok, error: erroLimite } = await db.rpc('rate_limit_registrar', {
    p_chave: `validar:ip:${ipDaRequisicao(req)}`,
    p_janela_segundos: 3600,
    p_limite: 30,
  });
  if (erroLimite) throw erroLimite;
  if (!ok) throw new ErroHttp(429, 'muitas_tentativas', 'Muitas tentativas. Aguarde um pouco e tente de novo.');

  // CPF inexistente, código vencido e tentativas esgotadas dão a mesma resposta:
  // assim a validação não revela se o CPF é cliente.
  const invalido = () => new ErroHttp(400, 'codigo_invalido', 'Código incorreto ou vencido. Confira ou peça um novo código.');

  const { data: dentroCpf, error: erroCpf } = await db.rpc('rate_limit_registrar', {
    p_chave: `validar:cpf:${slug}:${cpf}`,
    p_janela_segundos: 3600,
    p_limite: 10,
  });
  if (erroCpf) throw erroCpf;
  if (!dentroCpf) throw new ErroHttp(429, 'muitas_tentativas', 'Muitas tentativas. Aguarde um pouco e tente de novo.');

  const { data: empresa } = await db.from('empresas').select('id, slug').eq('slug', slug).maybeSingle();
  if (!empresa) throw invalido();
  const { data: comprador } = await db
    .from('compradores')
    .select('id, empresa_id, auth_user_id, status_acesso, termos_aceitos_em, ativado_em')
    .eq('empresa_id', empresa.id)
    .eq('cpf', cpf)
    .maybeSingle();
  if (!comprador || comprador.status_acesso === 'bloqueado') throw invalido();

  const { data: registro } = await db
    .from('codigos_acesso')
    .select('id, codigo_hash, expira_em, tentativas')
    .eq('comprador_id', comprador.id)
    .is('usado_em', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!registro || new Date(registro.expira_em) < new Date()) throw invalido();
  // conta a tentativa ANTES de comparar e de forma atômica: chamadas em paralelo não furam o limite
  const { data: tentativa, error: erroTentativa } = await db.rpc('codigo_registrar_tentativa', { p_id: registro.id });
  if (erroTentativa) throw erroTentativa;
  if ((tentativa as number) > MAX_TENTATIVAS) throw invalido();
  if (!iguaisSeguro(await hashCodigo(comprador.id, codigo), registro.codigo_hash)) throw invalido();

  if (!comprador.termos_aceitos_em && corpo.aceitou_termos !== true) {
    throw new ErroHttp(400, 'termos_obrigatorios', 'Para continuar, aceite os Termos de uso e a Política de privacidade.');
  }

  const email = emailDoComprador(cpf, empresa.slug);
  let authUserId = comprador.auth_user_id as string | null;
  if (authUserId) {
    // e-mail junto: se o CPF foi corrigido no painel, o login segue o CPF atual
    const { error } = await db.auth.admin.updateUserById(authUserId, { password: senha, email, email_confirm: true });
    if (error) throw error;
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      app_metadata: { papel: 'comprador', comprador_id: comprador.id, empresa_id: comprador.empresa_id },
    });
    if (error) throw error;
    authUserId = data.user.id;
  }

  const agora = new Date().toISOString();
  await db.from('codigos_acesso').update({ usado_em: agora }).eq('id', registro.id);
  const { error: erroComprador } = await db
    .from('compradores')
    .update({
      auth_user_id: authUserId,
      status_acesso: 'ativo',
      deve_trocar_senha: false,
      senha_provisoria_expira_em: null,
      ativado_em: comprador.ativado_em ?? agora,
      termos_aceitos_em: comprador.termos_aceitos_em ?? agora,
      excluido_em: null,
    })
    .eq('id', comprador.id);
  if (erroComprador) throw erroComprador;

  return json({ ok: true, email_login: email });
});
