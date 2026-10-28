import {
  formatarCpf,
  formatarData,
  formatarMoeda,
  formatarTelefone,
  type Cobranca,
  type Comprador,
  type Contrato,
  type Documento,
  type ResumoContrato,
  type SyncRes,
  type TipoDocumento,
} from '@planejar/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ModalConvite } from '../components/Convite';
import { SeloAcesso, SeloCobranca, SeloContrato } from '../components/selos';
import {
  BarraProgresso,
  Botao,
  CabecalhoPagina,
  Campo,
  Cartao,
  Carregando,
  Confirmar,
  Entrada,
  MensagemErro,
  Modal,
  Selecao,
  Tabela,
  useAvisar,
  Vazio,
} from '../components/ui';
import { chamar, exigir, mensagemDeErro } from '../lib/api';
import { useEquipe } from '../lib/sessao';
import { supabase } from '../lib/supabase';
import { normalizarTelefone } from '../lib/telefone';

type ContratoDetalhe = Contrato & { imoveis: { identificacao: string; empreendimentos: { nome: string } | null } | null };

export function CompradorDetalhe() {
  const { id = '' } = useParams();
  const { empresa } = useEquipe();
  const avisar = useAvisar();
  const queryClient = useQueryClient();
  const [sincronizando, setSincronizando] = useState(false);
  const [convite, setConvite] = useState(false);
  const [salvandoBloqueio, setSalvandoBloqueio] = useState(false);
  // momento em que a tela abriu, para comparar a validade da senha provisória
  const [agora] = useState(() => Date.now());
  const [confirmarBloqueio, setConfirmarBloqueio] = useState(false);
  const [editando, setEditando] = useState(false);

  const comprador = useQuery({
    queryKey: ['comprador', id],
    queryFn: async () => exigir(await supabase.from('compradores').select('*').eq('id', id).single()) as Comprador,
  });
  const contratos = useQuery({
    queryKey: ['comprador', id, 'contratos'],
    queryFn: async () =>
      exigir(
        await supabase
          .from('contratos')
          .select('*, imoveis(identificacao, empreendimentos(nome))')
          .eq('comprador_id', id)
          .order('created_at'),
      ) as ContratoDetalhe[],
  });
  const resumos = useQuery({
    queryKey: ['comprador', id, 'resumos'],
    queryFn: async () => exigir(await supabase.from('vw_resumo_contrato').select('*').eq('comprador_id', id)) as ResumoContrato[],
  });
  const cobrancas = useQuery({
    queryKey: ['comprador', id, 'cobrancas'],
    queryFn: async () =>
      exigir(
        await supabase
          .from('cobrancas')
          .select('*')
          .eq('comprador_id', id)
          .order('numero_parcela', { ascending: true, nullsFirst: false })
          .order('vencimento'),
      ) as Cobranca[],
  });

  async function sincronizar() {
    setSincronizando(true);
    try {
      const r = await chamar<SyncRes>('asaas-sync', { comprador_id: id });
      avisar(`Sincronizado com o Asaas: ${r.cobrancas} cobranças atualizadas.`);
      await queryClient.invalidateQueries({ queryKey: ['comprador', id] });
      await queryClient.invalidateQueries({ queryKey: ['carteira'] });
    } catch (e) {
      avisar(mensagemDeErro(e), 'erro');
    } finally {
      setSincronizando(false);
    }
  }

  async function alternarBloqueio() {
    const c = comprador.data!;
    const novo = c.status_acesso === 'bloqueado' ? (c.auth_user_id ? 'ativo' : 'convidado') : 'bloqueado';
    setSalvandoBloqueio(true);
    try {
      exigir(await supabase.from('compradores').update({ status_acesso: novo }).eq('id', id));
      avisar(novo === 'bloqueado' ? 'Acesso bloqueado. O comprador não vê mais nada no app.' : 'Acesso liberado.');
      setConfirmarBloqueio(false);
      await queryClient.invalidateQueries();
    } catch (e) {
      avisar(mensagemDeErro(e), 'erro');
    } finally {
      setSalvandoBloqueio(false);
    }
  }

  if (comprador.isLoading) return <Carregando />;
  if (comprador.error || !comprador.data) return <MensagemErro erro={mensagemDeErro(comprador.error) || 'Comprador não encontrado.'} />;
  const c = comprador.data;
  const avulsas = (cobrancas.data ?? []).filter((x) => !x.contrato_id);

  return (
    <>
      <CabecalhoPagina
        titulo={c.nome}
        subtitulo={
          <span className="flex flex-wrap items-center gap-2">
            CPF {formatarCpf(c.cpf)} <SeloAcesso status={c.status_acesso} aguardando={c.deve_trocar_senha} />
            {c.excluido_em && <span className="text-xs">· excluiu a conta do app em {formatarData(c.excluido_em)}</span>}
          </span>
        }
        acoes={
          <>
            <Botao variante="secundario" onClick={sincronizar} carregando={sincronizando} disabled={!c.asaas_customer_id}>
              Sincronizar com Asaas
            </Botao>
            {c.status_acesso !== 'bloqueado' && (
              <Botao variante="secundario" onClick={() => setConvite(true)}>
                {c.status_acesso !== 'ativo' ? 'Gerar acesso ao app' : c.deve_trocar_senha ? 'Gerar nova senha provisória' : 'Nova senha (esqueceu)'}
              </Botao>
            )}
            <Botao variante={c.status_acesso === 'bloqueado' ? 'primario' : 'fantasma'} onClick={() => setConfirmarBloqueio(true)}>
              {c.status_acesso === 'bloqueado' ? 'Desbloquear acesso' : 'Bloquear acesso'}
            </Botao>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          {contratos.isLoading ? (
            <Carregando />
          ) : contratos.data?.length === 0 ? (
            <Cartao>
              <Vazio titulo="Nenhum contrato vinculado">
                <Link to={`/compradores/novo?cpf=${c.cpf}`} className="font-semibold text-ciano-escuro">Vincular parcelamento do Asaas</Link>
              </Vazio>
            </Cartao>
          ) : (
            contratos.data?.map((k) => (
              <CartaoContrato
                key={k.id}
                contrato={k}
                resumo={resumos.data?.find((r) => r.contrato_id === k.id)}
                cobrancas={(cobrancas.data ?? []).filter((x) => x.contrato_id === k.id)}
              />
            ))
          )}

          {avulsas.length > 0 && (
            <Cartao titulo="Cobranças avulsas" acoes={<span className="text-xs text-suave">{empresa.mostrar_cobrancas_avulsas ? 'Aparecem no app' : 'Não aparecem no app'}</span>}>
              <TabelaCobrancas cobrancas={avulsas} avulsas />
            </Cartao>
          )}

          <Documentos comprador={c} contratos={contratos.data ?? []} />
        </div>

        <aside className="space-y-6">
          <Cartao titulo="Contato" acoes={<Botao variante="fantasma" className="h-8 px-2" onClick={() => setEditando(true)}>Editar</Botao>}>
            <dl className="space-y-3 p-5 text-sm">
              <div><dt className="text-xs text-suave">WhatsApp</dt><dd className="font-semibold">{c.telefone ? formatarTelefone(c.telefone) : <span className="text-erro">Não informado</span>}</dd></div>
              <div><dt className="text-xs text-suave">E-mail</dt><dd className="font-semibold break-all">{c.email || '—'}</dd></div>
              <div><dt className="text-xs text-suave">Cliente no Asaas</dt><dd className="font-mono text-xs">{c.asaas_customer_id || '—'}</dd></div>
            </dl>
          </Cartao>
          <Cartao titulo="Acesso ao app">
            <dl className="space-y-3 p-5 text-sm">
              <div><dt className="text-xs text-suave">Situação</dt><dd><SeloAcesso status={c.status_acesso} aguardando={c.deve_trocar_senha} /></dd></div>
              {c.deve_trocar_senha && c.senha_provisoria_expira_em && (
                <div>
                  <dt className="text-xs text-suave">Senha provisória</dt>
                  <dd className={`font-semibold ${Date.parse(c.senha_provisoria_expira_em) < agora ? 'text-erro' : ''}`}>
                    {Date.parse(c.senha_provisoria_expira_em) < agora ? 'Expirou em ' : 'Vale até '}
                    {new Date(c.senha_provisoria_expira_em).toLocaleDateString('pt-BR')}
                  </dd>
                </div>
              )}
              <div><dt className="text-xs text-suave">Ativou em</dt><dd className="font-semibold">{c.ativado_em ? new Date(c.ativado_em).toLocaleString('pt-BR') : 'Ainda não ativou'}</dd></div>
              <div><dt className="text-xs text-suave">Aceitou os termos em</dt><dd className="font-semibold">{c.termos_aceitos_em ? new Date(c.termos_aceitos_em).toLocaleString('pt-BR') : '—'}</dd></div>
              <div><dt className="text-xs text-suave">Última sincronização</dt><dd className="font-semibold">{c.ultima_sync_em ? new Date(c.ultima_sync_em).toLocaleString('pt-BR') : 'Nunca'}</dd></div>
            </dl>
          </Cartao>
        </aside>
      </div>

      {convite && <ModalConvite comprador={c} aoFechar={() => setConvite(false)} />}
      <Confirmar
        aberto={confirmarBloqueio}
        aoFechar={() => setConfirmarBloqueio(false)}
        aoConfirmar={alternarBloqueio}
        carregando={salvandoBloqueio}
        titulo={c.status_acesso === 'bloqueado' ? 'Desbloquear acesso?' : 'Bloquear acesso ao app?'}
        texto={
          c.status_acesso === 'bloqueado'
            ? 'O comprador volta a ver parcelas, boletos e documentos no app.'
            : 'O comprador deixa de ver parcelas, boletos e documentos no app e não consegue pedir código de acesso. As cobranças no Asaas não mudam.'
        }
        rotulo={c.status_acesso === 'bloqueado' ? 'Desbloquear' : 'Bloquear'}
        perigo={c.status_acesso !== 'bloqueado'}
      />
      {editando && <EditarContato aberto aoFechar={() => setEditando(false)} comprador={c} />}
    </>
  );
}

function CartaoContrato({ contrato, resumo, cobrancas }: { contrato: ContratoDetalhe; resumo?: ResumoContrato; cobrancas: Cobranca[] }) {
  const queryClient = useQueryClient();
  const avisar = useAvisar();
  const [cancelar, setCancelar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aberto, setAberto] = useState(contrato.status !== 'cancelado');

  async function mudarStatus(status: 'cancelado' | 'ativo') {
    setSalvando(true);
    try {
      exigir(await supabase.from('contratos').update({ status }).eq('id', contrato.id));
      if (status === 'ativo') {
        // volta como ativo e o sync recalcula (pode virar quitado)
        await chamar<SyncRes>('asaas-sync', { contrato_id: contrato.id }).catch(() => null);
      }
      avisar(status === 'cancelado' ? 'Contrato cancelado. Ele não aparece mais no app.' : 'Contrato reativado. Volta a aparecer no app.');
      setCancelar(false);
      await queryClient.invalidateQueries();
    } catch (e) {
      avisar(/unique|duplicate/i.test(mensagemDeErro(e)) || /Já existe/.test(mensagemDeErro(e))
        ? 'Este parcelamento já está ligado a outro contrato ativo.'
        : mensagemDeErro(e), 'erro');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Cartao
      titulo={
        <span className="flex flex-wrap items-center gap-2">
          {contrato.imoveis?.identificacao ?? 'Imóvel'}
          <span className="text-sm font-normal text-suave">{contrato.imoveis?.empreendimentos?.nome}</span>
          <SeloContrato status={contrato.status} />
        </span>
      }
      acoes={
        <>
          <Botao variante="fantasma" className="h-8 px-2" onClick={() => setAberto(!aberto)}>{aberto ? 'Recolher' : 'Ver parcelas'}</Botao>
          {contrato.status !== 'cancelado' ? (
            <Botao variante="fantasma" className="h-8 px-2 text-erro" onClick={() => setCancelar(true)}>Cancelar contrato</Botao>
          ) : (
            <Botao variante="fantasma" className="h-8 px-2" onClick={() => mudarStatus('ativo')} carregando={salvando}>Reativar contrato</Botao>
          )}
        </>
      }
    >
      {resumo && (
        <div className="grid grid-cols-2 gap-4 border-b border-linha px-5 py-4 text-sm sm:grid-cols-4">
          <div><p className="text-xs text-suave">Parcelas pagas</p><BarraProgresso valor={resumo.parcelas_pagas} total={resumo.total_parcelas} /></div>
          <div><p className="text-xs text-suave">Total pago</p><p className="font-bold tabular-nums">{formatarMoeda(Number(resumo.total_pago))}</p></div>
          <div><p className="text-xs text-suave">Saldo em aberto</p><p className="font-bold tabular-nums">{formatarMoeda(Number(resumo.saldo_em_aberto))}</p></div>
          <div><p className="text-xs text-suave">Vencidas</p><p className={`font-bold ${resumo.parcelas_vencidas ? 'text-erro' : ''}`}>{resumo.parcelas_vencidas}</p></div>
        </div>
      )}
      <p className="px-5 pt-3 text-xs text-suave">
        Parcelamento Asaas <span className="font-mono">{contrato.asaas_installment_id ?? '—'}</span>
        {contrato.ultima_sync_em && ` · sincronizado em ${new Date(contrato.ultima_sync_em).toLocaleString('pt-BR')}`}
      </p>
      {aberto && (cobrancas.length ? <TabelaCobrancas cobrancas={cobrancas} /> : <Vazio titulo="Nenhuma parcela sincronizada ainda">Use "Sincronizar com Asaas".</Vazio>)}
      <Confirmar
        aberto={cancelar}
        aoFechar={() => setCancelar(false)}
        aoConfirmar={() => mudarStatus('cancelado')}
        carregando={salvando}
        titulo="Cancelar este contrato no app?"
        texto="O contrato e as parcelas deixam de aparecer para o comprador. Nada é alterado no Asaas: cancele ou remova as cobranças lá, se for o caso. Dá para reativar depois."
        rotulo="Cancelar contrato"
        perigo
      />
    </Cartao>
  );
}

function TabelaCobrancas({ cobrancas, avulsas }: { cobrancas: Cobranca[]; avulsas?: boolean }) {
  return (
    <Tabela>
      <thead>
        <tr>
          <th>{avulsas ? 'Descrição' : 'Nº'}</th>
          <th>Vencimento</th>
          <th className="text-right">Valor</th>
          <th>Situação</th>
          <th>Pago em</th>
          <th>Links</th>
        </tr>
      </thead>
      <tbody>
        {cobrancas.map((x) => (
          <tr key={x.id} className={x.removida ? 'opacity-50' : ''}>
            <td className="font-semibold">{avulsas ? x.descricao || x.asaas_payment_id : x.numero_parcela ?? '—'}</td>
            <td className="tabular-nums">{formatarData(x.vencimento)}</td>
            <td className="text-right tabular-nums">
              {formatarMoeda(Number(x.valor))}
              {x.valor_original != null && Number(x.valor_original) !== Number(x.valor) && (
                <div className="text-xs text-suave">original {formatarMoeda(Number(x.valor_original))}</div>
              )}
            </td>
            <td><SeloCobranca status={x.status_app} removida={x.removida} /></td>
            <td className="tabular-nums">{x.data_pagamento ? formatarData(x.data_pagamento) : '—'}</td>
            <td className="space-x-3 text-xs font-semibold whitespace-nowrap">
              {x.invoice_url && <a href={x.invoice_url} target="_blank" rel="noreferrer" className="text-ciano-escuro hover:underline">Fatura</a>}
              {x.comprovante_url && <a href={x.comprovante_url} target="_blank" rel="noreferrer" className="text-ciano-escuro hover:underline">Comprovante</a>}
            </td>
          </tr>
        ))}
      </tbody>
    </Tabela>
  );
}

const tiposDocumento: Record<TipoDocumento, string> = { contrato: 'Contrato', aditivo: 'Aditivo', escritura: 'Escritura', outro: 'Outro' };

function Documentos({ comprador, contratos }: { comprador: Comprador; contratos: ContratoDetalhe[] }) {
  const queryClient = useQueryClient();
  const avisar = useAvisar();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState<TipoDocumento>('contrato');
  const [contratoId, setContratoId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [remover, setRemover] = useState<Documento | null>(null);
  const [removendo, setRemovendo] = useState(false);

  const docs = useQuery({
    queryKey: ['comprador', comprador.id, 'documentos'],
    queryFn: async () =>
      exigir(await supabase.from('documentos').select('*').eq('comprador_id', comprador.id).order('created_at', { ascending: false })) as Documento[],
  });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!arquivo) return setErro('Escolha um arquivo PDF.');
    if (arquivo.type !== 'application/pdf') return setErro('Envie apenas arquivos PDF.');
    if (arquivo.size > 20 * 1024 * 1024) return setErro('O arquivo passa de 20 MB.');
    setErro(null);
    setEnviando(true);
    try {
      const caminho = `${comprador.empresa_id}/${comprador.id}/${crypto.randomUUID()}.pdf`;
      exigir(await supabase.storage.from('documentos').upload(caminho, arquivo, { contentType: 'application/pdf' }));
      const inserido = await supabase.from('documentos').insert({
          empresa_id: comprador.empresa_id,
          comprador_id: comprador.id,
          contrato_id: contratoId || null,
          titulo: titulo.trim() || arquivo.name.replace(/\.pdf$/i, ''),
          tipo,
          storage_path: caminho,
        });
      if (inserido.error) {
        await supabase.storage.from('documentos').remove([caminho]); // não deixa o PDF sem cadastro
        throw inserido.error;
      }
      avisar('Documento enviado. Já aparece no app do comprador.');
      setArquivo(null);
      setTitulo('');
      (e.target as HTMLFormElement).reset();
      await queryClient.invalidateQueries({ queryKey: ['comprador', comprador.id, 'documentos'] });
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  async function abrir(d: Documento) {
    const { data, error } = await supabase.storage.from('documentos').createSignedUrl(d.storage_path, 300);
    if (error || !data) return avisar('Não foi possível abrir o arquivo.', 'erro');
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function confirmarRemocao() {
    if (!remover) return;
    setRemovendo(true);
    try {
      exigir(await supabase.from('documentos').delete().eq('id', remover.id));
      const { error: erroArquivo } = await supabase.storage.from('documentos').remove([remover.storage_path]);
      if (erroArquivo) console.warn('arquivo do documento não removido do Storage', erroArquivo);
      avisar('Documento removido.');
      setRemover(null);
      await queryClient.invalidateQueries({ queryKey: ['comprador', comprador.id, 'documentos'] });
    } catch (e) {
      avisar(mensagemDeErro(e), 'erro');
    } finally {
      setRemovendo(false);
    }
  }

  return (
    <Cartao titulo="Documentos">
      <form onSubmit={enviar} className="grid gap-4 border-b border-linha p-5 md:grid-cols-2">
        <Campo rotulo="Arquivo PDF">
          <input
            id="arquivo-documento"
            type="file"
            accept="application/pdf"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className="min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-fundo file:px-3 file:py-2 file:font-semibold file:text-noite"
          />
        </Campo>
        <Campo rotulo="Título" dica="Se ficar vazio, usa o nome do arquivo.">
          <Entrada id="titulo-documento" placeholder="Ex.: Contrato de compra e venda" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </Campo>
        <div className="grid grid-cols-2 gap-3 md:col-span-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Campo rotulo="Tipo">
            <Selecao id="tipo-documento" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumento)}>
              {Object.entries(tiposDocumento).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Imóvel">
            <Selecao id="contrato-documento" value={contratoId} onChange={(e) => setContratoId(e.target.value)}>
              <option value="">Todos (geral)</option>
              {contratos.map((k) => <option key={k.id} value={k.id}>{k.imoveis?.identificacao}</option>)}
            </Selecao>
          </Campo>
          <Botao type="submit" carregando={enviando} className="col-span-2 md:col-span-1">Enviar documento</Botao>
        </div>
        {erro && <div className="md:col-span-2"><MensagemErro erro={erro} /></div>}
      </form>
      {docs.data?.length === 0 ? (
        <Vazio titulo="Nenhum documento enviado" />
      ) : (
        <ul className="divide-y divide-linha">
          {docs.data?.map((d) => (
            <li key={d.id} className="flex items-center gap-4 px-5 py-3">
              <span className="grid size-10 place-items-center rounded-lg bg-erro-bg text-[11px] font-extrabold text-erro">PDF</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{d.titulo}</p>
                <p className="text-xs text-suave">
                  {tiposDocumento[d.tipo]} · {contratos.find((k) => k.id === d.contrato_id)?.imoveis?.identificacao ?? 'Geral'} · enviado em{' '}
                  {new Date(d.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <Botao variante="fantasma" className="h-8 px-2" onClick={() => abrir(d)}>Abrir</Botao>
              <Botao variante="fantasma" className="h-8 px-2 text-erro" onClick={() => setRemover(d)}>Remover</Botao>
            </li>
          ))}
        </ul>
      )}
      <Confirmar
        aberto={!!remover}
        aoFechar={() => setRemover(null)}
        aoConfirmar={confirmarRemocao}
        carregando={removendo}
        titulo="Remover documento?"
        texto={`"${remover?.titulo}" deixa de aparecer no app do comprador.`}
        rotulo="Remover"
        perigo
      />
    </Cartao>
  );
}

function EditarContato({ aberto, aoFechar, comprador }: { aberto: boolean; aoFechar: () => void; comprador: Comprador }) {
  const queryClient = useQueryClient();
  const avisar = useAvisar();
  const [nome, setNome] = useState(comprador.nome);
  const [telefone, setTelefone] = useState(comprador.telefone ? formatarTelefone(comprador.telefone) : '');
  const [email, setEmail] = useState(comprador.email ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const tel = telefone.trim() ? normalizarTelefone(telefone) : null;
    if (telefone.trim() && !tel) return setErro('WhatsApp inválido. Use DDD + número.');
    setSalvando(true);
    try {
      exigir(await supabase.from('compradores').update({ nome: nome.trim(), telefone: tel, email: email.trim() || null }).eq('id', comprador.id));
      avisar('Dados atualizados.');
      await queryClient.invalidateQueries();
      aoFechar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Editar contato">
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Nome"><Entrada id="editar-nome" value={nome} onChange={(e) => setNome(e.target.value)} required /></Campo>
        <Campo rotulo="WhatsApp" dica="Usado para o código de acesso e o convite."><Entrada id="editar-telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} /></Campo>
        <Campo rotulo="E-mail"><Entrada id="editar-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
        <MensagemErro erro={erro} />
        <div className="flex justify-end gap-2">
          <Botao type="button" variante="secundario" onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" carregando={salvando}>Salvar</Botao>
        </div>
      </form>
    </Modal>
  );
}
