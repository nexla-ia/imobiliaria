import { somenteDigitos } from '@planejar/shared';

/** "(65) 9 9937-3761" → "5565999373761". Devolve null se não for um celular/fixo brasileiro. */
export function normalizarTelefone(texto: string): string | null {
  const d = somenteDigitos(texto);
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return null;
}
