/**
 * App: no primeiro acesso com a senha provisória, o comprador cria a senha dele
 * (e aceita os termos, se ainda não aceitou). Só depois disso a RLS libera os dados.
 */
import { ErroHttp, json, lerCorpo, servir } from '../_shared/http.ts';
import { admin, exigirUsuario } from '../_shared/supabase.ts';

servir(async (req) => {
  const user = await exigirUsuario(req);
  const { senha, aceitou_termos } = await lerCorpo<{ senha?: string; aceitou_termos?: boolean }>(req);
  const db = admin();

  const { data: comprador } = await db
    .from('compradores')
    .select('id, status_acesso, deve_trocar_senha, senha_provisoria_expira_em, termos_aceitos_em, ativado_em')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!comprador || comprador.status_acesso !== 'ativo') {
    throw new ErroHttp(403, 'sem_permissao', 'Seu acesso está suspenso. Fale com a imobiliária.');
  }
  if (!comprador.deve_trocar_senha) throw new ErroHttp(409, 'requisicao_invalida', 'Sua senha já foi definida.');
  if (comprador.senha_provisoria_expira_em && new Date(comprador.senha_provisoria_expira_em) < new Date()) {
    throw new ErroHttp(400, 'codigo_expirado', 'Sua senha provisória expirou. Peça uma nova à imobiliária.');
  }
  if (typeof senha !== 'string' || senha.length < 8 || senha.length > 72) {
    throw new ErroHttp(400, 'senha_fraca', 'A senha precisa ter de 8 a 72 caracteres.');
  }
  if (!comprador.termos_aceitos_em && aceitou_termos !== true) {
    throw new ErroHttp(400, 'termos_obrigatorios', 'Para continuar, aceite os Termos de uso e a Política de privacidade.');
  }

  const { error } = await db.auth.admin.updateUserById(user.id, { password: senha });
  if (error) {
    if (/different|same/i.test(error.message)) throw new ErroHttp(400, 'senha_fraca', 'Escolha uma senha diferente da provisória.');
    throw error;
  }

  const agora = new Date().toISOString();
  const { error: erroComprador } = await db
    .from('compradores')
    .update({
      deve_trocar_senha: false,
      senha_provisoria_expira_em: null,
      ativado_em: comprador.ativado_em ?? agora,
      termos_aceitos_em: comprador.termos_aceitos_em ?? agora,
    })
    .eq('id', comprador.id);
  if (erroComprador) throw erroComprador;

  return json({ ok: true });
});
