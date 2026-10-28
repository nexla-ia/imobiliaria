import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useEquipe, useSessao } from '../lib/sessao';

const itens = [
  { para: '/', rotulo: 'Carteira', icone: 'M3 3v18h18M7 15l4-4 3 3 5-6' },
  { para: '/compradores', rotulo: 'Compradores', icone: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  { para: '/imoveis', rotulo: 'Imóveis', icone: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z' },
  { para: '/comunicados', rotulo: 'Comunicados', icone: 'M3 11v3a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13' },
];
const itemConfig = { para: '/configuracoes', rotulo: 'Configurações', icone: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' };

export function Estrutura() {
  const { membro, empresa, ehAdmin } = useEquipe();
  const { sair } = useSessao();
  const [menuAberto, setMenuAberto] = useState(false);
  const links = ehAdmin ? [...itens, itemConfig] : itens;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-62 flex-col bg-noite bg-[radial-gradient(400px_300px_at_100%_0%,#0A1F5C,transparent_70%)] text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${menuAberto ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="px-6 pt-6 pb-8">
          <img src="/logo-branco.png" alt={empresa.nome} className="w-36" />
          <p className="mt-3 text-xs font-semibold tracking-[0.14em] text-ciano uppercase">Painel da equipe</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {links.map((l) => (
            <NavLink
              key={l.para}
              to={l.para}
              end={l.para === '/'}
              onClick={() => setMenuAberto(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'}`
              }
            >
              {({ isActive }) => (
                <>
                  <svg viewBox="0 0 24 24" className={`size-5 fill-none stroke-current stroke-[1.8] ${isActive ? 'text-ciano' : ''}`} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={l.icone} />
                  </svg>
                  {l.rotulo}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 px-6 py-5">
          <p className="truncate text-sm font-semibold">{membro.nome}</p>
          <p className="text-xs text-white/60">{membro.papel === 'admin' ? 'Administrador' : 'Operador'}</p>
          <button onClick={sair} className="mt-3 text-sm font-semibold text-ciano hover:underline">Sair</button>
          <p className="mt-4 text-[11px] text-white/40">Desenvolvido por Nexla</p>
        </div>
      </aside>
      {menuAberto && <div className="fixed inset-0 z-30 bg-noite/40 lg:hidden" onClick={() => setMenuAberto(false)} />}

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-linha bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setMenuAberto(true)} aria-label="Abrir menu" className="rounded-lg p-2 hover:bg-fundo">
            <svg viewBox="0 0 24 24" className="size-6 fill-none stroke-current stroke-2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <img src="/simbolo-azul.png" alt="" className="size-7" />
          <span className="font-bold text-noite">{empresa.nome}</span>
        </header>
        {empresa.asaas_ambiente === 'sandbox' && (
          <div className="bg-alerta-bg px-6 py-2 text-center text-xs font-semibold text-alerta">
            Ambiente de testes: o Asaas está no modo sandbox. Nenhum pagamento é real.
          </div>
        )}
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
