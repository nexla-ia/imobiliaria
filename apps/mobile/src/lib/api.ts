import type { ErroApi } from '@planejar/shared';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

export class ErroDaApi extends Error {
  readonly codigo: string;
  constructor(codigo: string, mensagem: string) {
    super(mensagem);
    this.codigo = codigo;
  }
}

/** Chama uma Edge Function e converte erros em mensagens prontas para a tela. */
export async function chamar<T>(funcao: string, corpo: object = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(funcao, { body: corpo });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const detalhe = (await error.context.json().catch(() => null)) as ErroApi | null;
      if (detalhe?.mensagem) throw new ErroDaApi(detalhe.erro, detalhe.mensagem);
    }
    throw new ErroDaApi('sem_conexao', 'Sem conexão com a internet. Confira e tente de novo.');
  }
  return data as T;
}

export function mensagemDeErro(e: unknown): string {
  if (e instanceof ErroDaApi) return e.message;
  return 'Algo deu errado. Tente de novo em instantes.';
}

export function exigir<T = unknown>(resultado: { data: unknown; error: unknown }): T {
  if (resultado.error) throw resultado.error;
  return resultado.data as T;
}
