import { formatarTelefone, type AdicionarEquipeReq, type TextosEmpresa, type UsuarioAdmin } from '@planejar/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { AreaTexto, Botao, CabecalhoPagina, Campo, Cartao, Confirmar, Entrada, Interruptor, MensagemErro, Modal, Selecao, Selo, Tabela, useAvisar } from '../components/ui';
import { chamar, exigir, mensagemDeErro } from '../lib/api';
import { useEquipe } from '../lib/sessao';
import { supabase } from '../lib/supabase';
import { normalizarTelefone } from '../lib/telefone';

const OPCOES_DIAS = [7, 5, 3, 2, 1, 0];

/** Mostra {variavel} em fonte mono: na Saira as chaves parecem parênteses. */
function Variaveis({ nomes }: { nomes: string[] }) {
  return (
    <>
      {nomes.map((n, i) => (
        <span key={n}>
          {i > 0 && (i === nomes.length - 1 ? ' e ' : ', ')}
          <code className="rounded bg-fundo px-1 font-mono text-[11px] text-texto">{`{${n}}`}</code>
        </span>
      ))}
    </>
  );
}

export function Configuracoes() {
  const { empresa, recarregarEmpresa } = useEquipe();
  const avisar = useAvisar();
  const [whatsapp, setWhatsapp] = useState(empresa.whatsapp_atendimento ? formatarTelefone(empresa.whatsapp_atendimento) : '');
  const [dias, setDias] = useState<number[]>(empresa.dias_aviso);
  const [avulsas, setAvulsas] = useState(empresa.mostrar_cobrancas_avulsas);
  const [textos, setTextos] = useState<TextosEmpresa>(empresa.textos ?? {});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const texto = (campo: keyof TextosEmpresa) => ({
    value: textos[campo] ?? '',
    onChange: (e: { target: { value: string } }) => setTextos({ ...textos, [campo]: e.target.value }),
  });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const tel = whatsapp.trim() ? normalizarTelefone(whatsapp) : null;
    if (whatsapp.trim() && !tel) return setErro('WhatsApp inválido. Use DDD + número.');
    if (!dias.length) return setErro('Escolha pelo menos um dia de aviso.');
    setErro(null);
    setSalvando(true);
    try {
      const limpos = Object.fromEntries(Object.entries(textos).filter(([, v]) => typeof v === 'string' && v.trim()));
      exigir(
        await supabase
          .from('empresas')
          .update({ whatsapp_atendimento: tel, dias_aviso: [...dias].sort((a, b) => b - a), mostrar_cobrancas_avulsas: avulsas, textos: limpos })
          .eq('id', empresa.id),
      );
      await recarregarEmpresa();
      avisar('Configurações salvas.');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <CabecalhoPagina titulo="Configurações" subtitulo="Só administradores veem esta tela" />
      <form onSubmit={salvar} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Cartao titulo="Atendimento e avisos">
            <div className="space-y-5 p-5">
              <Campo rotulo="WhatsApp de atendimento" dica='Abre no botão "Fale com a imobiliária" do app.'>
                <Entrada id="config-whatsapp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(65) 9 9937-3761" />
              </Campo>
              <div>
                <p className="mb-2 text-sm font-semibold">Avisar o vencimento</p>
                <div className="flex flex-wrap gap-2">
                  {OPCOES_DIAS.map((d) => {
                    const ativo = dias.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={ativo}
                        onClick={() => setDias(ativo ? dias.filter((x) => x !== d) : [...dias, d])}
                        className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${ativo ? 'border-noite bg-noite text-white' : 'border-linha bg-white text-suave'}`}
                      >
                        {d === 0 ? 'No dia' : d === 1 ? '1 dia antes' : `${d} dias antes`}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-suave">Os avisos saem às 8h (horário de Cuiabá).</p>
              </div>
              <Interruptor
                ligado={avulsas}
                aoMudar={setAvulsas}
                rotulo="Mostrar cobranças avulsas no app"
                descricao="Cobranças fora do parcelamento, como taxa de transferência."
              />
            </div>
          </Cartao>

          <Cartao titulo="Lojas e documentos legais">
            <div className="space-y-4 p-5">
              <Campo rotulo="Link do app na Google Play"><Entrada id="config-android" {...texto('link_android')} placeholder="https://play.google.com/store/apps/details?id=…" /></Campo>
              <Campo rotulo="Link do app na App Store"><Entrada id="config-ios" {...texto('link_ios')} placeholder="https://apps.apple.com/…" /></Campo>
              <Campo rotulo="Política de privacidade (URL)"><Entrada id="config-privacidade" {...texto('link_privacidade')} /></Campo>
              <Campo rotulo="Termos de uso (URL)"><Entrada id="config-termos" {...texto('link_termos')} /></Campo>
            </div>
          </Cartao>
        </div>

        <Cartao titulo="Textos das mensagens">
          <div className="grid gap-5 p-5 lg:grid-cols-3">
            <Campo rotulo="Código de acesso (WhatsApp)" dica={<>Use <Variaveis nomes={['empresa', 'codigo', 'minutos', 'nome']} />. Deixe vazio para o texto padrão.</>}>
              <AreaTexto id="config-msg-codigo" {...texto('mensagem_codigo')} rows={5} placeholder="{empresa}: seu código de acesso ao app é {codigo}. Ele vale por {minutos} minutos. Não compartilhe com ninguém." />
            </Campo>
            <Campo rotulo="Convite para baixar o app" dica={<>Use <Variaveis nomes={['nome', 'empresa', 'links']} />.</>}>
              <AreaTexto id="config-msg-convite" {...texto('mensagem_convite')} rows={5} placeholder='Olá, {nome}! A {empresa} agora tem um app…' />
            </Campo>
            <Campo rotulo='Mensagem do botão "Fale com a imobiliária"' dica={<>Use <Variaveis nomes={['nome', 'cpf', 'imovel']} />.</>}>
              <AreaTexto id="config-msg-whatsapp" {...texto('mensagem_whatsapp')} rows={5} placeholder="Olá! Sou {nome} (CPF {cpf}), comprador(a) do {imovel}. Vim pelo app e preciso de ajuda." />
            </Campo>
          </div>
        </Cartao>

        <Cartao titulo="Integração">
          <dl className="grid gap-4 p-5 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-suave">Ambiente do Asaas</dt><dd>{empresa.asaas_ambiente === 'producao' ? <Selo tom="ok">Produção</Selo> : <Selo tom="alerta">Sandbox (testes)</Selo>}</dd></div>
            <div><dt className="text-xs text-suave">Fuso dos avisos</dt><dd className="font-semibold">{empresa.fuso_horario}</dd></div>
            <div><dt className="text-xs text-suave">Identificador</dt><dd className="font-mono text-xs">{empresa.slug}</dd></div>
          </dl>
          <p className="border-t border-linha px-5 py-3 text-xs text-suave">A troca de ambiente do Asaas e da marca no app é feita pela Nexla.</p>
        </Cartao>

        <MensagemErro erro={erro} />
        <div className="flex justify-end"><Botao type="submit" carregando={salvando}>Salvar configurações</Botao></div>
      </form>

      <div className="mt-10"><Equipe /></div>
    </>
  );
}

function Equipe() {
  const { membro } = useEquipe();
  const avisar = useAvisar();
  const queryClient = useQueryClient();
  const [novo, setNovo] = useState(false);
  const [remover, setRemover] = useState<UsuarioAdmin | null>(null);

  const equipe = useQuery({
    queryKey: ['equipe'],
    queryFn: async () => exigir(await supabase.from('usuarios_admin').select('*').order('nome')) as UsuarioAdmin[],
  });

  async function mudarPapel(u: UsuarioAdmin, papel: string) {
    try {
      exigir(await supabase.from('usuarios_admin').update({ papel }).eq('id', u.id));
      avisar('Perfil atualizado.');
      await queryClient.invalidateQueries({ queryKey: ['equipe'] });
    } catch (e) {
      avisar(mensagemDeErro(e), 'erro');
    }
  }

  async function confirmarRemocao() {
    if (!remover) return;
    try {
      exigir(await supabase.from('usuarios_admin').delete().eq('id', remover.id));
      avisar(`${remover.nome} não acessa mais o painel.`);
      setRemover(null);
      await queryClient.invalidateQueries({ queryKey: ['equipe'] });
    } catch (e) {
      avisar(mensagemDeErro(e), 'erro');
    }
  }

  return (
    <Cartao titulo="Equipe" acoes={<Botao onClick={() => setNovo(true)}>Adicionar pessoa</Botao>}>
      <Tabela>
        <thead><tr><th>Nome</th><th>Perfil</th><th>Desde</th><th /></tr></thead>
        <tbody>
          {equipe.data?.map((u) => (
            <tr key={u.id}>
              <td className="font-semibold">{u.nome}{u.auth_user_id === membro.auth_user_id && <span className="ml-2 text-xs font-normal text-suave">(você)</span>}</td>
              <td>
                <Selecao
                  id={`papel-${u.id}`}
                  value={u.papel}
                  disabled={u.auth_user_id === membro.auth_user_id}
                  onChange={(e) => mudarPapel(u, e.target.value)}
                  className="h-8 w-40"
                >
                  <option value="admin">Administrador</option>
                  <option value="operador">Operador</option>
                </Selecao>
              </td>
              <td className="text-suave">{new Date(u.created_at).toLocaleDateString('pt-BR')}</td>
              <td className="text-right">
                {u.auth_user_id !== membro.auth_user_id && (
                  <Botao variante="fantasma" className="h-8 px-2 text-erro" onClick={() => setRemover(u)}>Remover</Botao>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Tabela>
      <p className="border-t border-linha px-5 py-3 text-xs text-suave">Operadores usam tudo, menos esta tela de Configurações.</p>
      {novo && <NovoMembro aoFechar={() => setNovo(false)} />}
      <Confirmar
        aberto={!!remover}
        aoFechar={() => setRemover(null)}
        aoConfirmar={confirmarRemocao}
        titulo="Remover da equipe?"
        texto={`${remover?.nome} perde o acesso ao painel na hora.`}
        rotulo="Remover"
        perigo
      />
    </Cartao>
  );
}

function NovoMembro({ aoFechar }: { aoFechar: () => void }) {
  const avisar = useAvisar();
  const queryClient = useQueryClient();
  const [dados, setDados] = useState<AdicionarEquipeReq>({ nome: '', email: '', papel: 'operador', senha_provisoria: gerarSenha() });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await chamar('equipe-adicionar', dados);
      avisar(`${dados.nome} adicionado. Envie o e-mail e a senha provisória para a pessoa.`);
      await queryClient.invalidateQueries({ queryKey: ['equipe'] });
      aoFechar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Adicionar pessoa à equipe">
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Nome"><Entrada id="membro-nome" required value={dados.nome} onChange={(e) => setDados({ ...dados, nome: e.target.value })} /></Campo>
        <Campo rotulo="E-mail"><Entrada id="membro-email" type="email" required value={dados.email} onChange={(e) => setDados({ ...dados, email: e.target.value })} /></Campo>
        <Campo rotulo="Perfil">
          <Selecao id="membro-papel" value={dados.papel} onChange={(e) => setDados({ ...dados, papel: e.target.value as 'admin' | 'operador' })}>
            <option value="operador">Operador</option>
            <option value="admin">Administrador</option>
          </Selecao>
        </Campo>
        <Campo rotulo="Senha provisória" dica="A pessoa cria uma senha nova no primeiro acesso.">
          <Entrada id="membro-senha" value={dados.senha_provisoria} onChange={(e) => setDados({ ...dados, senha_provisoria: e.target.value })} className="font-mono" />
        </Campo>
        <MensagemErro erro={erro} />
        <div className="flex justify-end gap-2">
          <Botao type="button" variante="secundario" onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" carregando={salvando}>Adicionar</Botao>
        </div>
      </form>
    </Modal>
  );
}

function gerarSenha(): string {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => letras[b % letras.length]).join('');
}
