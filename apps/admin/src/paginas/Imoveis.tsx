import type { Empreendimento, Imovel } from '@planejar/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Botao, CabecalhoPagina, Campo, Cartao, Carregando, Entrada, MensagemErro, Modal, Selo, Tabela, useAvisar, Vazio } from '../components/ui';
import { buscarTodos, exigir, mensagemDeErro } from '../lib/api';
import { useEquipe } from '../lib/sessao';
import { supabase } from '../lib/supabase';

type ImovelLista = Imovel & { contratos: Array<{ status: string; compradores: { nome: string; cpf: string } | null }> };
type Filtro = 'todos' | 'revisar' | 'sem_mapa';

/** Minúsculas e sem acento, para "jose" achar "JOSÉ". */
const normalizar = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const semCoordenadas = (i: Imovel) => i.lat == null || i.lng == null;

export function Imoveis() {
  const navegar = useNavigate();
  const [editando, setEditando] = useState<Empreendimento | 'novo' | null>(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const empreendimentos = useQuery({
    queryKey: ['empreendimentos'],
    queryFn: async () => exigir(await supabase.from('empreendimentos').select('*').order('nome')) as Empreendimento[],
  });
  const imoveis = useQuery({
    queryKey: ['imoveis'],
    queryFn: () =>
      buscarTodos<ImovelLista>((de, ate) =>
        supabase.from('imoveis').select('*, contratos(status, compradores(nome, cpf))').order('identificacao').order('id').range(de, ate),
      ),
  });

  const todos = useMemo(() => imoveis.data ?? [], [imoveis.data]);
  const filtrados = useMemo(() => {
    const termo = normalizar(busca.trim());
    const digitos = busca.replace(/\D/g, '');
    return todos.filter((i) => {
      if (filtro === 'revisar' && !i.revisar) return false;
      if (filtro === 'sem_mapa' && !semCoordenadas(i)) return false;
      if (!termo) return true;
      const ativos = i.contratos.filter((c) => c.status !== 'cancelado');
      return (
        normalizar(i.identificacao).includes(termo) ||
        normalizar(i.endereco ?? '').includes(termo) ||
        ativos.some((c) => normalizar(c.compradores?.nome ?? '').includes(termo) || (digitos.length >= 3 && (c.compradores?.cpf ?? '').includes(digitos)))
      );
    });
  }, [todos, busca, filtro]);
  const filtrando = !!busca.trim() || filtro !== 'todos';

  const grupos = [
    ...(empreendimentos.data ?? []).map((e) => ({ empreendimento: e, itens: filtrados.filter((i) => i.empreendimento_id === e.id) })),
    { empreendimento: null, itens: filtrados.filter((i) => !i.empreendimento_id) },
  ].filter((g) => g.itens.length || (g.empreendimento && !filtrando));

  return (
    <>
      <CabecalhoPagina
        titulo="Imóveis"
        subtitulo="Empreendimentos, lotes e as informações que o comprador vê em Meu imóvel"
        acoes={
          <>
            <Botao variante="secundario" onClick={() => setEditando('novo')}>Novo empreendimento</Botao>
            <Link to="/imoveis/novo" className="inline-flex h-10 items-center rounded-lg bg-noite px-4 text-sm font-semibold text-white hover:bg-marinho">
              Novo imóvel
            </Link>
          </>
        }
      />
      {todos.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Entrada
            id="busca-imoveis"
            type="search"
            placeholder="Buscar por imóvel, endereço, comprador ou CPF"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="max-w-md"
          />
          <div className="flex rounded-lg bg-white p-1 shadow-cartao" role="group" aria-label="Filtrar imóveis">
            {([
              ['todos', 'Todos', todos.length],
              ['revisar', 'Para revisar', todos.filter((i) => i.revisar).length],
              ['sem_mapa', 'Sem coordenadas', todos.filter(semCoordenadas).length],
            ] as const).map(([valor, rotulo, total]) => (
              <button
                key={valor}
                onClick={() => setFiltro(valor)}
                aria-pressed={filtro === valor}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${filtro === valor ? 'bg-noite text-white' : 'text-suave hover:text-texto'}`}
              >
                {rotulo} <span className="tabular-nums opacity-80">{total}</span>
              </button>
            ))}
          </div>
          {filtrando && <span className="text-sm text-suave">{filtrados.length} de {todos.length} imóveis</span>}
        </div>
      )}
      {imoveis.error ? (
        <MensagemErro erro={mensagemDeErro(imoveis.error)} />
      ) : imoveis.isLoading || empreendimentos.isLoading ? (
        <Carregando />
      ) : todos.length === 0 && grupos.length === 0 ? (
        <Cartao><Vazio titulo="Nada cadastrado ainda">Comece criando um empreendimento e depois os imóveis dele.</Vazio></Cartao>
      ) : grupos.length === 0 ? (
        <Cartao>
          <Vazio titulo="Nenhum imóvel encontrado">
            <Botao variante="secundario" onClick={() => { setBusca(''); setFiltro('todos'); }}>Limpar busca</Botao>
          </Vazio>
        </Cartao>
      ) : (
        <div className="space-y-6">
          {grupos.map((g) => (
            <Cartao
              key={g.empreendimento?.id ?? 'sem'}
              titulo={
                <span>
                  {g.empreendimento?.nome ?? 'Sem empreendimento'}
                  {g.empreendimento?.cidade && (
                    <span className="ml-2 text-sm font-normal text-suave">{g.empreendimento.cidade}{g.empreendimento.uf ? ` - ${g.empreendimento.uf}` : ''}</span>
                  )}
                </span>
              }
              acoes={g.empreendimento && <Botao variante="fantasma" className="h-8 px-2" onClick={() => setEditando(g.empreendimento)}>Editar</Botao>}
            >
              {g.itens.length === 0 ? (
                <Vazio titulo="Nenhum imóvel neste empreendimento" />
              ) : (
                <Tabela>
                  <thead><tr><th>Imóvel</th><th>Metragem</th><th>Mapa</th><th>Comprador</th></tr></thead>
                  <tbody>
                    {g.itens.map((i) => {
                      const compradores = i.contratos.filter((c) => c.status !== 'cancelado').map((c) => c.compradores?.nome).filter(Boolean);
                      return (
                        <tr key={i.id} onClick={() => navegar(`/imoveis/${i.id}`)} className="cursor-pointer hover:bg-fundo/60">
                          <td className="font-semibold">
                            {i.identificacao}
                            {i.revisar && <span className="ml-2"><Selo tom="alerta">Revisar</Selo></span>}
                          </td>
                          <td className="tabular-nums">{i.metragem_m2 ? `${Number(i.metragem_m2).toLocaleString('pt-BR')} m²` : '—'}</td>
                          <td>{i.lat != null && i.lng != null ? 'Sim' : <span className="text-alerta">Sem coordenadas</span>}</td>
                          <td className="text-suave">{compradores.join(', ') || 'Disponível'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Tabela>
              )}
            </Cartao>
          ))}
        </div>
      )}
      {editando && <FormEmpreendimento atual={editando === 'novo' ? null : editando} aoFechar={() => setEditando(null)} />}
    </>
  );
}

function FormEmpreendimento({ atual, aoFechar }: { atual: Empreendimento | null; aoFechar: () => void }) {
  const { empresa } = useEquipe();
  const queryClient = useQueryClient();
  const avisar = useAvisar();
  const [nome, setNome] = useState(atual?.nome ?? '');
  const [cidade, setCidade] = useState(atual?.cidade ?? '');
  const [uf, setUf] = useState(atual?.uf ?? 'MT');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const campos = { nome: nome.trim(), cidade: cidade.trim() || null, uf: uf.trim().toUpperCase().slice(0, 2) || null };
      if (atual) exigir(await supabase.from('empreendimentos').update(campos).eq('id', atual.id));
      else exigir(await supabase.from('empreendimentos').insert({ ...campos, empresa_id: empresa.id }));
      avisar(atual ? 'Empreendimento atualizado.' : 'Empreendimento criado.');
      await queryClient.invalidateQueries({ queryKey: ['empreendimentos'] });
      aoFechar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo={atual ? 'Editar empreendimento' : 'Novo empreendimento'}>
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Nome"><Entrada id="emp-nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Residencial Parque das Águas" /></Campo>
        <div className="grid grid-cols-[1fr_80px] gap-3">
          <Campo rotulo="Cidade"><Entrada id="emp-cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} /></Campo>
          <Campo rotulo="UF"><Entrada id="emp-uf" maxLength={2} value={uf} onChange={(e) => setUf(e.target.value)} /></Campo>
        </div>
        <MensagemErro erro={erro} />
        <div className="flex justify-end gap-2">
          <Botao type="button" variante="secundario" onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" carregando={salvando}>Salvar</Botao>
        </div>
      </form>
    </Modal>
  );
}
