/** Utilidades HTTP comuns a todas as Edge Functions. */

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export class ErroHttp extends Error {
  constructor(readonly status: number, readonly codigo: string, mensagem: string) {
    super(mensagem);
  }
}

export function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function lerCorpo<T>(req: Request): Promise<T> {
  try {
    const corpo = await req.json();
    if (corpo && typeof corpo === 'object') return corpo as T;
  } catch {
    // cai no erro abaixo
  }
  throw new ErroHttp(400, 'requisicao_invalida', 'Corpo da requisição inválido.');
}

/** Envolve o handler: CORS, só POST, e erros viram { erro, mensagem }. */
export function servir(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ erro: 'requisicao_invalida', mensagem: 'Use POST.' }, 405);
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof ErroHttp) return json({ erro: e.codigo, mensagem: e.message }, e.status);
      console.error(e);
      return json({ erro: 'erro_interno', mensagem: 'Erro inesperado. Tente de novo em instantes.' }, 500);
    }
  });
}

export function ipDaRequisicao(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'desconhecido';
}

/** Comparação em tempo constante para tokens e segredos. */
export function iguaisSeguro(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let dif = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) dif |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return dif === 0;
}

export function somenteDigitos(texto: unknown): string {
  return typeof texto === 'string' ? texto.replace(/\D/g, '') : '';
}

export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (base: string, peso: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (peso - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(cpf.slice(0, 9), 10) === Number(cpf[9]) && digito(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');
}

/** "2026-10-20" → "20/10/2026" */
export function formatarData(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** Data de hoje (AAAA-MM-DD) no fuso informado, somada de N dias. */
export function dataNoFuso(fuso: string, somarDias = 0): string {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
  const [a, m, d] = partes.split('-').map(Number);
  const alvo = new Date(Date.UTC(a!, m! - 1, d! + somarDias));
  return alvo.toISOString().slice(0, 10);
}
