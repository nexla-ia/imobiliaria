import { linkWhatsapp, formatarCpf, type Cobranca, type Empresa, type Comprador } from '@planejar/shared';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { useCobrancas, useContratos, type ContratoCompleto } from './dados';

/** Contrato (imóvel) escolhido no seletor do Início; vale para todas as abas. */
const Contexto = createContext<{ contratoId: string | null; escolher: (id: string) => void } | null>(null);

export function ProvedorImovelAtual({ children }: { children: ReactNode }) {
  const [contratoId, escolher] = useState<string | null>(null);
  return <Contexto.Provider value={{ contratoId, escolher }}>{children}</Contexto.Provider>;
}

export function useImovelAtual() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useImovelAtual fora do provedor');
  const contratos = useContratos();
  const cobrancas = useCobrancas();
  const lista = contratos.data ?? [];
  const contrato: ContratoCompleto | null = lista.find((c) => c.id === ctx.contratoId) ?? lista[0] ?? null;
  const parcelas = (cobrancas.data ?? []).filter((c) => c.contrato_id === contrato?.id);
  const avulsas = (cobrancas.data ?? []).filter((c) => !c.contrato_id);
  return {
    contratos,
    cobrancas,
    lista,
    contrato,
    parcelas,
    avulsas,
    escolher: ctx.escolher,
    carregando: contratos.isLoading || cobrancas.isLoading,
    erro: contratos.error || cobrancas.error,
    recarregar: () => Promise.all([contratos.refetch(), cobrancas.refetch()]),
  };
}

/** Próxima a pagar: a vencida mais antiga, senão a em aberto mais próxima. */
export function proximaParcela(parcelas: Cobranca[]): Cobranca | null {
  const abertas = parcelas
    .filter((p) => p.status_app === 'vencida' || p.status_app === 'em_aberto')
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  return abertas[0] ?? null;
}

export function linkAtendimento(empresa: Empresa, comprador: Comprador, imovel?: string | null): string | null {
  if (!empresa.whatsapp_atendimento) return null;
  const modelo =
    empresa.textos?.mensagem_whatsapp ??
    'Olá! Sou {nome} (CPF {cpf}){imovel_frase}. Vim pelo app e preciso de ajuda.';
  const texto = modelo
    .replaceAll('{nome}', comprador.nome)
    .replaceAll('{cpf}', formatarCpf(comprador.cpf))
    .replaceAll('{imovel_frase}', imovel ? `, comprador(a) do ${imovel}` : '')
    .replaceAll('{imovel}', imovel ?? '');
  return linkWhatsapp(empresa.whatsapp_atendimento, texto);
}
