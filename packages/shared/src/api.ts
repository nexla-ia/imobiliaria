/**
 * Contratos de entrada/saída das Edge Functions.
 * Usados pelo app, pelo painel e (por cópia de tipo) pelas próprias funções.
 */

/** Erro padrão devolvido pelas funções: HTTP 4xx/5xx com este corpo. */
export interface ErroApi {
  erro: CodigoErro;
  mensagem: string;
}

export type CodigoErro =
  | 'requisicao_invalida'
  | 'nao_autenticado'
  | 'sem_permissao'
  | 'nao_encontrado'
  | 'muitas_tentativas'
  | 'codigo_invalido'
  | 'codigo_expirado'
  | 'termos_obrigatorios'
  | 'senha_fraca'
  | 'asaas_indisponivel'
  | 'erro_interno';

// --- auth-solicitar-codigo (anônimo) ---------------------------------------
export type FinalidadeCodigo = 'primeiro_acesso' | 'recuperar_senha';

export interface SolicitarCodigoReq {
  empresa: string; // slug
  cpf: string;
  finalidade: FinalidadeCodigo;
  canal?: 'whatsapp' | 'email';
}
/** Sempre a mesma resposta, exista o CPF ou não. */
export interface SolicitarCodigoRes {
  ok: true;
  /** o ambiente envia código sozinho (WhatsApp/e-mail); se não, pedir a senha à imobiliária */
  automatico: boolean;
}

// --- conta-definir-senha (comprador com senha provisória) -------------------
export interface DefinirSenhaReq {
  senha: string;
  aceitou_termos: boolean;
}

// --- auth-validar-codigo (anônimo) -----------------------------------------
export interface ValidarCodigoReq {
  empresa: string;
  cpf: string;
  codigo: string;
  senha: string;
  aceitou_termos: boolean;
}
export interface ValidarCodigoRes {
  ok: true;
  /** e-mail sintético para o app fazer signInWithPassword em seguida */
  email_login: string;
}

// --- asaas-boleto / asaas-pix (comprador) ----------------------------------
export interface CobrancaReq {
  cobranca_id: string;
}
export interface BoletoRes {
  linha_digitavel: string | null;
  bank_slip_url: string | null;
  invoice_url: string | null;
  valor: number;
  vencimento: string;
  status_asaas: string;
}
export interface PixRes {
  qr_code_base64: string;
  copia_e_cola: string;
  expira_em: string | null;
  invoice_url: string | null;
  valor: number;
  status_asaas: string;
}

// --- asaas-buscar-cliente (equipe) -----------------------------------------
export interface BuscarClienteReq {
  cpf: string;
}
export interface ClienteAsaasResumo {
  id: string;
  nome: string;
  cpf: string;
  email: string | null;
  telefone: string | null;
}
export interface ParcelamentoAsaasResumo {
  id: string;
  descricao: string | null;
  valor_parcela: number;
  quantidade: number;
  criado_em: string;
  pagas: number;
  vencidas: number;
  /** já vinculado a algum contrato desta empresa */
  contrato_id: string | null;
}
export interface CobrancaAvulsaResumo {
  id: string;
  descricao: string | null;
  valor: number;
  vencimento: string;
  status: string;
}
export interface BuscarClienteRes {
  clientes: Array<
    ClienteAsaasResumo & {
      parcelamentos: ParcelamentoAsaasResumo[];
      avulsas: CobrancaAvulsaResumo[];
    }
  >;
  /** comprador já cadastrado no sistema com este CPF */
  comprador_id: string | null;
}

// --- asaas-sync (equipe ou cron) -------------------------------------------
export interface SyncReq {
  contrato_id?: string;
  comprador_id?: string;
  /** sincroniza quem nunca foi sincronizado (depois de uma importação) */
  pendentes?: boolean;
}
export interface SyncRes {
  compradores: number;
  contratos: number;
  cobrancas: number;
  erros: string[];
  pendentes: number;
}

// --- notify-comunicado (equipe) --------------------------------------------
export interface EnviarComunicadoReq {
  comunicado_id: string;
}
export interface EnviarComunicadoRes {
  destinatarios: number;
  pushes: number;
}

// --- acesso-convidar (equipe) ----------------------------------------------
/** Gera uma senha provisória nova (convite ou "esqueci a senha"). */
export interface ConvidarReq {
  comprador_id: string;
  /** manda sozinho pela Evolution API, se estiver configurada */
  enviar_automatico?: boolean;
}
export interface ConvidarRes {
  senha: string;
  expira_em: string;
  mensagem: string;
  /** abre o WhatsApp da imobiliária com a mensagem pronta (null se o comprador não tem telefone) */
  link_whatsapp: string | null;
  enviado_automatico: boolean;
  automatico_disponivel: boolean;
}

// --- asaas-importar-clientes (admin) ---------------------------------------
export interface ImportarClientesRes {
  clientes_com_parcelamento: number;
  compradores_novos: number;
  contratos_novos: number;
  imoveis_para_revisar: number;
  ja_vinculados: number;
  ignorados: { cnpj_ou_cpf_invalido: number; cpf_repetido_no_asaas: number };
  sincronizados: number;
  pendentes_sync: number;
}

// --- equipe-adicionar (admin) ----------------------------------------------
export interface AdicionarEquipeReq {
  nome: string;
  email: string;
  papel: 'admin' | 'operador';
  senha_provisoria: string;
}

// --- conta-excluir (comprador) ---------------------------------------------
export interface ExcluirContaRes {
  ok: true;
}
