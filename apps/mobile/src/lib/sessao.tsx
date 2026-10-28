import { emailDoComprador, type Comprador, type Empresa } from '@planejar/shared';
import type { Session } from '@supabase/supabase-js';
import { focusManager, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { desregistrarPush } from './push';
import { EMPRESA_SLUG, supabase } from './supabase';

interface Sessao {
  carregando: boolean;
  session: Session | null;
  comprador: Comprador | null;
  empresa: Empresa | null;
  /** logado, mas o comprador foi bloqueado ou não existe mais (consulta deu certo e veio assim) */
  bloqueado: boolean;
  /** não deu para carregar o perfil (sem internet, servidor fora): mostrar "tentar de novo" */
  erroCarga: boolean;
  entrar: (cpf: string, senha: string) => Promise<string | null>;
  entrarComEmail: (email: string, senha: string) => Promise<string | null>;
  sair: () => Promise<void>;
  recarregar: () => Promise<void>;
}

const Contexto = createContext<Sessao | null>(null);

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [comprador, setComprador] = useState<Comprador | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState(false);
  // descarta respostas de carregamentos antigos (entrar e sair rápido, troca de conta)
  const geracao = useRef(0);
  const usuarioCarregado = useRef<string | null>(null);

  // A sessão só é publicada junto com o perfil já carregado: senão o guard abre
  // as telas logadas antes de existir comprador/empresa.
  async function carregar(s: Session | null) {
    const minha = ++geracao.current;
    if (!s) {
      usuarioCarregado.current = null;
      queryClient.clear(); // nada do comprador anterior fica em memória
      setSession(null);
      setComprador(null);
      setEmpresa(null);
      setErroCarga(false);
      setCarregando(false);
      return;
    }
    const { data: c, error: erroC } = await supabase.from('compradores').select('*').eq('auth_user_id', s.user.id).maybeSingle();
    let e: Empresa | null = null;
    let falhou = !!erroC;
    if (!erroC && c && c.status_acesso === 'ativo') {
      const { data, error } = await supabase.from('empresas').select('*').eq('id', c.empresa_id).maybeSingle();
      if (error || !data) falhou = true;
      else e = data as Empresa;
    }
    if (minha !== geracao.current) return;
    if (usuarioCarregado.current && usuarioCarregado.current !== s.user.id) queryClient.clear();
    usuarioCarregado.current = s.user.id;
    setErroCarga(falhou);
    if (!falhou) {
      setComprador((c as Comprador) ?? null);
      setEmpresa(e);
    }
    setSession(s);
    setCarregando(false);
  }

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => carregar(data.session))
      .catch(() => carregar(null)); // cofre do aparelho ilegível: volta para o login
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      const precisaPerfil = evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'USER_UPDATED' ||
        (s && s.user.id !== usuarioCarregado.current);
      // fora do callback: o supabase-js pede para não chamar o cliente aqui dentro
      if (precisaPerfil) setTimeout(() => carregar(s), 0);
      else setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Ao voltar para o app: recarrega o perfil (bloqueio, nova senha provisória) e as listas.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (estado) => {
      focusManager.setFocused(estado === 'active');
      if (estado === 'active') {
        supabase.auth.getSession().then(({ data }) => {
          if (data.session) carregar(data.session);
        }).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  async function entrarComEmail(email: string, senha: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (!error) return null;
    if (/invalid login credentials/i.test(error.message)) return 'CPF ou senha incorretos.';
    if (/network|fetch/i.test(error.message)) return 'Sem conexão com a internet. Confira e tente de novo.';
    if (/rate|too many/i.test(error.message)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
    return 'Não foi possível entrar agora. Tente de novo em instantes.';
  }

  const valor: Sessao = {
    carregando,
    session,
    comprador,
    empresa,
    erroCarga,
    bloqueado: !!session && !carregando && !erroCarga && (!comprador || comprador.status_acesso !== 'ativo'),
    entrar: (cpf, senha) => entrarComEmail(emailDoComprador(cpf, EMPRESA_SLUG), senha),
    entrarComEmail,
    sair: async () => {
      await desregistrarPush();
      await supabase.auth.signOut();
    },
    recarregar: async () => {
      const { data } = await supabase.auth.getSession();
      await carregar(data.session);
    },
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): Sessao {
  const s = useContext(Contexto);
  if (!s) throw new Error('useSessao fora do ProvedorSessao');
  return s;
}

/** Para telas logadas: comprador e empresa garantidos pelo guard do layout. */
export function useComprador() {
  const s = useSessao();
  if (!s.comprador || !s.empresa) throw new Error('useComprador sem sessão ativa');
  return { comprador: s.comprador, empresa: s.empresa };
}
