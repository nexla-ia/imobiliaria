/**
 * Painel: gera uma senha provisória para o comprador e devolve a mensagem de convite
 * pronta, com o link para abrir o WhatsApp da imobiliária. Serve também para
 * "esqueci a senha": gera outra provisória.
 *
 * Login = CPF; senha = provisória aleatória (não é derivada de nome nem CPF, que estão
 * impressos no boleto). Enquanto ela não for trocada no app, a RLS não mostra nada
 * (compradores.deve_trocar_senha). Vale 30 dias. Decisão de 2026-10-28 no CLAUDE.md.
 */
import { emailDoComprador } from '../_shared/codigo.ts';
import { ErroHttp, json, lerCorpo, servir } from '../_shared/http.ts';
import { canaisDisponiveis, enviarWhatsapp, normalizarTelefone } from '../_shared/mensagens.ts';
import { admin, exigirEquipe, registrarAuditoria } from '../_shared/supabase.ts';

const VALIDADE_DIAS = 30;
// sem 0/O, 1/I/L, para ninguém confundir ao digitar
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function gerarSenha(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const c = Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

const MENSAGEM_PADRAO =
  'Olá, {nome}! A {empresa} agora tem um app para você acompanhar suas parcelas e pegar boleto ou Pix quando quiser.\n' +
  '{links}\n\n' +
  'Para entrar, use seu CPF e esta senha provisória: *{senha}*\n' +
  'No primeiro acesso o app pede para você criar uma senha nova. A senha provisória vale por {dias} dias.';

servir(async (req) => {
  const equipe = await exigirEquipe(req);
  const { comprador_id, enviar_automatico } = await lerCorpo<{ comprador_id?: string; enviar_automatico?: boolean }>(req);
  const db = admin();

  const [{ data: comprador }, { data: empresa }] = await Promise.all([
    db.from('compradores').select('id, nome, cpf, telefone, auth_user_id, status_acesso')
      .eq('id', comprador_id ?? '').eq('empresa_id', equipe.empresa_id).maybeSingle(),
    db.from('empresas').select('slug, nome, textos').eq('id', equipe.empresa_id).single(),
  ]);
  if (!comprador || !empresa) throw new ErroHttp(404, 'nao_encontrado', 'Comprador não encontrado.');
  if (comprador.status_acesso === 'bloqueado') {
    throw new ErroHttp(409, 'requisicao_invalida', 'Desbloqueie o acesso antes de enviar o convite.');
  }

  const senha = gerarSenha();
  let authUserId = comprador.auth_user_id as string | null;
  if (authUserId) {
    const { error } = await db.auth.admin.updateUserById(authUserId, { password: senha });
    if (error) throw error;
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email: emailDoComprador(comprador.cpf, empresa.slug),
      password: senha,
      email_confirm: true,
      app_metadata: { papel: 'comprador', comprador_id: comprador.id, empresa_id: equipe.empresa_id },
    });
    if (error) throw error;
    authUserId = data.user.id;
  }

  const expira = new Date(Date.now() + VALIDADE_DIAS * 86_400_000);
  const { error: erroComprador } = await db
    .from('compradores')
    .update({
      auth_user_id: authUserId,
      status_acesso: 'ativo',
      deve_trocar_senha: true,
      senha_provisoria_expira_em: expira.toISOString(),
      excluido_em: null,
    })
    .eq('id', comprador.id);
  if (erroComprador) throw erroComprador;

  const textos = (empresa.textos ?? {}) as Record<string, string>;
  const links = [textos.link_android && `Android: ${textos.link_android}`, textos.link_ios && `iPhone: ${textos.link_ios}`]
    .filter(Boolean)
    .join('\n');
  const mensagem = (textos.mensagem_convite || MENSAGEM_PADRAO)
    .replaceAll('{nome}', comprador.nome.split(' ')[0] ?? '')
    .replaceAll('{empresa}', empresa.nome)
    .replaceAll('{links}', links || 'Procure pelo app da imobiliária na loja do seu celular.')
    .replaceAll('{senha}', senha)
    .replaceAll('{dias}', String(VALIDADE_DIAS));
  // se o texto personalizado esqueceu a senha, ela vai no fim (sem ela o convite não serve)
  const mensagemFinal = mensagem.includes(senha) ? mensagem : `${mensagem}\n\nSenha provisória: ${senha}`;

  const telefone = normalizarTelefone(comprador.telefone);
  let enviado = false;
  if (enviar_automatico && telefone && canaisDisponiveis().whatsapp) {
    try {
      await enviarWhatsapp(telefone, mensagemFinal);
      enviado = true;
    } catch (e) {
      console.error('convite automático falhou', e);
    }
  }

  // nunca grava a senha no log
  await registrarAuditoria(equipe.empresa_id, equipe.auth_user_id, 'gerar_senha_provisoria', 'compradores', comprador.id, {
    expira_em: expira.toISOString(),
    enviado_automatico: enviado,
  });

  return json({
    senha,
    expira_em: expira.toISOString(),
    mensagem: mensagemFinal,
    link_whatsapp: telefone ? `https://wa.me/${telefone}?text=${encodeURIComponent(mensagemFinal)}` : null,
    enviado_automatico: enviado,
    automatico_disponivel: canaisDisponiveis().whatsapp && !!telefone,
  });
});
