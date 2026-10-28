import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.118.0';
import { ErroHttp, iguaisSeguro } from './http.ts';

export type Admin = SupabaseClient;

let cliente: Admin | null = null;

/** Cliente com service_role: ignora RLS. Só usar depois de checar quem está chamando. */
export function admin(): Admin {
  cliente ??= createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cliente;
}

export async function exigirUsuario(req: Request): Promise<User> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new ErroHttp(401, 'nao_autenticado', 'Faça login para continuar.');
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new ErroHttp(401, 'nao_autenticado', 'Sua sessão expirou. Entre de novo.');
  return data.user;
}

export interface CompradorAtual {
  id: string;
  empresa_id: string;
  nome: string;
  cpf: string;
  auth_user_id: string;
}

export async function exigirComprador(req: Request): Promise<CompradorAtual> {
  const user = await exigirUsuario(req);
  const { data, error } = await admin()
    .from('compradores')
    .select('id, empresa_id, nome, cpf, auth_user_id, status_acesso, deve_trocar_senha')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroHttp(403, 'sem_permissao', 'Acesso permitido só para compradores.');
  if (data.status_acesso !== 'ativo') {
    throw new ErroHttp(403, 'sem_permissao', 'Seu acesso está bloqueado. Fale com a imobiliária.');
  }
  // com a senha provisória ainda não trocada, nada além de conta-definir-senha (mesma regra da RLS)
  if (data.deve_trocar_senha) {
    throw new ErroHttp(403, 'sem_permissao', 'Crie sua senha no app antes de continuar.');
  }
  return data as CompradorAtual;
}

export interface MembroEquipe {
  auth_user_id: string;
  empresa_id: string;
  nome: string;
  papel: 'admin' | 'operador';
}

export async function exigirEquipe(req: Request, papel?: 'admin'): Promise<MembroEquipe> {
  const user = await exigirUsuario(req);
  const { data, error } = await admin()
    .from('usuarios_admin')
    .select('auth_user_id, empresa_id, nome, papel')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroHttp(403, 'sem_permissao', 'Acesso permitido só para a equipe da imobiliária.');
  if (papel === 'admin' && data.papel !== 'admin') {
    throw new ErroHttp(403, 'sem_permissao', 'Só administradores podem fazer isso.');
  }
  return data as MembroEquipe;
}

/** Chamadas do pg_cron trazem o header x-cron-secret igual ao secret CRON_SECRET. */
export function chamadaDoCron(req: Request): boolean {
  const esperado = Deno.env.get('CRON_SECRET');
  const recebido = req.headers.get('x-cron-secret');
  return !!esperado && !!recebido && iguaisSeguro(recebido, esperado);
}

export async function registrarAuditoria(
  empresaId: string,
  atorId: string | null,
  acao: string,
  entidade: string,
  entidadeId: string | null,
  dados: Record<string, unknown> = {},
) {
  const { error } = await admin().from('audit_log').insert({
    empresa_id: empresaId,
    ator_id: atorId,
    acao,
    entidade,
    entidade_id: entidadeId,
    dados,
  });
  if (error) console.error('audit_log', error);
}

/** Procura um usuário do Auth pelo e-mail (para reaproveitar logins que sobraram). */
export async function buscarUsuarioPorEmail(db: Admin, email: string): Promise<string | null> {
  const alvo = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const achado = data.users.find((u) => u.email?.toLowerCase() === alvo);
    if (achado) return achado.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}
