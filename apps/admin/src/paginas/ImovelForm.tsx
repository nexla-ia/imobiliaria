import type { Empreendimento, Imovel, ImovelFoto } from '@planejar/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AreaTexto, Botao, CabecalhoPagina, Campo, Cartao, Carregando, Confirmar, Entrada, MensagemErro, Selecao, useAvisar } from '../components/ui';
import { exigir, mensagemDeErro } from '../lib/api';
import { useEquipe } from '../lib/sessao';
import { supabase } from '../lib/supabase';

interface Formulario {
  empreendimento_id: string;
  identificacao: string;
  endereco: string;
  coordenadas: string;
  metragem_m2: string;
  descricao: string;
}

const vazio: Formulario = { empreendimento_id: '', identificacao: '', endereco: '', coordenadas: '', metragem_m2: '', descricao: '' };

/** "1.250,5" → 1250.5; "360,5" e "360.5" → 360.5; "1.250" → 1250. */
function lerNumeroBr(texto: string): number {
  const t = texto.trim().replace(/\s/g, '');
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''));
  return Number(t);
}

/** Aceita "-15.556, -56.073" (como o Google Maps copia) ou "-15,556 -56,073". */
function lerCoordenadas(texto: string): { lat: number; lng: number } | null | 'invalido' {
  const t = texto.trim();
  if (!t) return null;
  const numeros = t.match(/-?\d+(?:[.,]\d+)?/g);
  if (!numeros || numeros.length !== 2) return 'invalido';
  const [lat, lng] = numeros.map((n) => Number(n.replace(',', '.'))) as [number, number];
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return 'invalido';
  return { lat, lng };
}

export function ImovelForm() {
  const { id = 'novo' } = useParams();
  const imovel = useQuery({
    queryKey: ['imovel', id],
    enabled: id !== 'novo',
    queryFn: async () =>
      exigir(await supabase.from('imoveis').select('*, contratos(id, status)').eq('id', id).single()) as Imovel & {
        contratos: Array<{ id: string; status: string }>;
      },
  });
  if (id !== 'novo' && imovel.isLoading) return <Carregando />;
  if (id !== 'novo' && !imovel.data) return <MensagemErro erro="Imóvel não encontrado." />;
  // key recria o formulário com os dados certos ao trocar de imóvel
  return <FormularioImovel key={id} id={id} imovel={imovel.data ?? null} />;
}

function formularioDe(i: Imovel | null): Formulario {
  if (!i) return vazio;
  return {
    empreendimento_id: i.empreendimento_id ?? '',
    identificacao: i.identificacao,
    endereco: i.endereco ?? '',
    coordenadas: i.lat != null && i.lng != null ? `${i.lat}, ${i.lng}` : '',
    metragem_m2: i.metragem_m2 != null ? String(i.metragem_m2).replace('.', ',') : '',
    descricao: i.descricao ?? '',
  };
}

function FormularioImovel({ id, imovel }: { id: string; imovel: (Imovel & { contratos: Array<{ id: string; status: string }> }) | null }) {
  const novo = id === 'novo';
  const { empresa } = useEquipe();
  const navegar = useNavigate();
  const queryClient = useQueryClient();
  const avisar = useAvisar();
  const [form, setForm] = useState<Formulario>(() => formularioDe(imovel));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluir, setExcluir] = useState(false);

  const empreendimentos = useQuery({
    queryKey: ['empreendimentos'],
    queryFn: async () => exigir(await supabase.from('empreendimentos').select('*').order('nome')) as Empreendimento[],
  });

  const mudar = (campo: keyof Formulario) => (e: { target: { value: string } }) => setForm({ ...form, [campo]: e.target.value });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const coords = lerCoordenadas(form.coordenadas);
    if (coords === 'invalido') return setErro('Coordenadas inválidas. Copie do Google Maps no formato "-15.5561, -56.0735".');
    const metragem = form.metragem_m2.trim() ? lerNumeroBr(form.metragem_m2) : null;
    if (metragem != null && (Number.isNaN(metragem) || metragem <= 0)) return setErro('Metragem inválida.');
    setErro(null);
    setSalvando(true);
    try {
      const campos = {
        empreendimento_id: form.empreendimento_id || null,
        identificacao: form.identificacao.trim(),
        endereco: form.endereco.trim() || null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        metragem_m2: metragem,
        descricao: form.descricao.trim() || null,
        // salvar pela equipe confirma os dados do imóvel criado na importação
        revisar: false,
      };
      if (novo) {
        const criado = exigir(await supabase.from('imoveis').insert({ ...campos, empresa_id: empresa.id }).select('id').single()) as { id: string };
        avisar('Imóvel criado. Agora você pode enviar as fotos.');
        await queryClient.invalidateQueries({ queryKey: ['imoveis'] });
        navegar(`/imoveis/${criado.id}`, { replace: true });
      } else {
        exigir(await supabase.from('imoveis').update(campos).eq('id', id));
        avisar('Imóvel atualizado.');
        await queryClient.invalidateQueries();
      }
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarExclusao() {
    try {
      const { data: fotos } = await supabase.from('imovel_fotos').select('storage_path').eq('imovel_id', id);
      exigir(await supabase.from('imoveis').delete().eq('id', id));
      if (fotos?.length) await supabase.storage.from('imoveis').remove(fotos.map((f) => f.storage_path));
      avisar('Imóvel excluído.');
      await queryClient.invalidateQueries();
      navegar('/imoveis', { replace: true });
    } catch (e) {
      avisar(mensagemDeErro(e), 'erro');
    }
  }

  const temContrato = (imovel?.contratos ?? []).length > 0;
  const coords = lerCoordenadas(form.coordenadas);

  return (
    <>
      <CabecalhoPagina
        titulo={novo ? 'Novo imóvel' : form.identificacao || 'Imóvel'}
        acoes={<Link to="/imoveis" className="text-sm font-semibold text-ciano-escuro">Voltar</Link>}
      />
      {imovel?.revisar && (
        <p className="mb-4 rounded-lg bg-alerta-bg px-4 py-3 text-sm text-alerta">
          Este imóvel foi criado na importação do Asaas, a partir do nome do parcelamento. Confira a identificação, escolha o empreendimento,
          preencha endereço e coordenadas e salve.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Cartao titulo="Dados do imóvel">
          <form onSubmit={salvar} className="grid gap-4 p-5 md:grid-cols-2">
            <Campo rotulo="Empreendimento">
              <Selecao id="imovel-empreendimento" value={form.empreendimento_id} onChange={mudar('empreendimento_id')}>
                <option value="">Sem empreendimento</option>
                {empreendimentos.data?.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo="Identificação" dica='Como o comprador vê: "Lote 12 · Quadra B"'>
              <Entrada id="imovel-identificacao" required value={form.identificacao} onChange={mudar('identificacao')} placeholder="Lote 12 · Quadra B" />
            </Campo>
            <Campo rotulo="Endereço" className="md:col-span-2">
              <Entrada id="imovel-endereco" value={form.endereco} onChange={mudar('endereco')} placeholder="Rua, número, bairro, cidade - UF" />
            </Campo>
            <Campo
              rotulo="Coordenadas"
              dica={coords && coords !== 'invalido'
                ? <a className="font-semibold text-ciano-escuro" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`}>Conferir no Google Maps</a>
                : 'No Google Maps, clique com o botão direito no lote e copie os números.'}
            >
              <Entrada id="imovel-coordenadas" value={form.coordenadas} onChange={mudar('coordenadas')} placeholder="-15.5561, -56.0735" />
            </Campo>
            <Campo rotulo="Metragem (m²)">
              <Entrada id="imovel-metragem" inputMode="decimal" value={form.metragem_m2} onChange={mudar('metragem_m2')} placeholder="360" />
            </Campo>
            <Campo rotulo="Descrição" className="md:col-span-2" dica="Aparece em Meu imóvel, no app.">
              <AreaTexto id="imovel-descricao" value={form.descricao} onChange={mudar('descricao')} rows={4} />
            </Campo>
            <div className="md:col-span-2"><MensagemErro erro={erro} /></div>
            <div className="flex justify-between gap-2 md:col-span-2">
              {!novo ? (
                <Botao
                  type="button"
                  variante="fantasma"
                  className="text-erro"
                  onClick={() => setExcluir(true)}
                  disabled={temContrato}
                  title={temContrato ? 'Imóvel com contrato não pode ser excluído' : undefined}
                >
                  Excluir imóvel
                </Botao>
              ) : <span />}
              <Botao type="submit" carregando={salvando}>{novo ? 'Criar imóvel' : 'Salvar'}</Botao>
            </div>
          </form>
        </Cartao>
        {novo ? (
          <Cartao titulo="Fotos"><p className="p-5 text-sm text-suave">Salve o imóvel para enviar as fotos.</p></Cartao>
        ) : (
          <Fotos imovelId={id} />
        )}
      </div>
      <Confirmar
        aberto={excluir}
        aoFechar={() => setExcluir(false)}
        aoConfirmar={confirmarExclusao}
        titulo="Excluir este imóvel?"
        texto="O imóvel e as fotos dele são apagados. Isso não pode ser desfeito."
        rotulo="Excluir"
        perigo
      />
    </>
  );
}

function Fotos({ imovelId }: { imovelId: string }) {
  const { empresa } = useEquipe();
  const queryClient = useQueryClient();
  const avisar = useAvisar();
  const [enviando, setEnviando] = useState(false);
  const [removerFoto, setRemoverFoto] = useState<ImovelFoto | null>(null);

  const fotos = useQuery({
    queryKey: ['imovel', imovelId, 'fotos'],
    queryFn: async () => {
      const lista = exigir(await supabase.from('imovel_fotos').select('*').eq('imovel_id', imovelId).order('ordem')) as ImovelFoto[];
      if (!lista.length) return [];
      const { data } = await supabase.storage.from('imoveis').createSignedUrls(lista.map((f) => f.storage_path), 3600);
      return lista.map((f, i) => ({ ...f, url: data?.[i]?.signedUrl ?? '' }));
    },
  });

  async function enviar(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    setEnviando(true);
    try {
      let ordem = (fotos.data?.at(-1)?.ordem ?? -1) + 1;
      for (const arquivo of Array.from(arquivos)) {
        if (!arquivo.type.startsWith('image/')) continue;
        if (arquivo.size > 10 * 1024 * 1024) {
          avisar(`${arquivo.name} passa de 10 MB e foi ignorada.`, 'erro');
          continue;
        }
        const ext = arquivo.name.split('.').pop()?.toLowerCase() || 'jpg';
        const caminho = `${empresa.id}/${imovelId}/${crypto.randomUUID()}.${ext}`;
        exigir(await supabase.storage.from('imoveis').upload(caminho, arquivo, { contentType: arquivo.type }));
        const { error: erroFoto } = await supabase.from('imovel_fotos').insert({ empresa_id: empresa.id, imovel_id: imovelId, storage_path: caminho, ordem: ordem++ });
        if (erroFoto) {
          await supabase.storage.from('imoveis').remove([caminho]); // não deixa a foto sem cadastro
          throw erroFoto;
        }
      }
      avisar('Fotos enviadas.');
    } catch (e) {
      avisar(mensagemDeErro(e), 'erro');
    } finally {
      setEnviando(false);
      await queryClient.invalidateQueries({ queryKey: ['imovel', imovelId, 'fotos'] });
    }
  }

  async function mover(indice: number, direcao: -1 | 1) {
    const lista = fotos.data ?? [];
    const a = lista[indice];
    const b = lista[indice + direcao];
    if (!a || !b) return;
    try {
      exigir(await supabase.from('imovel_fotos').update({ ordem: b.ordem }).eq('id', a.id));
      exigir(await supabase.from('imovel_fotos').update({ ordem: a.ordem }).eq('id', b.id));
    } catch (e) {
      avisar(mensagemDeErro(e), 'erro');
    }
    await queryClient.invalidateQueries({ queryKey: ['imovel', imovelId, 'fotos'] });
  }

  async function confirmarRemocaoFoto() {
    if (!removerFoto) return;
    try {
      exigir(await supabase.from('imovel_fotos').delete().eq('id', removerFoto.id));
      await supabase.storage.from('imoveis').remove([removerFoto.storage_path]);
      avisar('Foto removida.');
    } catch (e) {
      avisar(mensagemDeErro(e), 'erro');
    }
    setRemoverFoto(null);
    await queryClient.invalidateQueries({ queryKey: ['imovel', imovelId, 'fotos'] });
  }

  return (
    <Cartao
      titulo="Fotos"
      acoes={
        <label className="inline-flex h-8 cursor-pointer items-center rounded-lg bg-noite px-3 text-sm font-semibold text-white hover:bg-marinho">
          {enviando ? 'Enviando…' : 'Adicionar fotos'}
          <input
            id="fotos-imovel"
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={enviando}
            onChange={(e) => {
              void enviar(e.target.files);
              e.target.value = ''; // permite escolher o mesmo arquivo de novo
            }}
          />
        </label>
      }
    >
      {fotos.isLoading ? (
        <Carregando />
      ) : !fotos.data?.length ? (
        <p className="p-5 text-sm text-suave">Nenhuma foto. A primeira foto vira a capa em Meu imóvel.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 p-4">
          {fotos.data.map((f, i) => (
            <li key={f.id} className="group relative overflow-hidden rounded-lg border border-linha">
              <img src={f.url} alt={`Foto ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
              {i === 0 && <span className="absolute top-2 left-2 rounded-full bg-noite/80 px-2 py-0.5 text-[11px] font-bold text-white">Capa</span>}
              <div className="flex justify-between gap-1 bg-white p-1.5 text-xs font-semibold">
                <span className="flex gap-1">
                  <button disabled={i === 0} onClick={() => mover(i, -1)} className="rounded px-2 py-1 hover:bg-fundo disabled:opacity-30" aria-label="Mover para antes">←</button>
                  <button disabled={i === fotos.data.length - 1} onClick={() => mover(i, 1)} className="rounded px-2 py-1 hover:bg-fundo disabled:opacity-30" aria-label="Mover para depois">→</button>
                </span>
                <button onClick={() => setRemoverFoto(f)} className="rounded px-2 py-1 text-erro hover:bg-erro-bg">Remover</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Confirmar
        aberto={!!removerFoto}
        aoFechar={() => setRemoverFoto(null)}
        aoConfirmar={confirmarRemocaoFoto}
        titulo="Remover esta foto?"
        texto="Ela deixa de aparecer em Meu imóvel, no app."
        rotulo="Remover"
        perigo
      />
    </Cartao>
  );
}
