/**
 * Painel (só admin): cria o login de um membro da equipe com senha provisória.
 * O admin repassa a senha; a pessoa troca no primeiro acesso ao painel.
 */
import { ErroHttp, json, lerCorpo, servir } from '../_shared/http.ts';
import { admin, buscarUsuarioPorEmail, exigirEquipe, registrarAuditoria } from '../_shared/supabase.ts';

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
  let userId = data?.user?.id ?? null;
  let criado = !!userId;
  if (error) {
    if (!/already|registered|exists/i.test(error.message)) throw error;
    // e-mail já tem login: pode ser alguém removido da equipe antes. Comprador nunca vira equipe.
    userId = await buscarUsuarioPorEmail(db, email);
    if (!userId) throw error;
    const [{ data: naEquipe }, { data: comprador }] = await Promise.all([
      db.from('usuarios_admin').select('id').eq('auth_user_id', userId).maybeSingle(),
      db.from('compradores').select('id').eq('auth_user_id', userId).maybeSingle(),
    ]);
    if (naEquipe || comprador) throw new ErroHttp(409, 'requisicao_invalida', 'Já existe um usuário com este e-mail.');
    const { error: erroSenha } = await db.auth.admin.updateUserById(userId, { password: senha, user_metadata: { nome, trocar_senha: true } });
    if (erroSenha) throw erroSenha;
    criado = false;
  }

  const { error: erroEquipe } = await db
    .from('usuarios_admin')
    .insert({ auth_user_id: userId, empresa_id: equipe.empresa_id, nome, papel });
  if (erroEquipe) {
    if (criado) await db.auth.admin.deleteUser(userId!);
    throw erroEquipe;
  }

  await registrarAuditoria(equipe.empresa_id, equipe.auth_user_id, 'adicionar', 'usuarios_admin', userId, { email, papel });
  return json({ ok: true });
});
