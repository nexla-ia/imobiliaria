import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { Botao, Campo, Entrada, MensagemErro } from '../components/ui';
import { useSessao } from '../lib/sessao';
import { supabase } from '../lib/supabase';

export function Login() {
  const { session, membro, semAcesso, sair } = useSessao();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [modoRecuperar, setModoRecuperar] = useState(false);
  const [recuperacaoEnviada, setRecuperacaoEnviada] = useState(false);

  const { empresa } = useSessao();
  if (session && membro && empresa) return <Navigate to="/" replace />;

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEnviando(false);
    if (error) setErro('E-mail ou senha incorretos.');
  }

  async function recuperar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/trocar-senha`,
    });
    setEnviando(false);
    if (error) setErro('Não foi possível enviar o e-mail agora. Tente de novo em instantes.');
    else setRecuperacaoEnviada(true);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-noite bg-[radial-gradient(900px_600px_at_100%_0%,#0A1F5C,transparent_70%)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <img src="/logo-branco.png" alt="Planejar Assessoria" className="w-56" />
        <div>
          <p className="text-5xl leading-none font-extrabold uppercase italic">
            Painel da <span className="text-ciano">equipe</span>
          </p>
          <p className="mt-4 max-w-md text-lg text-white/70">
            Compradores, imóveis, parcelas do Asaas e comunicados do app em um só lugar.
          </p>
        </div>
        <p className="text-xs text-white/40">Desenvolvido por Nexla</p>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <img src="/simbolo-azul.png" alt="" className="mb-6 size-14 lg:hidden" />
          {semAcesso ? (
            <div className="space-y-4">
              <h1 className="text-2xl font-bold text-noite">Sem acesso ao painel</h1>
              <p className="text-sm text-suave">
                Este login não faz parte da equipe da imobiliária. Peça a um administrador para cadastrar você.
              </p>
              <Botao variante="secundario" onClick={sair}>Entrar com outra conta</Botao>
            </div>
          ) : modoRecuperar ? (
            <form onSubmit={recuperar} className="space-y-4">
              <h1 className="text-2xl font-bold text-noite">Recuperar senha</h1>
              {recuperacaoEnviada ? (
                <p className="text-sm text-suave">Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.</p>
              ) : (
                <>
                  <Campo rotulo="E-mail">
                    <Entrada id="email-recuperar" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
                  </Campo>
                  <MensagemErro erro={erro} />
                  <Botao type="submit" className="w-full" carregando={enviando}>Enviar link</Botao>
                </>
              )}
              <button type="button" className="text-sm font-semibold text-ciano-escuro" onClick={() => setModoRecuperar(false)}>
                Voltar para o login
              </button>
            </form>
          ) : (
            <form onSubmit={entrar} className="space-y-4">
              <h1 className="text-2xl font-bold text-noite">Entrar</h1>
              <Campo rotulo="E-mail">
                <Entrada id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
              </Campo>
              <Campo rotulo="Senha">
                <Entrada id="senha" type="password" required value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" />
              </Campo>
              <MensagemErro erro={erro} />
              <Botao type="submit" className="w-full" carregando={enviando}>Entrar</Botao>
              <button type="button" className="text-sm font-semibold text-ciano-escuro" onClick={() => setModoRecuperar(true)}>
                Esqueci minha senha
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
