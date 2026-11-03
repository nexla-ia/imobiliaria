import { formatarCpf, formatarData, formatarMoeda, formatarTelefone, type Empreendimento, type LinhaCarteira } from '@planejar/shared';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { SeloAcesso } from '../components/selos';
import { BarraProgresso, Botao, CabecalhoPagina, Cartao, Carregando, Entrada, MensagemErro, Selecao, Selo, Tabela, Vazio } from '../components/ui';
import { buscarTodos, exigir, mensagemDeErro } from '../lib/api';
import { baixarCsv } from '../lib/csv';
import { supabase } from '../lib/supabase';

type Situacao = 'todos' | 'em_dia' | 'atraso' | 'quitado';

/** Somas do `valor` vindo do Asaas, feitas no banco (RPC resumo_carteira). */
type ResumoCarteira = {
  a_vencer: number;
  parcelas_a_vencer: number;
  vencido: number;
  parcelas_vencidas: number;
  contratos_em_atraso: number;
  previsto_mes: number;
  pago_do_previsto_mes: number;
  recebido_mes: number;
  recebido_total: number;
  proximos_30_dias: number;
  parcelas_proximos_30: number;
};
type MesPrevisto = { mes: string; valor: number; parcelas: number };

const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** "2026-11-01" → "nov/2026" (sem passar por Date, para não depender do fuso do navegador). */
function nomeDoMes(iso: string) {
  const [ano, mes] = iso.split('-');
  return `${NOMES_MES[Number(mes) - 1]}/${ano}`;
}

export function Carteira() {
  const navegar = useNavigate();
  const [empreendimento, setEmpreendimento] = useState('');
  const [situacao, setSituacao] = useState<Situacao>('todos');
  const [busca, setBusca] = useState('');

  const carteira = useQuery({
    queryKey: ['carteira'],
    queryFn: () =>
      buscarTodos<LinhaCarteira>((de, ate) =>
        supabase.from('vw_carteira').select('*').neq('status_contrato', 'cancelado').order('comprador_nome').order('contrato_id').range(de, ate),
      ),
  });
  const empreendimentos = useQuery({
    queryKey: ['empreendimentos'],
    queryFn: async () => exigir(await supabase.from('empreendimentos').select('*').order('nome')) as Empreendimento[],
  });
  // somados no banco: valor pago de fato, no fuso da empresa, sem o corte de 1000 linhas
  const resumo = useQuery({
    queryKey: ['resumo-carteira', empreendimento],
    queryFn: async () => exigir<ResumoCarteira>(await supabase.rpc('resumo_carteira', { p_empreendimento_id: empreendimento || null })),
  });
  const previsao = useQuery({
    queryKey: ['previsao-recebimento', empreendimento],
    queryFn: async () =>
      exigir<MesPrevisto[]>(await supabase.rpc('previsao_recebimento', { p_empreendimento_id: empreendimento || null, p_meses: 6 })).map((m) => ({
        ...m,
        valor: Number(m.valor),
      })),
  });

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = termo.replace(/\D/g, '');
    return (carteira.data ?? []).filter((l) => {
      if (empreendimento && l.empreendimento_id !== empreendimento) return false;
      if (situacao === 'em_dia' && (l.parcelas_vencidas > 0 || l.status_contrato === 'quitado')) return false;
      if (situacao === 'atraso' && l.parcelas_vencidas === 0) return false;
      if (situacao === 'quitado' && l.status_contrato !== 'quitado') return false;
      if (termo && !l.comprador_nome.toLowerCase().includes(termo) && !(digitos.length >= 3 && l.comprador_cpf.includes(digitos)) && !l.imovel.toLowerCase().includes(termo)) {
        return false;
      }
      return true;
    });
  }, [carteira.data, empreendimento, situacao, busca]);

  const doFiltro = (carteira.data ?? []).filter((l) => !empreendimento || l.empreendimento_id === empreendimento);
  const ativos = doFiltro.filter((l) => l.status_contrato === 'ativo');
  const appAtivo = new Set(doFiltro.filter((l) => l.status_acesso === 'ativo' && !l.deve_trocar_senha).map((l) => l.comprador_id)).size;
  const compradores = new Set(doFiltro.map((l) => l.comprador_id)).size;

  const r = resumo.data;
  const moeda = (v: number | undefined) => (v == null ? '…' : formatarMoeda(Number(v)));
  const aReceber = r ? Number(r.a_vencer) + Number(r.vencido) : undefined;
  const pctVencido = r && aReceber ? Math.round((Number(r.vencido) / aReceber) * 1000) / 10 : 0;
  const mesAtual = previsao.data?.[0] ? nomeDoMes(previsao.data[0].mes) : 'no mês';

  function exportar() {
    baixarCsv(
      `carteira-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Comprador', 'CPF', 'Telefone', 'Empreendimento', 'Imóvel', 'Situação', 'Parcelas pagas', 'Total de parcelas', 'Parcelas vencidas', 'Vencida desde', 'Valor vencido', 'Total pago', 'Saldo em aberto', 'App'],
      linhas.map((l) => [
        l.comprador_nome,
        formatarCpf(l.comprador_cpf),
        l.comprador_telefone ? formatarTelefone(l.comprador_telefone) : '',
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
        l.status_acesso === 'bloqueado' ? 'Bloqueado' : l.status_acesso !== 'ativo' ? 'Não ativou' : l.deve_trocar_senha ? 'Aguardando 1º acesso' : 'Ativo',
      ]),
    );
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Carteira"
        subtitulo="Situação dos contratos, atualizada com o Asaas"
        acoes={
          <>
            <Selecao id="filtro-empreendimento" aria-label="Empreendimento" value={empreendimento} onChange={(e) => setEmpreendimento(e.target.value)} className="max-w-64">
              <option value="">Todos os empreendimentos</option>
              {empreendimentos.data?.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </Selecao>
            <Botao variante="secundario" onClick={exportar} disabled={!linhas.length}>Exportar CSV</Botao>
          </>
        }
      />

      {resumo.error && <div className="mb-4"><MensagemErro erro={mensagemDeErro(resumo.error)} /></div>}
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="A receber" valor={moeda(aReceber)} detalhe={r ? `${r.parcelas_a_vencer + r.parcelas_vencidas} parcelas em aberto` : ''} />
        <Indicador
          rotulo="Em atraso"
          valor={moeda(r?.vencido)}
          tom={r && Number(r.vencido) > 0 ? 'erro' : undefined}
          detalhe={r ? `${r.contratos_em_atraso} contrato${r.contratos_em_atraso === 1 ? '' : 's'} · ${String(pctVencido).replace('.', ',')}% do que falta receber` : ''}
        />
        <Indicador rotulo={`Previsto em ${mesAtual}`} valor={moeda(r?.previsto_mes)} detalhe={r ? `${moeda(r.pago_do_previsto_mes)} já pago` : ''}>
          {r && <BarraValor valor={Number(r.pago_do_previsto_mes)} total={Number(r.previsto_mes)} rotulo="Pago do previsto no mês" />}
        </Indicador>
        <Indicador rotulo="Próximos 30 dias" valor={moeda(r?.proximos_30_dias)} detalhe={r ? `${r.parcelas_proximos_30} parcelas a vencer` : ''} />
      </div>

      <div className="mb-6 grid gap-3 lg:grid-cols-3">
        <Cartao titulo="Previsão de recebimento" className="lg:col-span-2">
          {previsao.error ? (
            <div className="p-4"><MensagemErro erro={mensagemDeErro(previsao.error)} /></div>
          ) : !previsao.data ? (
            <Carregando />
          ) : (
            <Previsao meses={previsao.data} />
          )}
          <p className="border-t border-linha px-5 py-3 text-xs text-suave">
            Parcelas em aberto, pelo mês do vencimento e pelo valor do Asaas. Não inclui as vencidas ({moeda(r?.vencido)}) nem juros e multa.
          </p>
        </Cartao>
        <Cartao titulo="Resumo">
          <dl className="divide-y divide-linha text-sm">
            <LinhaResumo rotulo={`Recebido em ${mesAtual}`} valor={moeda(r?.recebido_mes)} dica="pagamentos confirmados no mês, de qualquer vencimento" />
            <LinhaResumo rotulo="Total já recebido" valor={moeda(r?.recebido_total)} dica="desde o início dos contratos" />
            <LinhaResumo rotulo="Contratos ativos" valor={String(ativos.length)} dica={`${compradores} compradores`} />
            <LinhaResumo rotulo="Usando o app" valor={`${appAtivo} de ${compradores}`} dica="compradores com acesso ativo" />
          </dl>
        </Cartao>
      </div>

      <Cartao>
        <div className="flex flex-wrap gap-3 border-b border-linha p-4">
          <Entrada id="busca-carteira" placeholder="Buscar por nome, CPF ou imóvel" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-xs" />
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
                  <td><SeloAcesso status={l.status_acesso} aguardando={l.deve_trocar_senha} /></td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Cartao>
    </>
  );
}

function Indicador({ rotulo, valor, detalhe, tom, children }: { rotulo: string; valor: string; detalhe: string; tom?: 'erro' | 'ok'; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-linha bg-white p-4 shadow-cartao">
      <p className="text-xs font-semibold tracking-wide text-suave uppercase">{rotulo}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tom === 'erro' ? 'text-erro' : 'text-noite'}`}>{valor}</p>
      {children}
      <p className="mt-0.5 text-xs text-suave">{detalhe}</p>
    </div>
  );
}

function BarraValor({ valor, total, rotulo }: { valor: number; total: number; rotulo: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((valor / total) * 100)) : 0;
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-linha" role="progressbar" aria-label={rotulo} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-ciano-escuro" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-suave tabular-nums">{pct}%</span>
    </div>
  );
}

/** Uma linha por mês: barra proporcional ao maior mês, com valor e quantidade de parcelas sempre visíveis. */
function Previsao({ meses }: { meses: MesPrevisto[] }) {
  const maior = Math.max(...meses.map((m) => m.valor), 0);
  if (maior === 0) return <Vazio titulo="Nenhuma parcela em aberto">Quando houver parcelas a vencer, a previsão aparece aqui.</Vazio>;
  return (
    <ul className="space-y-1 px-5 py-4">
      {meses.map((m, i) => (
        <li
          key={m.mes}
          className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-fundo"
          title={`${nomeDoMes(m.mes)}: ${formatarMoeda(m.valor)} em ${m.parcelas} parcela${m.parcelas === 1 ? '' : 's'}`}
        >
          <span className="text-sm font-semibold text-texto">
            {nomeDoMes(m.mes)}
            {i === 0 && <span className="block text-xs font-normal text-suave">restante</span>}
          </span>
          <div className="h-3" aria-hidden>
            <div className="h-full rounded-r bg-ciano-escuro" style={{ width: `${Math.max((m.valor / maior) * 100, m.valor > 0 ? 1 : 0)}%` }} />
          </div>
          <span className="text-right text-sm tabular-nums">
            <span className="font-semibold text-texto">{formatarMoeda(m.valor)}</span>
            <span className="block text-xs text-suave">{m.parcelas} parcela{m.parcelas === 1 ? '' : 's'}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function LinhaResumo({ rotulo, valor, dica }: { rotulo: string; valor: string; dica: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-5 py-3">
      <dt>
        <span className="font-semibold text-texto">{rotulo}</span>
        <span className="block text-xs text-suave">{dica}</span>
      </dt>
      <dd className="font-bold whitespace-nowrap text-noite tabular-nums">{valor}</dd>
    </div>
  );
}
