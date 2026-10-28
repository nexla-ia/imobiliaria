/**
 * Painel (só admin): cria o login de um membro da equipe com senha provisória.
 * O admin repassa a senha; a pessoa troca no primeiro acesso ao painel.
 */
import { ErroHttp, json, lerCorpo, servir } from '../_shared/http.ts';
import { admin, exigirEquipe, registrarAuditoria } from '../_shared/supabase.ts';

interface Corpo {
  nome?: string;
  email?: string;
  papel?: 'admin' | 'operador';
  senha_provisoria?: string;
}

servir(async (req) => {
  const equipe = await exigirEquipe(req, 'admin');
  const corpo = await lerCorpo<Corpo>(req);
  const nome = corpo.nome?.trim() ?? '';
  const email = corpo.email?.trim().toLowerCase() ?? '';
  const papel = corpo.papel === 'admin' ? 'admin' : 'operador';
  const senha = corpo.senha_provisoria ?? '';
  if (!nome || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ErroHttp(400, 'requisicao_invalida', 'Informe nome e e-mail válidos.');
  }
  if (senha.length < 8) throw new ErroHttp(400, 'senha_fraca', 'A senha provisória precisa ter pelo menos 8 caracteres.');

  const db = admin();
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    app_metadata: { papel: 'equipe', empresa_id: equipe.empresa_id },
    user_metadata: { nome, trocar_senha: true },
  });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      throw new ErroHttp(409, 'requisicao_invalida', 'Já existe um usuário com este e-mail.');
    }
    throw error;
  }

  const { error: erroEquipe } = await db
    .from('usuarios_admin')
    .insert({ auth_user_id: data.user.id, empresa_id: equipe.empresa_id, nome, papel });
  if (erroEquipe) {
    await db.auth.admin.deleteUser(data.user.id);
    throw erroEquipe;
  }

  await registrarAuditoria(equipe.empresa_id, equipe.auth_user_id, 'adicionar', 'usuarios_admin', data.user.id, { email, papel });
  return json({ ok: true });
});
