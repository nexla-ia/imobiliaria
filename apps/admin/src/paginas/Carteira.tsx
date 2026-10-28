import { formatarCpf, formatarData, formatarMoeda, type Empreendimento, type LinhaCarteira } from '@planejar/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { SeloAcesso } from '../components/selos';
import { BarraProgresso, Botao, CabecalhoPagina, Cartao, Carregando, Entrada, MensagemErro, Selecao, Selo, Tabela, Vazio } from '../components/ui';
import { exigir, mensagemDeErro } from '../lib/api';
import { baixarCsv } from '../lib/csv';
import { supabase } from '../lib/supabase';

type Situacao = 'todos' | 'em_dia' | 'atraso' | 'quitado';

function inicioDoMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function Carteira() {
  const navegar = useNavigate();
  const [empreendimento, setEmpreendimento] = useState('');
  const [situacao, setSituacao] = useState<Situacao>('todos');
  const [busca, setBusca] = useState('');

  const carteira = useQuery({
    queryKey: ['carteira'],
    queryFn: async () =>
      exigir(await supabase.from('vw_carteira').select('*').neq('status_contrato', 'cancelado').order('comprador_nome')) as LinhaCarteira[],
  });
  const empreendimentos = useQuery({
    queryKey: ['empreendimentos'],
    queryFn: async () => exigir(await supabase.from('empreendimentos').select('*').order('nome')) as Empreendimento[],
  });
  const recebidoMes = useQuery({
    queryKey: ['recebido-mes'],
    queryFn: async () => {
      const linhas = exigir(
        await supabase
          .from('cobrancas')
          .select('valor, valor_original, contrato_id')
          .eq('status_app', 'paga')
          .gte('data_pagamento', inicioDoMes()),
      ) as Array<{ valor: number; valor_original: number | null }>;
      return linhas.reduce((s, l) => s + Number(l.valor_original ?? l.valor), 0);
    },
  });

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = termo.replace(/\D/g, '');
    return (carteira.data ?? []).filter((l) => {
      if (empreendimento && l.empreendimento_id !== empreendimento) return false;
      if (situacao === 'em_dia' && (l.parcelas_vencidas > 0 || l.status_contrato === 'quitado')) return false;
      if (situacao === 'atraso' && l.parcelas_vencidas === 0) return false;
      if (situacao === 'quitado' && l.status_contrato !== 'quitado') return false;
      if (termo && !l.comprador_nome.toLowerCase().includes(termo) && !(digitos && l.comprador_cpf.includes(digitos)) && !l.imovel.toLowerCase().includes(termo)) {
        return false;
      }
      return true;
    });
  }, [carteira.data, empreendimento, situacao, busca]);

  const ativos = (carteira.data ?? []).filter((l) => l.status_contrato === 'ativo');
  const emAtraso = ativos.filter((l) => l.parcelas_vencidas > 0);
  const valorVencido = ativos.reduce((s, l) => s + Number(l.valor_vencido), 0);
  const appAtivo = new Set((carteira.data ?? []).filter((l) => l.status_acesso === 'ativo').map((l) => l.comprador_id)).size;
  const compradores = new Set((carteira.data ?? []).map((l) => l.comprador_id)).size;

  function exportar() {
    baixarCsv(
      `carteira-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Comprador', 'CPF', 'Telefone', 'Empreendimento', 'Imóvel', 'Situação', 'Parcelas pagas', 'Total de parcelas', 'Parcelas vencidas', 'Vencida desde', 'Valor vencido', 'Total pago', 'Saldo em aberto', 'App'],
      linhas.map((l) => [
        l.comprador_nome,
        formatarCpf(l.comprador_cpf),
        l.comprador_telefone ?? '',
        l.empreendimento ?? '',
        l.imovel,
        l.status_contrato === 'quitado' ? 'Quitado' : l.parcelas_vencidas > 0 ? 'Em atraso' : 'Em dia',
        l.parcelas_pagas,
        l.total_parcelas,
        l.parcelas_vencidas,
        l.vencida_desde ? formatarData(l.vencida_desde) : '',
        Number(l.valor_vencido).toFixed(2).replace('.', ','),
        Number(l.total_pago).toFixed(2).replace('.', ','),
        Number(l.saldo_em_aberto).toFixed(2).replace('.', ','),
        l.status_acesso === 'ativo' ? 'Ativo' : l.status_acesso === 'bloqueado' ? 'Bloqueado' : 'Não ativou',
      ]),
    );
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Carteira"
        subtitulo="Situação dos contratos, atualizada com o Asaas"
        acoes={<Botao variante="secundario" onClick={exportar} disabled={!linhas.length}>Exportar CSV</Botao>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Contratos ativos" valor={String(ativos.length)} detalhe={`${compradores} compradores`} />
        <Indicador rotulo="Em atraso" valor={String(emAtraso.length)} detalhe={`${formatarMoeda(valorVencido)} vencidos`} tom={emAtraso.length ? 'erro' : 'ok'} />
        <Indicador rotulo="Recebido no mês" valor={recebidoMes.data == null ? '…' : formatarMoeda(recebidoMes.data)} detalhe="pagamentos confirmados" />
        <Indicador rotulo="Usando o app" valor={`${appAtivo} de ${compradores}`} detalhe="compradores com acesso ativo" />
      </div>

      <Cartao>
        <div className="flex flex-wrap gap-3 border-b border-linha p-4">
          <Entrada id="busca-carteira" placeholder="Buscar por nome, CPF ou imóvel" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-xs" />
          <Selecao id="filtro-empreendimento" value={empreendimento} onChange={(e) => setEmpreendimento(e.target.value)} className="max-w-60">
            <option value="">Todos os empreendimentos</option>
            {empreendimentos.data?.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </Selecao>
          <div className="flex rounded-lg bg-fundo p-1" role="group" aria-label="Situação">
            {(['todos', 'em_dia', 'atraso', 'quitado'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSituacao(s)}
                aria-pressed={situacao === s}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${situacao === s ? 'bg-white text-noite shadow-sm' : 'text-suave'}`}
              >
                {{ todos: 'Todos', em_dia: 'Em dia', atraso: 'Em atraso', quitado: 'Quitados' }[s]}
              </button>
            ))}
          </div>
        </div>

        {carteira.isLoading ? (
          <Carregando />
        ) : carteira.error ? (
          <div className="p-4"><MensagemErro erro={mensagemDeErro(carteira.error)} /></div>
        ) : linhas.length === 0 ? (
          <Vazio titulo={carteira.data?.length ? 'Nenhum contrato com esses filtros' : 'Nenhum contrato ainda'}>
            {!carteira.data?.length && 'Importe um comprador do Asaas em Compradores para começar.'}
          </Vazio>
        ) : (
          <Tabela>
            <thead>
              <tr>
                <th>Comprador</th>
                <th>Imóvel</th>
                <th>Parcelas pagas</th>
                <th>Situação</th>
                <th className="text-right">Vencido</th>
                <th>App</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.contrato_id} onClick={() => navegar(`/compradores/${l.comprador_id}`)} className="cursor-pointer hover:bg-fundo/60">
                  <td>
                    <div className="font-semibold">{l.comprador_nome}</div>
                    <div className="text-xs text-suave">{formatarCpf(l.comprador_cpf)}</div>
                  </td>
                  <td>
                    <div>{l.imovel}</div>
                    <div className="text-xs text-suave">{l.empreendimento ?? 'Sem empreendimento'}</div>
                  </td>
                  <td><BarraProgresso valor={l.parcelas_pagas} total={l.total_parcelas} /></td>
                  <td>
                    {l.status_contrato === 'quitado' ? (
                      <Selo tom="ok">Quitado</Selo>
                    ) : l.parcelas_vencidas > 0 ? (
                      <div>
                        <Selo tom="erro">{l.parcelas_vencidas} vencida{l.parcelas_vencidas > 1 ? 's' : ''}</Selo>
                        {l.vencida_desde && <div className="mt-1 text-xs text-suave">desde {formatarData(l.vencida_desde)}</div>}
                      </div>
                    ) : (
                      <Selo tom="info">Em dia</Selo>
                    )}
                  </td>
                  <td className="text-right font-semibold">{Number(l.valor_vencido) > 0 ? formatarMoeda(Number(l.valor_vencido)) : '—'}</td>
                  <td><SeloAcesso status={l.status_acesso} /></td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Cartao>
    </>
  );
}

function Indicador({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: string; detalhe: string; tom?: 'erro' | 'ok' }) {
  return (
    <div className="rounded-xl border border-linha bg-white p-4">
      <p className="text-xs font-semibold tracking-wide text-suave uppercase">{rotulo}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tom === 'erro' ? 'text-erro' : 'text-noite'}`}>{valor}</p>
      <p className="mt-0.5 text-xs text-suave">{detalhe}</p>
    </div>
  );
}
