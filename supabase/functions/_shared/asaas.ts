/**
 * Cliente da API v3 do Asaas. Única porta de saída para o Asaas no projeto:
 * usado pelas Edge Functions e, no futuro, como tools do agente de WhatsApp.
 * Campos conferidos em https://docs.asaas.com — revalidar ao mudar de versão.
 */

const BASE_URL = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  producao: 'https://api.asaas.com/v3',
} as const;

export type AsaasAmbiente = keyof typeof BASE_URL;

export interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj: string;
  email: string | null;
  phone: string | null;
  mobilePhone: string | null;
  deleted: boolean;
}

export interface AsaasPayment {
  id: string;
  customer: string;
  installment: string | null;
  installmentNumber?: number | null;
  status: string;
  value: number;
  netValue: number | null;
  originalValue: number | null;
  /** "Valor calculado de juros e multa que deve ser pago após o vencimento" (a confirmar se vem antes do pagamento) */
  interestValue: number | null;
  canBePaidAfterDueDate?: boolean;
  description: string | null;
  billingType: string;
  dueDate: string;
  originalDueDate: string | null;
  paymentDate: string | null;
  clientPaymentDate: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  transactionReceiptUrl: string | null;
  deleted: boolean;
}

export interface AsaasInstallment {
  id: string;
  customer: string;
  value: number;
  /** valor de cada parcela */
  paymentValue: number;
  installmentCount: number;
  dateCreated: string;
  description: string | null;
  deleted: boolean;
}

export interface AsaasPixQrCode {
  encodedImage: string; // PNG em base64
  payload: string;      // Pix copia e cola
  expirationDate: string;
}

export interface AsaasIdentificationField {
  identificationField: string; // linha digitável
  nossoNumero: string;
  barCode: string;
}

interface AsaasLista<T> {
  hasMore: boolean;
  totalCount: number;
  limit: number;
  offset: number;
  data: T[];
}

export class AsaasErro extends Error {
  constructor(readonly status: number, readonly corpo: unknown) {
    super(`Asaas respondeu ${status}`);
  }
}

export interface AsaasConfig {
  apiKey: string;
  ambiente: AsaasAmbiente;
}

export function asaasConfigDoAmbiente(): AsaasConfig {
  const apiKey = Deno.env.get('ASAAS_API_KEY');
  const ambiente = (Deno.env.get('ASAAS_AMBIENTE') ?? 'sandbox') as AsaasAmbiente;
  if (!apiKey) throw new Error('ASAAS_API_KEY não configurada');
  if (!(ambiente in BASE_URL)) throw new Error(`ASAAS_AMBIENTE inválido: ${ambiente}`);
  // trava contra chave de produção rodando como sandbox (ou o contrário)
  const ehChaveProd = apiKey.startsWith('$aact_prod_');
  if (ehChaveProd !== (ambiente === 'producao')) {
    throw new Error(`ASAAS_API_KEY não corresponde ao ambiente "${ambiente}"`);
  }
  return { apiKey, ambiente };
}

const MAX_TENTATIVAS = 4;

export function criarClienteAsaas(config: AsaasConfig = asaasConfigDoAmbiente()) {
  const base = BASE_URL[config.ambiente];

  async function req<T>(caminho: string, init: RequestInit = {}): Promise<T> {
    for (let tentativa = 1; ; tentativa++) {
      const resp = await fetch(`${base}${caminho}`, {
        ...init,
        headers: {
          access_token: config.apiKey,
          'Content-Type': 'application/json',
          // obrigatório para contas criadas a partir de 13/06/2024
          'User-Agent': 'planejar-app/1.0 (Nexla)',
          ...init.headers,
        },
      });
      if (resp.ok) return (await resp.json()) as T;

      const repetir = resp.status === 429 || resp.status >= 500;
      if (!repetir || tentativa >= MAX_TENTATIVAS) {
        const corpo = await resp.json().catch(() => null);
        throw new AsaasErro(resp.status, corpo);
      }
      await resp.body?.cancel();
      // o Asaas não manda Retry-After no 429; RateLimit-Reset (segundos) vem quando é limite de cota
      const reset = Number(resp.headers.get('ratelimit-reset'));
      if (resp.status === 429 && reset > 30) {
        throw new AsaasErro(429, { mensagem: `cota do Asaas esgotada; libera em ${reset}s` });
      }
      const espera = reset > 0 ? reset * 1000 : 1000 * 2 ** (tentativa - 1) + Math.random() * 500;
      await new Promise((r) => setTimeout(r, espera));
    }
  }

  /** Percorre todas as páginas (limite máximo do Asaas: 100 por página). */
  async function listarTudo<T>(caminho: string, filtros: Record<string, string> = {}): Promise<T[]> {
    const itens: T[] = [];
    for (let offset = 0; ; offset += 100) {
      const qs = new URLSearchParams({ ...filtros, offset: String(offset), limit: '100' });
      const pagina = await req<AsaasLista<T>>(`${caminho}?${qs}`);
      itens.push(...pagina.data);
      if (!pagina.hasMore) return itens;
    }
  }

  return {
    ambiente: config.ambiente,

    /** Todos os clientes da conta (importação em lote). */
    listarClientes: () => listarTudo<AsaasCustomer>('/customers'),

    /** Todos os parcelamentos da conta (importação em lote). */
    listarParcelamentos: () => listarTudo<AsaasInstallment>('/installments'),

    buscarClientesPorCpf: (cpf: string) =>
      listarTudo<AsaasCustomer>('/customers', { cpfCnpj: cpf.replace(/\D/g, '') }),

    listarCobrancasDoCliente: (customerId: string, filtros: Record<string, string> = {}) =>
      listarTudo<AsaasPayment>('/payments', { customer: customerId, ...filtros }),

    listarCobrancasDoParcelamento: (installmentId: string) =>
      listarTudo<AsaasPayment>('/payments', { installment: installmentId }),

    buscarParcelamento: (installmentId: string) =>
      req<AsaasInstallment>(`/installments/${encodeURIComponent(installmentId)}`),

    buscarCobranca: (paymentId: string) =>
      req<AsaasPayment>(`/payments/${encodeURIComponent(paymentId)}`),

    linhaDigitavel: (paymentId: string) =>
      req<AsaasIdentificationField>(`/payments/${encodeURIComponent(paymentId)}/identificationField`),

    pixQrCode: (paymentId: string) =>
      req<AsaasPixQrCode>(`/payments/${encodeURIComponent(paymentId)}/pixQrCode`),
  };
}

export type ClienteAsaas = ReturnType<typeof criarClienteAsaas>;

/** Converte uma cobrança do Asaas nas colunas de public.cobrancas (sem ids internos). */
export function cobrancaParaLinha(p: AsaasPayment) {
  return {
    asaas_payment_id: p.id,
    numero_parcela: p.installmentNumber ?? null,
    descricao: p.description,
    vencimento: p.dueDate,
    vencimento_original: p.originalDueDate,
    valor: p.value,
    valor_original: p.originalValue,
    valor_liquido: p.netValue,
    valor_juros: p.interestValue,
    status_asaas: p.status,
    removida: p.deleted,
    data_pagamento: p.clientPaymentDate ?? p.paymentDate,
    billing_type: p.billingType,
    invoice_url: p.invoiceUrl,
    bank_slip_url: p.bankSlipUrl,
    comprovante_url: p.transactionReceiptUrl,
    atualizado_asaas_em: new Date().toISOString(),
  };
}
