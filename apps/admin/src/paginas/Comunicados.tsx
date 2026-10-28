import type { AlvoComunicado, Comunicado, Empreendimento, EnviarComunicadoRes } from '@planejar/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { AreaTexto, Botao, CabecalhoPagina, Campo, Cartao, Carregando, Confirmar, Entrada, MensagemErro, Selecao, Selo, useAvisar, Vazio } from '../components/ui';
import { chamar, exigir, mensagemDeErro } from '../lib/api';
import { useEquipe } from '../lib/sessao';
import { supabase } from '../lib/supabase';

const LIMITE_TITULO = 65;
const LIMITE_CORPO = 240;

export function Comunicados() {
  const { empresa, membro } = useEquipe();
  const avisar = useAvisar();
  const queryClient = useQueryClient();
  const [titulo, setTitulo] = useState('');
  const [corpo, setCorpo] = useState('');
  const [alvo, setAlvo] = useState<AlvoComunicado>('todos');
  const [alvoId, setAlvoId] = useState('');
  const [buscaComprador, setBuscaComprador] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const historico = useQuery({
    queryKey: ['comunicados'],
    queryFn: async () => exigir(await supabase.from('comunicados').select('*').order('created_at', { ascending: false }).limit(100)) as Comunicado[],
  });
  const empreendimentos = useQuery({
    queryKey: ['empreendimentos'],
    queryFn: async () => exigir(await supabase.from('empreendimentos').select('*').order('nome')) as Empreendimento[],
  });
  const compradores = useQuery({
    queryKey: ['compradores-ativos'],
    queryFn: async () =>
      exigir(await supabase.from('compradores').select('id, nome, cpf').eq('status_acesso', 'ativo').order('nome')) as Array<{ id: string; nome: string; cpf: string }>,
  });

  const opcoesCompradores = useMemo(() => {
    const t = buscaComprador.trim().toLowerCase();
    return (compradores.data ?? []).filter((c) => !t || c.nome.toLowerCase().includes(t) || c.cpf.includes(t.replace(/\D/g, '') || '#')).slice(0, 50);
  }, [compradores.data, buscaComprador]);

  function nomeDoAlvo(c: Pick<Comunicado, 'alvo' | 'alvo_id'>) {
    if (c.alvo === 'todos') return 'Todos os compradores';
    if (c.alvo === 'empreendimento') return empreendimentos.data?.find((e) => e.id === c.alvo_id)?.nome ?? 'Empreendimento';
    return compradores.data?.find((x) => x.id === c.alvo_id)?.nome ?? 'Um comprador';
  }

  function validar(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || !corpo.trim()) return setErro('Preencha título e mensagem.');
    if (alvo !== 'todos' && !alvoId) return setErro(alvo === 'empreendimento' ? 'Escolha o empreendimento.' : 'Escolha o comprador.');
    setErro(null);
    setConfirmar(true);
  }

  async function enviar(existente?: Comunicado) {
    setEnviando(true);
    try {
      let id = existente?.id;
      if (!id) {
        const novo = exigir(
          await supabase
            .from('comunicados')
            .insert({ empresa_id: empresa.id, titulo: titulo.trim(), corpo: corpo.trim(), alvo, alvo_id: alvo === 'todos' ? null : alvoId, criado_por: membro.auth_user_id })
            .select('id')
            .single(),
        ) as { id: string };
        id = novo.id;
      }
      const r = await chamar<EnviarComunicadoRes>('notify-comunicado', { comunicado_id: id });
      avisar(`Comunicado enviado para ${r.destinatarios} comprador${r.destinatarios === 1 ? '' : 'es'}.`);
      setTitulo('');
      setCorpo('');
      setAlvo('todos');
      setAlvoId('');
      setConfirmar(false);
    } catch (e) {
      avisar(mensagemDeErro(e), 'erro');
    } finally {
      setEnviando(false);
      await queryClient.invalidateQueries({ queryKey: ['comunicados'] });
    }
  }

  return (
    <>
      <CabecalhoPagina titulo="Comunicados" subtitulo="Avisos enviados por notificação no celular e guardados na central do app" />
      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <Cartao titulo="Novo comunicado" className="self-start">
          <form onSubmit={validar} className="space-y-4 p-5">
            <Campo rotulo="Título" dica={`${titulo.length}/${LIMITE_TITULO}`}>
              <Entrada id="comunicado-titulo" maxLength={LIMITE_TITULO} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Manutenção das vias do loteamento" />
            </Campo>
            <Campo rotulo="Mensagem" dica={`${corpo.length}/${LIMITE_CORPO}`}>
              <AreaTexto id="comunicado-corpo" maxLength={LIMITE_CORPO} value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={4} />
            </Campo>
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-sm font-semibold">Para quem</legend>
              {(['todos', 'empreendimento', 'comprador'] as const).map((a) => (
                <label key={a} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="alvo" checked={alvo === a} onChange={() => { setAlvo(a); setAlvoId(''); }} className="accent-ciano-escuro" />
                  {{ todos: 'Todos os compradores', empreendimento: 'Compradores de um empreendimento', comprador: 'Um comprador' }[a]}
                </label>
              ))}
            </fieldset>
            {alvo === 'empreendimento' && (
              <Selecao id="comunicado-empreendimento" value={alvoId} onChange={(e) => setAlvoId(e.target.value)}>
                <option value="">Escolha o empreendimento</option>
                {empreendimentos.data?.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </Selecao>
            )}
            {alvo === 'comprador' && (
              <div className="space-y-2">
                <Entrada id="comunicado-busca" placeholder="Buscar comprador com app ativo" value={buscaComprador} onChange={(e) => setBuscaComprador(e.target.value)} />
                <Selecao id="comunicado-comprador" value={alvoId} onChange={(e) => setAlvoId(e.target.value)} size={5} className="h-auto">
                  {opcoesCompradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </Selecao>
              </div>
            )}

            <div className="rounded-xl bg-noite p-3 text-white">
              <p className="mb-2 text-[11px] font-semibold tracking-wide text-white/60 uppercase">Como aparece no celular</p>
              <div className="flex gap-3 rounded-lg bg-white/10 p-3">
                <img src="/simbolo-branco.png" alt="" className="size-8 rounded-md bg-noite p-1" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{titulo || 'Título do comunicado'}</p>
                  <p className="line-clamp-3 text-sm text-white/80">{corpo || 'Sua mensagem aparece aqui.'}</p>
                </div>
              </div>
            </div>

            <MensagemErro erro={erro} />
            <Botao type="submit" className="w-full">Revisar e enviar</Botao>
          </form>
        </Cartao>

        <Cartao titulo="Histórico">
          {historico.isLoading ? (
            <Carregando />
          ) : !historico.data?.length ? (
            <Vazio titulo="Nenhum comunicado enviado ainda" />
          ) : (
            <ul className="divide-y divide-linha">
              {historico.data.map((c) => (
                <li key={c.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{c.titulo}</p>
                    {c.enviado_em ? (
                      <Selo tom="ok">Enviado para {c.total_destinatarios ?? 0}</Selo>
                    ) : (
                      <Botao variante="secundario" className="h-8" onClick={() => enviar(c)} carregando={enviando}>Enviar agora</Botao>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-suave">{c.corpo}</p>
                  <p className="mt-2 text-xs text-suave">
                    {nomeDoAlvo(c)} · {new Date(c.enviado_em ?? c.created_at).toLocaleString('pt-BR')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      <Confirmar
        aberto={confirmar}
        aoFechar={() => setConfirmar(false)}
        aoConfirmar={() => enviar()}
        carregando={enviando}
        titulo="Enviar comunicado?"
        texto={<>Vai para: <strong>{nomeDoAlvo({ alvo, alvo_id: alvoId || null })}</strong>. Depois de enviado, não dá para apagar do celular de quem recebeu.</>}
        rotulo="Enviar"
      />
    </>
  );
}
