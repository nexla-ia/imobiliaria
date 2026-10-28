/**
 * Painel (só admin): importa de uma vez os clientes do Asaas que têm parcelamento.
 * Para cada parcelamento ainda não vinculado cria o comprador (se preciso), um imóvel
 * provisório (marcado "revisar", com o nome do parcelamento) e o contrato. Depois
 * sincroniza as parcelas dentro de um limite de tempo; o resto fica para o botão
 * "Sincronizar pendentes" ou para o cron da madrugada.
 */
import { type AsaasCustomer, type AsaasInstallment, criarClienteAsaas } from '../_shared/asaas.ts';
import { sincronizarComprador, type CompradorSync } from '../_shared/cobrancas.ts';
import { cpfValido, ErroHttp, json, servir } from '../_shared/http.ts';
import { normalizarTelefone } from '../_shared/mensagens.ts';
import { admin, exigirEquipe, registrarAuditoria } from '../_shared/supabase.ts';

const ORCAMENTO_SYNC_MS = 80_000;

function identificacaoDe(p: AsaasInstallment, nomeCliente: string): string {
  const texto = (p.description ?? '').replace(/\s+/g, ' ').trim();
  if (texto) return texto.slice(0, 80);
  return `A definir · ${nomeCliente.split(' ').slice(0, 2).join(' ')}`;
}

servir(async (req) => {
  const inicio = Date.now();
  const equipe = await exigirEquipe(req, 'admin');
  const db = admin();
  const asaas = criarClienteAsaas();

  let clientes: AsaasCustomer[];
  let parcelamentos: AsaasInstallment[];
  try {
    [clientes, parcelamentos] = await Promise.all([asaas.listarClientes(), asaas.listarParcelamentos()]);
  } catch (e) {
    console.error(e);
    throw new ErroHttp(502, 'asaas_indisponivel', 'Não foi possível ler os clientes do Asaas agora.');
  }

  const porCliente = new Map<string, AsaasInstallment[]>();
  for (const p of parcelamentos) {
    if (p.deleted) continue;
    porCliente.set(p.customer, [...(porCliente.get(p.customer) ?? []), p]);
  }

  const ignorados = { cnpj_ou_cpf_invalido: 0, cpf_repetido_no_asaas: 0 };
  // um comprador por CPF; se o Asaas tiver o mesmo CPF em dois cadastros, fica o que tem mais parcelamentos
  const porCpf = new Map<string, { cliente: AsaasCustomer; parcelamentos: AsaasInstallment[] }>();
  for (const c of clientes) {
    const lista = porCliente.get(c.id);
    if (c.deleted || !lista?.length) continue;
    const cpf = (c.cpfCnpj ?? '').replace(/\D/g, '');
    if (!cpfValido(cpf)) {
      ignorados.cnpj_ou_cpf_invalido++;
      continue;
    }
    const atual = porCpf.get(cpf);
    if (atual) {
      ignorados.cpf_repetido_no_asaas++;
      if (atual.parcelamentos.length >= lista.length) continue;
    }
    porCpf.set(cpf, { cliente: c, parcelamentos: lista });
  }

  // o que já existe no sistema
  const cpfs = [...porCpf.keys()];
  const existentes = new Map<string, { id: string; asaas_customer_id: string | null }>();
  for (let i = 0; i < cpfs.length; i += 300) {
    const { data, error } = await db
      .from('compradores')
      .select('id, cpf, asaas_customer_id')
      .eq('empresa_id', equipe.empresa_id)
      .in('cpf', cpfs.slice(i, i + 300));
    if (error) throw error;
    for (const c of data ?? []) existentes.set(c.cpf, c);
  }
  const vinculados = new Set<string>();
  const idsParcelamentos = [...porCpf.values()].flatMap((v) => v.parcelamentos.map((p) => p.id));
  for (let i = 0; i < idsParcelamentos.length; i += 300) {
    const { data, error } = await db
      .from('contratos')
      .select('asaas_installment_id')
      .eq('empresa_id', equipe.empresa_id)
      .in('asaas_installment_id', idsParcelamentos.slice(i, i + 300));
    if (error) throw error;
    for (const c of data ?? []) vinculados.add(c.asaas_installment_id);
  }

  // compradores novos e os que ainda não tinham o cliente do Asaas
  const novosCompradores = [];
  for (const [cpf, { cliente }] of porCpf) {
    const ex = existentes.get(cpf);
    if (ex) {
      if (!ex.asaas_customer_id) {
        await db.from('compradores').update({ asaas_customer_id: cliente.id }).eq('id', ex.id);
      }
      continue;
    }
    novosCompradores.push({
      id: crypto.randomUUID(),
      empresa_id: equipe.empresa_id,
      nome: cliente.name.trim(),
      cpf,
      telefone: normalizarTelefone(cliente.mobilePhone || cliente.phone),
      email: cliente.email || null,
      asaas_customer_id: cliente.id,
    });
  }
  for (let i = 0; i < novosCompradores.length; i += 200) {
    const { error } = await db.from('compradores').insert(novosCompradores.slice(i, i + 200));
    if (error) throw error;
  }
  for (const c of novosCompradores) existentes.set(c.cpf, { id: c.id, asaas_customer_id: c.asaas_customer_id });

  // um imóvel provisório e um contrato por parcelamento ainda não vinculado
  const imoveis = [];
  const contratos = [];
  const tocados = new Set<string>();
  for (const [cpf, { cliente, parcelamentos: lista }] of porCpf) {
    const compradorId = existentes.get(cpf)!.id;
    for (const p of lista) {
      if (vinculados.has(p.id)) continue;
      const imovelId = crypto.randomUUID();
      imoveis.push({ id: imovelId, empresa_id: equipe.empresa_id, identificacao: identificacaoDe(p, cliente.name), revisar: true });
      contratos.push({
        empresa_id: equipe.empresa_id,
        comprador_id: compradorId,
        imovel_id: imovelId,
        asaas_installment_id: p.id,
        numero_parcelas: p.installmentCount,
      });
      tocados.add(compradorId);
    }
  }
  for (let i = 0; i < imoveis.length; i += 200) {
    const { error } = await db.from('imoveis').insert(imoveis.slice(i, i + 200));
    if (error) throw error;
  }
  for (let i = 0; i < contratos.length; i += 200) {
    const { error } = await db.from('contratos').insert(contratos.slice(i, i + 200));
    if (error) throw error;
  }

  // sincroniza as parcelas de quem mudou, até onde o tempo deixar
  let sincronizados = 0;
  const fila = [...tocados];
  for (const id of fila) {
    if (Date.now() - inicio > ORCAMENTO_SYNC_MS) break;
    const { data: c } = await db.from('compradores').select('id, empresa_id, asaas_customer_id').eq('id', id).single();
    try {
      await sincronizarComprador(db, asaas, c as CompradorSync);
      sincronizados++;
    } catch (e) {
      console.error('sync na importação', id, e);
    }
  }

  const resultado = {
    clientes_com_parcelamento: porCpf.size,
    compradores_novos: novosCompradores.length,
    contratos_novos: contratos.length,
    imoveis_para_revisar: imoveis.length,
    ja_vinculados: idsParcelamentos.length - contratos.length,
    ignorados,
    sincronizados,
    pendentes_sync: fila.length - sincronizados,
  };
  await registrarAuditoria(equipe.empresa_id, equipe.auth_user_id, 'importar', 'compradores', null, resultado);
  return json(resultado);
});
