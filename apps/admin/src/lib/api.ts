import type { ErroApi } from '@planejar/shared';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** Erro de uma Edge Function com a mensagem já pronta para mostrar na tela. */
export class ErroDaApi extends Error {
  readonly codigo: string;
  constructor(codigo: string, mensagem: string) {
    super(mensagem);
    this.codigo = codigo;
  }
}

export async function chamar<T>(funcao: string, corpo: object = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(funcao, { body: corpo });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const detalhe = (await error.context.json().catch(() => null)) as ErroApi | null;
      if (detalhe?.mensagem) throw new ErroDaApi(detalhe.erro, detalhe.mensagem);
    }
    throw new ErroDaApi('erro_interno', 'Não foi possível falar com o servidor. Verifique sua conexão.');
  }
  return data as T;
}

export function mensagemDeErro(e: unknown): string {
  if (e instanceof ErroDaApi) return e.message;
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') {
    if (/duplicate key|unique/i.test(e.message)) return 'Já existe um registro com esses dados.';
    if (/row-level security|permission denied/i.test(e.message)) return 'Você não tem permissão para fazer isso.';
    return e.message;
  }
  return 'Algo deu errado. Tente de novo.';
}

/**
 * Lança o erro do Supabase, se houver, e devolve os dados.
 * O cliente não tem os tipos gerados do banco ainda, então quem chama informa o tipo com `as`.
 */
export function exigir<T = unknown>(resultado: { data: unknown; error: unknown }): T {
  if (resultado.error) throw resultado.error;
  return resultado.data as T;
}

/** Busca todas as linhas, de 1000 em 1000 (limite da API). A consulta precisa ter ordem estável. */
export async function buscarTodos<T>(pagina: (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += 1000) {
    const lote = exigir<T[]>(await pagina(de, de + 999)) ?? [];
    todas.push(...lote);
    if (lote.length < 1000) return todas;
  }
}
