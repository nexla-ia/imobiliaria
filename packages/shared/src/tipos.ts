/**
 * Linhas das tabelas usadas pelo app e pelo painel.
 * Escritas à mão a partir das migrations; trocar por `pnpm db:types` quando o
 * projeto Supabase estiver criado (gera database.types.ts).
 */
import type { StatusApp } from './status';

export type Uuid = string;
export type DataIso = string; // AAAA-MM-DD
export type DataHoraIso = string;

export interface Empresa {
  id: Uuid;
  slug: string;
  nome: string;
  creci: string | null;
  logo_url: string | null;
  cor_primaria: string;
  cor_destaque: string;
  whatsapp_atendimento: string | null;
  dias_aviso: number[];
  fuso_horario: string;
  asaas_ambiente: 'sandbox' | 'producao';
  mostrar_cobrancas_avulsas: boolean;
  permitir_alterar_vencimento: boolean;
  textos: TextosEmpresa;
}

export interface TextosEmpresa {
  mensagem_codigo?: string;
  mensagem_convite?: string;
  mensagem_whatsapp?: string;
  link_android?: string;
  link_ios?: string;
  link_privacidade?: string;
  link_termos?: string;
}

export type PapelEquipe = 'admin' | 'operador';

export interface UsuarioAdmin {
  id: Uuid;
  auth_user_id: Uuid;
  empresa_id: Uuid;
  nome: string;
  papel: PapelEquipe;
  created_at: DataHoraIso;
}

export type StatusAcesso = 'convidado' | 'ativo' | 'bloqueado';

export interface Comprador {
  id: Uuid;
  auth_user_id: Uuid | null;
  empresa_id: Uuid;
  nome: string;
  cpf: string;
  email: string | null;
  telefone: string | null;
  asaas_customer_id: string | null;
  status_acesso: StatusAcesso;
  termos_aceitos_em: DataHoraIso | null;
  ativado_em: DataHoraIso | null;
  excluido_em: DataHoraIso | null;
  ultima_sync_em: DataHoraIso | null;
  /** entrou com senha provisória e ainda não criou a própria (RLS esconde os dados até lá) */
  deve_trocar_senha: boolean;
  senha_provisoria_expira_em: DataHoraIso | null;
  created_at: DataHoraIso;
}

export interface Empreendimento {
  id: Uuid;
  empresa_id: Uuid;
  nome: string;
  cidade: string | null;
  uf: string | null;
}

export interface Imovel {
  id: Uuid;
  empresa_id: Uuid;
  empreendimento_id: Uuid | null;
  identificacao: string;
  endereco: string | null;
  lat: number | null;
  lng: number | null;
  metragem_m2: number | null;
  descricao: string | null;
  /** criado automaticamente na importação do Asaas; a equipe precisa conferir os dados */
  revisar: boolean;
}

export interface ImovelFoto {
  id: Uuid;
  empresa_id: Uuid;
  imovel_id: Uuid;
  storage_path: string;
  ordem: number;
}

export type StatusContrato = 'ativo' | 'quitado' | 'cancelado';

export interface Contrato {
  id: Uuid;
  empresa_id: Uuid;
  comprador_id: Uuid;
  imovel_id: Uuid;
  asaas_installment_id: string | null;
  numero_parcelas: number | null;
  data_inicio: DataIso | null;
  status: StatusContrato;
  ultima_sync_em: DataHoraIso | null;
}

export interface Cobranca {
  id: Uuid;
  empresa_id: Uuid;
  comprador_id: Uuid;
  contrato_id: Uuid | null;
  asaas_payment_id: string;
  numero_parcela: number | null;
  descricao: string | null;
  vencimento: DataIso;
  vencimento_original: DataIso | null;
  /** numeric chega como string ou number dependendo do cliente; use Number() */
  valor: number;
  valor_original: number | null;
  valor_liquido: number | null;
  valor_juros: number | null;
  status_asaas: string;
  status_app: StatusApp;
  removida: boolean;
  data_pagamento: DataIso | null;
  billing_type: string | null;
  invoice_url: string | null;
  bank_slip_url: string | null;
  comprovante_url: string | null;
  atualizado_asaas_em: DataHoraIso;
}

export type TipoDocumento = 'contrato' | 'aditivo' | 'escritura' | 'outro';

export interface Documento {
  id: Uuid;
  empresa_id: Uuid;
  comprador_id: Uuid;
  contrato_id: Uuid | null;
  titulo: string;
  storage_path: string;
  tipo: TipoDocumento;
  created_at: DataHoraIso;
}

export type AlvoComunicado = 'todos' | 'empreendimento' | 'comprador';

export interface Comunicado {
  id: Uuid;
  empresa_id: Uuid;
  titulo: string;
  corpo: string;
  alvo: AlvoComunicado;
  alvo_id: Uuid | null;
  criado_por: Uuid | null;
  enviado_em: DataHoraIso | null;
  total_destinatarios: number | null;
  created_at: DataHoraIso;
}

export type TipoNotificacao = 'vencimento' | 'pagamento' | 'comunicado';

export interface Notificacao {
  id: Uuid;
  comprador_id: Uuid;
  tipo: TipoNotificacao;
  titulo: string;
  corpo: string;
  lida_em: DataHoraIso | null;
  payload: { cobranca_id?: Uuid; comunicado_id?: Uuid; tela?: 'pagar' | 'parcela' | 'notificacoes' };
  created_at: DataHoraIso;
}

export interface ResumoContrato {
  contrato_id: Uuid;
  empresa_id: Uuid;
  comprador_id: Uuid;
  imovel_id: Uuid;
  total_parcelas: number;
  parcelas_pagas: number;
  parcelas_vencidas: number;
  total_pago: number;
  saldo_em_aberto: number;
  proxima_cobranca_id: Uuid | null;
}

export interface LinhaCarteira {
  contrato_id: Uuid;
  empresa_id: Uuid;
  status_contrato: StatusContrato;
  comprador_id: Uuid;
  comprador_nome: string;
  comprador_cpf: string;
  comprador_telefone: string | null;
  status_acesso: StatusAcesso;
  imovel_id: Uuid;
  imovel: string;
  empreendimento_id: Uuid | null;
  empreendimento: string | null;
  total_parcelas: number;
  parcelas_pagas: number;
  parcelas_vencidas: number;
  total_pago: number;
  saldo_em_aberto: number;
  vencida_desde: DataIso | null;
  valor_vencido: number;
  ultima_sync_em: DataHoraIso | null;
  /** recebeu senha provisória e ainda não entrou para criar a própria */
  deve_trocar_senha: boolean;
}

export interface AuditLog {
  id: Uuid;
  empresa_id: Uuid;
  ator_id: Uuid | null;
  acao: string;
  entidade: string;
  entidade_id: Uuid | null;
  dados: Record<string, unknown> | null;
  created_at: DataHoraIso;
}
