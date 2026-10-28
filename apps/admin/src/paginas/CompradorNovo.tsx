import {
  cpfValido,
  formatarCpf,
  formatarData,
  formatarMoeda,
  formatarTelefone,
  somenteDigitos,
  statusApp,
  type BuscarClienteRes,
  type Imovel,
  type SyncRes,
} from '@planejar/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { SeloCobranca } from '../components/selos';
import { Botao, CabecalhoPagina, Campo, Cartao, Entrada, MensagemErro, Selecao, Selo, Tabela } from '../components/ui';
import { chamar, exigir, mensagemDeErro } from '../lib/api';
import { useEquipe } from '../lib/sessao';
import { supabase } from '../lib/supabase';
import { normalizarTelefone } from '../lib/telefone';

type ClienteAsaas = BuscarClienteRes['clientes'][number];

export function CompradorNovo() {
  const { empresa, membro } = useEquipe();
  const navegar = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [cpf, setCpf] = useState(params.get('cpf') ? formatarCpf(params.get('cpf')!) : '');
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<BuscarClienteRes | null>(null);
  const [cliente, setCliente] = useState<ClienteAsaas | null>(null);
  const [dados, setDados] = useState({ nome: '', telefone: '', email: '' });
  const [vinculos, setVinculos] = useState<Record<string, string>>({}); // parcelamento → imovel_id
  const [salvando, setSalvando] = useState(false);

  const imoveis = useQuery({
    queryKey: ['imoveis-opcoes'],
    queryFn: async () =>
      exigir(await supabase.from('imoveis').select('id, identificacao, empreendimentos(nome)').order('identificacao')) as Array<
        Pick<Imovel, 'id' | 'identificacao'> & { empreendimentos: { nome: string } | null }
      >,
  });

  function escolher(c: ClienteAsaas) {
    setCliente(c);
    setDados({ nome: c.nome, telefone: c.telefone ? formatarTelefone(c.telefone) : '', email: c.email ?? '' });
    setVinculos({});
  }

  async function buscar(e: FormEvent) {
    e.preventDefault();
    const digitos = somenteDigitos(cpf);
    if (!cpfValido(digitos)) return setErro('CPF inválido. Confira os números.');
    setErro(null);
    setBuscando(true);
    setResultado(null);
    setCliente(null);
    try {
      const r = await chamar<BuscarClienteRes>('asaas-buscar-cliente', { cpf: digitos });
      setResultado(r);
      if (r.clientes.length === 1) escolher(r.clientes[0]!);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setBuscando(false);
    }
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!cliente || !resultado) return;
    const escolhidos = Object.entries(vinculos).filter(([, imovel]) => imovel);
    const telefone = normalizarTelefone(dados.telefone);
    if (!dados.nome.trim()) return setErro('Informe o nome do comprador.');
    if (dados.telefone && !telefone) return setErro('WhatsApp inválido. Use DDD + número, ex.: (65) 9 9999-0000.');
    if (!resultado.comprador_id && escolhidos.length === 0) {
      return setErro('Escolha pelo menos um parcelamento e o imóvel correspondente.');
    }
    setErro(null);
    setSalvando(true);
    try {
      let compradorId = resultado.comprador_id;
      const campos = { nome: dados.nome.trim(), telefone, email: dados.email.trim() || null, asaas_customer_id: cliente.id };
      if (compradorId) {
        exigir(await supabase.from('compradores').update(campos).eq('id', compradorId));
      } else {
        const novo = exigir(
          await supabase
            .from('compradores')
            .insert({ ...campos, empresa_id: empresa.id, cpf: somenteDigitos(cpf) })
            .select('id')
            .single(),
        ) as { id: string };
        compradorId = novo.id;
      }

      if (escolhidos.length) {
        exigir(
          await supabase.from('contratos').insert(
            escolhidos.map(([parcelamentoId, imovelId]) => {
              const p = cliente.parcelamentos.find((x) => x.id === parcelamentoId)!;
              return {
                empresa_id: empresa.id,
                comprador_id: compradorId,
                imovel_id: imovelId,
                asaas_installment_id: parcelamentoId,
                numero_parcelas: p.quantidade,
                data_inicio: p.criado_em || null,
              };
            }),
          ),
        );
      }

      try {
        await chamar<SyncRes>('asaas-sync', { comprador_id: compradorId });
      } catch {
        // as parcelas chegam no próximo sync; o detalhe tem botão para tentar de novo
      }
      await queryClient.invalidateQueries();
      navegar(`/compradores/${compradorId}`, { state: { importado: true, por: membro.nome } });
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Importar comprador do Asaas"
        subtitulo="Busque pelo CPF, confira os dados e ligue cada parcelamento a um imóvel."
        acoes={<Link to="/compradores" className="text-sm font-semibold text-ciano-escuro">Voltar</Link>}
      />

      <Cartao className="mb-6">
        <form onSubmit={buscar} className="flex flex-wrap items-end gap-3 p-5">
          <Campo rotulo="CPF do comprador" className="w-64">
            <Entrada
              id="cpf-busca"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              onBlur={() => somenteDigitos(cpf).length === 11 && setCpf(formatarCpf(cpf))}
            />
          </Campo>
          <Botao type="submit" carregando={buscando}>Buscar no Asaas</Botao>
          <span className="text-xs text-suave">Ambiente Asaas: {empresa.asaas_ambiente === 'producao' ? 'produção' : 'sandbox (testes)'}</span>
        </form>
        {!resultado && erro && <div className="px-5 pb-5"><MensagemErro erro={erro} /></div>}
      </Cartao>

      {resultado && resultado.clientes.length === 0 && (
        <Cartao className="p-6">
          <p className="font-semibold">Nenhum cliente com este CPF no Asaas.</p>
          <p className="mt-1 text-sm text-suave">Cadastre o cliente e o parcelamento no Asaas primeiro; depois volte aqui.</p>
        </Cartao>
      )}

      {resultado && resultado.clientes.length > 1 && (
        <Cartao titulo="Mais de um cadastro com este CPF no Asaas" className="mb-6">
          <div className="flex flex-wrap gap-3 p-5">
            {resultado.clientes.map((c) => (
              <button
                key={c.id}
                onClick={() => escolher(c)}
                className={`rounded-lg border px-4 py-3 text-left text-sm ${cliente?.id === c.id ? 'border-ciano-escuro bg-info-bg' : 'border-linha bg-white'}`}
              >
                <span className="block font-semibold">{c.nome}</span>
                <span className="text-suave">{c.id} · {c.parcelamentos.length} parcelamento(s)</span>
              </button>
            ))}
          </div>
        </Cartao>
      )}

      {resultado && cliente && (
        <form onSubmit={salvar} className="space-y-6">
          {resultado.comprador_id && (
            <p className="rounded-lg bg-info-bg px-4 py-3 text-sm text-ciano-escuro">
              Este CPF já está cadastrado.{' '}
              <Link to={`/compradores/${resultado.comprador_id}`} className="font-semibold underline">Ver comprador</Link>. Você pode ligar
              outro parcelamento abaixo.
            </p>
          )}

          <Cartao titulo="Dados do comprador">
            <div className="grid gap-4 p-5 md:grid-cols-3">
              <Campo rotulo="Nome">
                <Entrada id="nome" value={dados.nome} onChange={(e) => setDados({ ...dados, nome: e.target.value })} />
              </Campo>
              <Campo rotulo="WhatsApp" dica="Recebe o código de acesso e o convite do app.">
                <Entrada id="telefone" inputMode="tel" placeholder="(65) 9 9999-0000" value={dados.telefone} onChange={(e) => setDados({ ...dados, telefone: e.target.value })} />
              </Campo>
              <Campo rotulo="E-mail" dica="Opcional. Alternativa para receber o código.">
                <Entrada id="email" type="email" value={dados.email} onChange={(e) => setDados({ ...dados, email: e.target.value })} />
              </Campo>
            </div>
          </Cartao>

          <Cartao titulo="Parcelamentos no Asaas">
            {cliente.parcelamentos.length === 0 ? (
              <p className="p-5 text-sm text-suave">Este cliente não tem parcelamentos no Asaas.</p>
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <th>Parcelamento</th>
                    <th>Parcelas</th>
                    <th>Situação</th>
                    <th className="w-80">Imóvel</th>
                  </tr>
                </thead>
                <tbody>
                  {cliente.parcelamentos.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="font-semibold">{p.descricao || 'Sem descrição'}</div>
                        <div className="text-xs text-suave">1ª parcela em {p.criado_em ? formatarData(p.criado_em) : '—'} · {p.id}</div>
                      </td>
                      <td className="whitespace-nowrap tabular-nums">{p.quantidade}× {formatarMoeda(p.valor_parcela)}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          <Selo tom="ok">{p.pagas} pagas</Selo>
                          {p.vencidas > 0 && <Selo tom="erro">{p.vencidas} vencidas</Selo>}
                        </div>
                      </td>
                      <td>
                        {p.contrato_id ? (
                          <Selo tom="info">Já vinculado</Selo>
                        ) : (
                          <Selecao
                            id={`imovel-${p.id}`}
                            value={vinculos[p.id] ?? ''}
                            onChange={(e) => setVinculos({ ...vinculos, [p.id]: e.target.value })}
                          >
                            <option value="">Não vincular</option>
                            {imoveis.data?.map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.identificacao}{i.empreendimentos ? ` · ${i.empreendimentos.nome}` : ''}
                              </option>
                            ))}
                          </Selecao>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            )}
            {imoveis.data?.length === 0 && (
              <p className="border-t border-linha px-5 py-3 text-sm text-alerta">
                Nenhum imóvel cadastrado. <Link to="/imoveis/novo" className="font-semibold underline">Cadastre o imóvel</Link> antes de vincular.
              </p>
            )}
          </Cartao>

          {cliente.avulsas.length > 0 && (
            <Cartao titulo="Cobranças avulsas (fora de parcelamento)">
              <p className="px-5 pt-4 text-sm text-suave">
                Entram automaticamente no cadastro do comprador.{' '}
                {empresa.mostrar_cobrancas_avulsas ? 'Elas aparecem no app.' : 'Pela configuração atual, não aparecem no app.'}
              </p>
              <Tabela>
                <thead><tr><th>Descrição</th><th>Vencimento</th><th>Valor</th><th>Situação</th></tr></thead>
                <tbody>
                  {cliente.avulsas.map((a) => (
                    <tr key={a.id}>
                      <td>{a.descricao || a.id}</td>
                      <td className="tabular-nums">{formatarData(a.vencimento)}</td>
                      <td className="tabular-nums">{formatarMoeda(a.valor)}</td>
                      <td><SeloCobranca status={statusApp(a.status)} /></td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            </Cartao>
          )}

          <MensagemErro erro={erro} />
          <div className="flex justify-end gap-2">
            <Botao type="submit" carregando={salvando}>{resultado.comprador_id ? 'Salvar vínculos' : 'Cadastrar comprador'}</Botao>
          </div>
        </form>
      )}
    </>
  );
}
