import type { Empresa, UsuarioAdmin } from '@planejar/shared';
import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

interface Sessao {
  carregando: boolean;
  session: Session | null;
  membro: UsuarioAdmin | null;
  empresa: Empresa | null;
  /** login válido mas sem cadastro na equipe */
  semAcesso: boolean;
  recarregarEmpresa: () => Promise<void>;
  sair: () => Promise<void>;
}

const Contexto = createContext<Sessao | null>(null);

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [membro, setMembro] = useState<UsuarioAdmin | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [semAcesso, setSemAcesso] = useState(false);

  async function carregarPerfil(s: Session | null) {
    setSession(s);
    if (!s) {
      setMembro(null);
      setEmpresa(null);
      setSemAcesso(false);
      setCarregando(false);
      return;
    }
    const { data: m } = await supabase.from('usuarios_admin').select('*').eq('auth_user_id', s.user.id).maybeSingle();
    if (!m) {
      setSemAcesso(true);
      setMembro(null);
      setEmpresa(null);
    } else {
      const { data: e } = await supabase.from('empresas').select('*').eq('id', m.empresa_id).single();
      setMembro(m as UsuarioAdmin);
      setEmpresa(e as Empresa);
      setSemAcesso(false);
    }
    setCarregando(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => carregarPerfil(data.session));
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      // TOKEN_REFRESHED não muda quem está logado
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'USER_UPDATED') {
        setTimeout(() => carregarPerfil(s), 0);
      } else {
        setSession(s);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const valor: Sessao = {
    carregando,
    session,
    membro,
    empresa,
    semAcesso,
    recarregarEmpresa: async () => {
      if (!membro) return;
      const { data } = await supabase.from('empresas').select('*').eq('id', membro.empresa_id).single();
      setEmpresa(data as Empresa);
    },
    sair: async () => {
      await supabase.auth.signOut();
    },
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): Sessao {
  const s = useContext(Contexto);
  if (!s) throw new Error('useSessao fora do ProvedorSessao');
  return s;
}

/** Para telas internas, que só renderizam com membro e empresa carregados. */
export function useEquipe() {
  const s = useSessao();
  if (!s.membro || !s.empresa) throw new Error('useEquipe sem sessão da equipe');
  return { membro: s.membro, empresa: s.empresa, ehAdmin: s.membro.papel === 'admin', recarregarEmpresa: s.recarregarEmpresa };
}
