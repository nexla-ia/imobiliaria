import { somenteDigitos } from './format';

/**
 * E-mail sintético do comprador no Supabase Auth (decisão de 2026-10-23 no CLAUDE.md).
 * Precisa ficar igual a emailDoComprador() em supabase/functions/_shared/codigo.ts.
 */
export function emailDoComprador(cpf: string, empresaSlug: string): string {
  return `${somenteDigitos(cpf)}@comprador.${empresaSlug}.local`;
}

export const SENHA_MINIMA = 8;
