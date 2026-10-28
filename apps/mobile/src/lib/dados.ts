/** Consultas do app (React Query). Tudo passa pela RLS: o comprador só recebe o que é dele. */
import type { Cobranca, Contrato, Documento, Empreendimento, Imovel, Notificacao, ResumoContrato } from '@planejar/shared';
import { useQuery } from '@tanstack/react-query';
import { exigir } from './api';
import { useSessao } from './sessao';
import { supabase } from './supabase';

export type ContratoCompleto = Contrato & {
  imoveis: Imovel & { empreendimentos: Empreendimento | null };
  resumo: ResumoContrato | null;
};

export function useContratos() {
  const { comprador } = useSessao();
  return useQuery({
    queryKey: ['contratos', comprador?.id],
    enabled: !!comprador,
    queryFn: async () => {
      const [contratos, resumos] = await Promise.all([
        supabase.from('contratos').select('*, imoveis(*, empreendimentos(*))').order('created_at'),
        supabase.from('vw_resumo_contrato').select('*'),
      ]);
      const lista = exigir<Array<Omit<ContratoCompleto, 'resumo'>>>(contratos);
      const rs = exigir<ResumoContrato[]>(resumos);
      return lista.map((c) => ({ ...c, resumo: rs.find((r) => r.contrato_id === c.id) ?? null }));
    },
  });
}

/** Todas as cobranças visíveis do comprador, em ordem de parcela/vencimento. */
export function useCobrancas() {
  const { comprador } = useSessao();
  return useQuery({
    queryKey: ['cobrancas', comprador?.id],
    enabled: !!comprador,
    queryFn: async () =>
      exigir<Cobranca[]>(
        await supabase
          .from('cobrancas')
          .select('*')
          .order('numero_parcela', { ascending: true, nullsFirst: false })
          .order('vencimento'),
      ).map((c) => ({
        ...c,
        valor: Number(c.valor),
        valor_original: c.valor_original == null ? null : Number(c.valor_original),
        valor_juros: c.valor_juros == null ? null : Number(c.valor_juros),
      })),
  });
}

export function useNotificacoes() {
  const { comprador } = useSessao();
  return useQuery({
    queryKey: ['notificacoes', comprador?.id],
    enabled: !!comprador,
    queryFn: async () =>
      exigir<Notificacao[]>(await supabase.from('notificacoes').select('*').order('created_at', { ascending: false }).limit(100)),
  });
}

export function useDocumentos() {
  const { comprador } = useSessao();
  return useQuery({
    queryKey: ['documentos', comprador?.id],
    enabled: !!comprador,
    queryFn: async () => exigir<Documento[]>(await supabase.from('documentos').select('*').order('created_at', { ascending: false })),
  });
}

export function useFotosImovel(imovelId: string | undefined) {
  return useQuery({
    queryKey: ['fotos', imovelId],
    enabled: !!imovelId,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const fotos = exigir<Array<{ storage_path: string }>>(
        await supabase.from('imovel_fotos').select('storage_path').eq('imovel_id', imovelId!).order('ordem'),
      );
      if (!fotos.length) return [];
      const { data } = await supabase.storage.from('imoveis').createSignedUrls(fotos.map((f) => f.storage_path), 3600);
      return (data ?? []).map((d) => d.signedUrl).filter(Boolean) as string[];
    },
  });
}

export async function abrirDocumentoUrl(caminho: string): Promise<string> {
  const { data, error } = await supabase.storage.from('documentos').createSignedUrl(caminho, 600);
  if (error || !data) throw error ?? new Error('sem url');
  return data.signedUrl;
}
