/**
 * Exclusão de conta pelo próprio comprador (exigência da Apple e da LGPD).
 * Apaga o login, os aparelhos e as notificações. O contrato e as parcelas continuam
 * com a imobiliária: excluir o app não cancela a compra.
 */
import { json, servir } from '../_shared/http.ts';
import { admin, exigirComprador, registrarAuditoria } from '../_shared/supabase.ts';

servir(async (req) => {
  const comprador = await exigirComprador(req);
  const db = admin();

  const { error } = await db.rpc('comprador_excluir_conta', { p_comprador_id: comprador.id });
  if (error) throw error;
  const { error: erroAuth } = await db.auth.admin.deleteUser(comprador.auth_user_id);
  if (erroAuth) throw erroAuth;

  await registrarAuditoria(comprador.empresa_id, null, 'excluir_conta', 'compradores', comprador.id, {});
  return json({ ok: true });
});
