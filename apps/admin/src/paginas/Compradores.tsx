import { formatarCpf, formatarTelefone, type Comprador, type ImportarClientesRes, type SyncRes } from '@planejar/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ModalConvite } from '../components/Convite';
import { SeloAcesso } from '../components/selos';
import { Botao, CabecalhoPagina, Cartao, Carregando, Entrada, MensagemErro, Modal, Selecao, Tabela, Vazio } from '../components/ui';
import { buscarTodos, chamar, mensagemDeErro } from '../lib/api';
import { useEquipe } from '../lib/sessao';
import { supabase } from '../lib/supabase';

type CompradorLista = Comprador & { contratos: Array<{ id: string; status: string; imoveis: { identificacao: string } | null }> };

export function Compradores() {
  const { ehAdmin } = useEquipe();
  const navegar = useNavigate();
  const [busca, setBusca] = useState('');
  const [acesso, setAcesso] = useState('');
  const [convite, setConvite] = useState<CompradorLista | null>(null);
  const [importar, setImportar] = useState(false);

  const consulta = useQuery({
    queryKey: ['compradores'],
    queryFn: async () =>
      buscarTodos<CompradorLista>((de, ate) =>
        supabase.from('compradores').select('*, contratos(id, status, imoveis(identificacao))').order('nome').order('id').range(de, ate),
      ),
  });

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = termo.replace(/\D/g, '');
    return (consulta.data ?? []).filter((c) => {
      if (acesso === 'aguardando' && !(c.status_acesso === 'ativo' && c.deve_trocar_senha)) return false;
      if (acesso === 'ativo' && !(c.status_acesso === 'ativo' && !c.deve_trocar_senha)) return false;
      if (acesso && acesso !== 'aguardando' && acesso !== 'ativo' && c.status_acesso !== acesso) return false;
      if (!termo) return true;
      return c.nome.toLowerCase().includes(termo) || (digitos.length >= 3 && c.cpf.includes(digitos));
    });
  }, [consulta.data, busca, acesso]);

  const semAcesso = (consulta.data ?? []).filter((c) => c.status_acesso === 'convidado').length;

  return (
    <>
      <CabecalhoPagina
        titulo="Compradores"
        subtitulo={semAcesso ? `${semAcesso} ainda sem acesso ao app` : 'Quem tem acesso ao app e a quais imóveis'}
        acoes={
          <>
            {ehAdmin && <Botao variante="secundario" onClick={() => setImportar(true)}>Importar todos do Asaas</Botao>}
            <Link to="/compradores/novo" className="inline-flex h-10 items-center rounded-lg bg-noite px-4 text-sm font-semibold text-white hover:bg-marinho">
              Importar um CPF
            </Link>
          </>
        }
      />
      <Cartao>
        <div className="flex flex-wrap gap-3 border-b border-linha p-4">
          <Entrada id="busca-compradores" placeholder="Buscar por nome ou CPF" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-xs" />
          <Selecao id="filtro-acesso" value={acesso} onChange={(e) => setAcesso(e.target.value)} className="max-w-60">
            <option value="">Todos os acessos</option>
            <option value="convidado">Sem acesso (gerar senha)</option>
            <option value="aguardando">Aguardando 1º acesso</option>
            <option value="ativo">App ativo</option>
            <option value="bloqueado">Bloqueado</option>
          </Selecao>
        </div>
        {consulta.isLoading ? (
          <Carregando />
        ) : consulta.error ? (
          <div className="p-4"><MensagemErro erro={mensagemDeErro(consulta.error)} /></div>
        ) : lista.length === 0 ? (
          <Vazio titulo={consulta.data?.length ? 'Ninguém encontrado com essa busca' : 'Nenhum comprador cadastrado'}>
            {!consulta.data?.length && 'Use "Importar todos do Asaas" para trazer os clientes com parcelamento.'}
          </Vazio>
        ) : (
          <Tabela>
            <thead>
              <tr>
                <th>Nome</th>
                <th>CPF</th>
                <th>WhatsApp</th>
                <th>Imóveis</th>
                <th>App</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => {
                const ativos = c.contratos.filter((k) => k.status !== 'cancelado');
                return (
                  <tr key={c.id} onClick={() => navegar(`/compradores/${c.id}`)} className="cursor-pointer hover:bg-fundo/60">
                    <td className="font-semibold">{c.nome}</td>
                    <td className="tabular-nums">{formatarCpf(c.cpf)}</td>
                    <td className="tabular-nums">{c.telefone ? formatarTelefone(c.telefone) : <span className="text-erro">Sem WhatsApp</span>}</td>
                    <td className="text-suave">{ativos.map((k) => k.imoveis?.identificacao).filter(Boolean).join(', ') || '—'}</td>
                    <td><SeloAcesso status={c.status_acesso} aguardando={c.deve_trocar_senha} /></td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      {c.status_acesso === 'convidado' && (
                        <Botao variante="fantasma" className="h-8 px-2" onClick={() => setConvite(c)}>Gerar acesso</Botao>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabela>
        )}
      </Cartao>
      {convite && <ModalConvite comprador={convite} aoFechar={() => setConvite(null)} />}
      {importar && <ModalImportarTodos aoFechar={() => setImportar(false)} />}
    </>
  );
}

function ModalImportarTodos({ aoFechar }: { aoFechar: () => void }) {
  const { empresa } = useEquipe();
  const queryClient = useQueryClient();
  const [etapa, setEtapa] = useState<'confirmar' | 'importando' | 'sincronizando' | 'pronto'>('confirmar');
  const [resultado, setResultado] = useState<ImportarClientesRes | null>(null);
  const [pendentes, setPendentes] = useState(0);
  const [falhas, setFalhas] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  async function importar() {
    setErro(null);
    setEtapa('importando');
    let r: ImportarClientesRes | null = null;
    try {
      r = await chamar<ImportarClientesRes>('asaas-importar-clientes');
      setResultado(r);
      setPendentes(r.pendentes_sync);
      if (r.pendentes_sync > 0) {
        setEtapa('sincronizando');
        // cada chamada sincroniza ~110 s de compradores (até 500); repete até não sobrar ninguém
        let erros = 0;
        for (;;) {
          const s = await chamar<SyncRes>('asaas-sync', { pendentes: true });
          erros += s.erros.length;
          setFalhas(erros);
          setPendentes(s.pendentes);
          if (s.compradores === 0 || (s.pendentes === 0 && s.compradores < 500)) break;
        }
        setPendentes(0);
      }
      setEtapa('pronto');
    } catch (e) {
      setErro(mensagemDeErro(e));
      setEtapa(r ? 'pronto' : 'confirmar');
    } finally {
      await queryClient.invalidateQueries();
    }
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      bloqueado={etapa === 'importando' || etapa === 'sincronizando'}
      titulo="Importar clientes do Asaas"
      largura="max-w-xl"
    >
      {etapa === 'confirmar' && (
        <div className="space-y-4 text-sm text-suave">
          <p>
            Traz do Asaas ({empresa.asaas_ambiente === 'producao' ? 'produção' : 'sandbox'}) todos os clientes com <strong className="text-texto">CPF e
            parcelamento</strong>. Para cada parcelamento ainda não vinculado, cria o comprador, o contrato e um imóvel com o nome do parcelamento,
            marcado <strong className="text-texto">"Revisar"</strong> em Imóveis para vocês completarem endereço e empreendimento.
          </p>
          <p>Quem já está cadastrado não é duplicado. Pode rodar de novo sempre que entrarem clientes novos no Asaas.</p>
          <MensagemErro erro={erro} />
          <div className="flex justify-end gap-2">
            <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
            <Botao onClick={importar}>Importar agora</Botao>
          </div>
        </div>
      )}
      {(etapa === 'importando' || etapa === 'sincronizando') && (
        <div className="space-y-3 py-6 text-center text-sm text-suave">
          <div className="mx-auto size-8 animate-spin rounded-full border-4 border-ciano-escuro border-r-transparent" />
          <p className="font-semibold text-texto">
            {etapa === 'importando' ? 'Lendo os clientes do Asaas…' : `Sincronizando parcelas… faltam ${pendentes} comprador(es)`}
          </p>
          <p>Pode levar alguns minutos. Não feche esta janela.</p>
        </div>
      )}
      {etapa === 'pronto' && resultado && (
        <div className="space-y-4 text-sm">
          <ul className="space-y-1.5">
            <Linha rotulo="Clientes com parcelamento no Asaas" valor={resultado.clientes_com_parcelamento} />
            <Linha rotulo="Compradores novos" valor={resultado.compradores_novos} />
            <Linha rotulo="Contratos novos" valor={resultado.contratos_novos} />
            <Linha rotulo="Parcelamentos que já estavam vinculados" valor={resultado.ja_vinculados} />
            <Linha rotulo="Imóveis para revisar" valor={resultado.imoveis_para_revisar} destaque={resultado.imoveis_para_revisar > 0} />
            {resultado.ignorados.cnpj_ou_cpf_invalido > 0 && <Linha rotulo="Ignorados (CNPJ ou CPF inválido)" valor={resultado.ignorados.cnpj_ou_cpf_invalido} />}
            {resultado.ignorados.cpf_repetido_no_asaas > 0 && <Linha rotulo="CPF cadastrado duas vezes no Asaas" valor={resultado.ignorados.cpf_repetido_no_asaas} />}
          </ul>
          {(pendentes > 0 || falhas > 0) && (
            <p className="rounded-lg bg-alerta-bg px-3 py-2 text-alerta">
              {falhas > 0 ? `${falhas} comprador(es) não sincronizaram por erro no Asaas. ` : ''}
              {pendentes > 0 ? `${pendentes} comprador(es) ainda sem parcelas. ` : ''}A sincronização da madrugada tenta de novo.
            </p>
          )}
          <MensagemErro erro={erro} />
          <p className="text-suave">Próximo passo: revisar os imóveis e gerar o acesso de cada comprador (filtro "Sem acesso").</p>
          <div className="flex justify-end gap-2">
            {resultado.imoveis_para_revisar > 0 && (
              <Link to="/imoveis" className="inline-flex h-10 items-center rounded-lg border border-linha px-4 text-sm font-semibold text-noite hover:bg-fundo">
                Revisar imóveis
              </Link>
            )}
            <Botao onClick={aoFechar}>Fechar</Botao>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <li className="flex justify-between gap-4 border-b border-linha/70 pb-1.5">
      <span className="text-suave">{rotulo}</span>
      <span className={`font-bold tabular-nums ${destaque ? 'text-alerta' : 'text-texto'}`}>{valor}</span>
    </li>
  );
}
