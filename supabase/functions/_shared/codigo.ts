/** Hash do código de acesso. O sal é o id do comprador; a proteção real é o limite de 5 tentativas. */
export async function hashCodigo(compradorId: string, codigo: string): Promise<string> {
  const pimenta = Deno.env.get('CODIGO_PEPPER') ?? '';
  const bytes = new TextEncoder().encode(`${compradorId}:${codigo}:${pimenta}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** E-mail sintético do comprador no Supabase Auth (decisão de 2026-10-23 no CLAUDE.md). */
export function emailDoComprador(cpf: string, empresaSlug: string): string {
  return `${cpf}@comprador.${empresaSlug}.local`;
}
