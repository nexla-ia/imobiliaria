import { emailDoComprador, type Comprador, type Empresa } from '@planejar/shared';
import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { desregistrarPush } from './push';
import { EMPRESA_SLUG, supabase } from './supabase';

interface Sessao {
  carregando: boolean;
  session: Session | null;
  comprador: Comprador | null;
  empresa: Empresa | null;
  /** logado, mas o comprador foi bloqueado ou não existe mais */
  bloqueado: boolean;
  entrar: (cpf: string, senha: string) => Promise<string | null>;
  entrarComEmail: (email: string, senha: string) => Promise<string | null>;
  sair: () => Promise<void>;
  recarregar: () => Promise<void>;
}

const Contexto = createContext<Sessao | null>(null);

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [comprador, setComprador] = useState<Comprador | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [carregando, setCarregando] = useState(true);

  // A sessão só é publicada junto com o perfil já carregado: senão o guard abre
  // as telas logadas antes de existir comprador/empresa.
  async function carregar(s: Session | null) {
    if (!s) {
      setSession(null);
      setComprador(null);
      setEmpresa(null);
      setCarregando(false);
      return;
    }
    const { data: c } = await supabase.from('compradores').select('*').eq('auth_user_id', s.user.id).maybeSingle();
    let e: Empresa | null = null;
    if (c && c.status_acesso === 'ativo') {
      const { data } = await supabase.from('empresas').select('*').eq('id', c.empresa_id).maybeSingle();
      e = (data as Empresa) ?? null;
    }
    setComprador((c as Comprador) ?? null);
    setEmpresa(e);
    setSession(s);
    setCarregando(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => carregar(data.session));
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'USER_UPDATED') {
        // fora do callback: o supabase-js pede para não chamar o cliente aqui dentro
        setTimeout(() => carregar(s), 0);
      } else {
        setSession(s);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function entrarComEmail(email: string, senha: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (!error) return null;
    if (/invalid login credentials/i.test(error.message)) return 'CPF ou senha incorretos.';
    if (/network|fetch/i.test(error.message)) return 'Sem conexão com a internet. Confira e tente de novo.';
    return 'Não foi possível entrar agora. Tente de novo em instantes.';
  }

  const valor: Sessao = {
    carregando,
    session,
    comprador,
    empresa,
    bloqueado: !!session && !carregando && (!comprador || comprador.status_acesso !== 'ativo'),
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
