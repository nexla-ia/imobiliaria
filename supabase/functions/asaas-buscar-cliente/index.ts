/** Painel: procura o cliente no Asaas pelo CPF e resume parcelamentos e cobranças avulsas para vincular. */
import { type AsaasPayment, criarClienteAsaas } from '../_shared/asaas.ts';
import { cpfValido, ErroHttp, json, lerCorpo, servir, somenteDigitos } from '../_shared/http.ts';
import { admin, exigirEquipe } from '../_shared/supabase.ts';

servir(async (req) => {
  const equipe = await exigirEquipe(req);
  const { cpf: bruto } = await lerCorpo<{ cpf?: string }>(req);
  const cpf = somenteDigitos(bruto);
  if (!cpfValido(cpf)) throw new ErroHttp(400, 'requisicao_invalida', 'CPF inválido.');

  const db = admin();
  const asaas = criarClienteAsaas();
  let clientes;
  try {
    clientes = (await asaas.buscarClientesPorCpf(cpf)).filter((c) => !c.deleted);
  } catch (e) {
    console.error(e);
    throw new ErroHttp(502, 'asaas_indisponivel', 'Não foi possível consultar o Asaas agora.');
  }

  const resultado = [];
  const todosParcelamentos: string[] = [];
  for (const c of clientes) {
    const pagamentos = await asaas.listarCobrancasDoCliente(c.id);
    const grupos = new Map<string, AsaasPayment[]>();
    const avulsas: AsaasPayment[] = [];
    for (const p of pagamentos) {
      if (p.installment) grupos.set(p.installment, [...(grupos.get(p.installment) ?? []), p]);
      else avulsas.push(p);
    }
    todosParcelamentos.push(...grupos.keys());
    resultado.push({
      id: c.id,
      nome: c.name,
      cpf: c.cpfCnpj,
      email: c.email,
      telefone: c.mobilePhone || c.phone,
      parcelamentos: [...grupos.entries()].map(([id, ps]) => {
        const ordenadas = [...ps].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        return {
          id,
          descricao: (ordenadas[0]?.description ?? '').replace(/^parcela\s+\d+\s+de\s+\d+\.?\s*/i, '') || null,
          valor_parcela: ordenadas[0]?.value ?? 0,
          quantidade: ps.length,
          criado_em: ordenadas[0]?.dueDate ?? '',
          pagas: ps.filter((p) => ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(p.status)).length,
          vencidas: ps.filter((p) => p.status === 'OVERDUE').length,
          contrato_id: null as string | null,
        };
      }),
      avulsas: avulsas
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .map((p) => ({ id: p.id, descricao: p.description, valor: p.value, vencimento: p.dueDate, status: p.status })),
    });
  }

  if (todosParcelamentos.length) {
    const { data: vinculados } = await db
      .from('contratos')
      .select('id, asaas_installment_id')
      .eq('empresa_id', equipe.empresa_id)
      .in('asaas_installment_id', todosParcelamentos);
    const mapa = new Map((vinculados ?? []).map((v) => [v.asaas_installment_id, v.id]));
    for (const c of resultado) for (const p of c.parcelamentos) p.contrato_id = mapa.get(p.id) ?? null;
  }

  const { data: comprador } = await db
    .from('compradores')
    .select('id')
    .eq('empresa_id', equipe.empresa_id)
    .eq('cpf', cpf)
    .maybeSingle();

  return json({ clientes: resultado, comprador_id: comprador?.id ?? null });
});
