import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Armazenamento da sessão do Supabase no cofre do aparelho (Keychain / Keystore).
 * O SecureStore pode recusar valores grandes em alguns iOS (~2 KB) e a sessão passa
 * disso, então o valor é dividido em pedaços.
 */
const TAMANHO = 1800;
const chaveSegura = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

async function remover(chave: string) {
  const base = chaveSegura(chave);
  const qtd = Number(await SecureStore.getItemAsync(`${base}.n`)) || 0;
  await Promise.all([
    SecureStore.deleteItemAsync(`${base}.n`),
    ...Array.from({ length: qtd }, (_, i) => SecureStore.deleteItemAsync(`${base}.${i}`)),
  ]);
}

export const armazenamentoSeguro = {
  async getItem(chave: string): Promise<string | null> {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(chave) ?? null;
    const base = chaveSegura(chave);
    const qtd = Number(await SecureStore.getItemAsync(`${base}.n`));
    if (!qtd) return null;
    const partes = await Promise.all(Array.from({ length: qtd }, (_, i) => SecureStore.getItemAsync(`${base}.${i}`)));
    return partes.some((p) => p == null) ? null : partes.join('');
  },
  async setItem(chave: string, valor: string): Promise<void> {
    if (Platform.OS === 'web') return globalThis.localStorage?.setItem(chave, valor);
    await remover(chave);
    const base = chaveSegura(chave);
    const partes = valor.match(new RegExp(`[\\s\\S]{1,${TAMANHO}}`, 'g')) ?? [''];
    await Promise.all(partes.map((p, i) => SecureStore.setItemAsync(`${base}.${i}`, p)));
    await SecureStore.setItemAsync(`${base}.n`, String(partes.length));
  },
  async removeItem(chave: string): Promise<void> {
    if (Platform.OS === 'web') return globalThis.localStorage?.removeItem(chave);
    await remover(chave);
  },
};
