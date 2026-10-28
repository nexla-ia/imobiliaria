/**
 * Envio de mensagens fora do app: WhatsApp (Evolution API da Nexla) e e-mail (Resend).
 * Os dois são opcionais por ambiente; quem chama decide o canal com canaisDisponiveis().
 */

export type Canal = 'whatsapp' | 'email';

export function canaisDisponiveis(): Record<Canal, boolean> {
  return {
    whatsapp: !!(Deno.env.get('EVOLUTION_API_URL') && Deno.env.get('EVOLUTION_API_KEY') && Deno.env.get('EVOLUTION_INSTANCE')),
    email: !!(Deno.env.get('RESEND_API_KEY') && Deno.env.get('EMAIL_REMETENTE')),
  };
}

/** Número só com dígitos e com DDI 55. */
export function normalizarTelefone(telefone: string | null | undefined): string | null {
  const d = (telefone ?? '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return null;
}

export async function enviarWhatsapp(telefone: string, texto: string): Promise<void> {
  const numero = normalizarTelefone(telefone);
  if (!numero) throw new Error('Telefone inválido para WhatsApp');
  const base = Deno.env.get('EVOLUTION_API_URL')!.replace(/\/$/, '');
  const instancia = encodeURIComponent(Deno.env.get('EVOLUTION_INSTANCE')!);
  // Evolution API v2: { number, text }
  const resp = await fetch(`${base}/message/sendText/${instancia}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: Deno.env.get('EVOLUTION_API_KEY')! },
    body: JSON.stringify({ number: numero, text: texto }),
  });
  // o corpo da resposta pode repetir a mensagem enviada (senha/código): não vai para o log
  if (!resp.ok) throw new Error(`Evolution API respondeu ${resp.status}`);
}

export async function enviarEmail(para: string, assunto: string, texto: string): Promise<void> {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}` },
    body: JSON.stringify({ from: Deno.env.get('EMAIL_REMETENTE'), to: [para], subject: assunto, text: texto }),
  });
  if (!resp.ok) throw new Error(`Resend respondeu ${resp.status}`);
}
