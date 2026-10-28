import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { Estrutura } from './components/Estrutura';
import { Carregando, ProvedorAvisos } from './components/ui';
import './index.css';
import { ProvedorSessao, useSessao } from './lib/sessao';
import { Carteira } from './paginas/Carteira';
import { CompradorDetalhe } from './paginas/CompradorDetalhe';
import { CompradorNovo } from './paginas/CompradorNovo';
import { Compradores } from './paginas/Compradores';
import { Comunicados } from './paginas/Comunicados';
import { Configuracoes } from './paginas/Configuracoes';
import { ImovelForm } from './paginas/ImovelForm';
import { Imoveis } from './paginas/Imoveis';
import { Login } from './paginas/Login';
import { TrocarSenha } from './paginas/TrocarSenha';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

function Protegido() {
  const { carregando, session, membro, empresa, erroPerfil, recarregarPerfil } = useSessao();
  if (carregando) return <Carregando />;
  if (session && erroPerfil) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-bold text-noite">Não foi possível carregar o painel</p>
        <p className="text-sm text-suave">Confira a internet e tente de novo.</p>
        <button onClick={recarregarPerfil} className="h-10 rounded-lg bg-noite px-4 text-sm font-semibold text-white">Tentar de novo</button>
      </div>
    );
  }
  if (!session || !membro || !empresa) return <Navigate to="/login" replace />;
  if (session.user.user_metadata?.trocar_senha) return <Navigate to="/trocar-senha" replace />;
  return <Outlet />;
}

function SoAdmin() {
  const { membro } = useSessao();
  return membro?.papel === 'admin' ? <Outlet /> : <Navigate to="/" replace />;
}

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/trocar-senha', element: <TrocarSenha /> },
  {
    element: <Protegido />,
    children: [
      {
        element: <Estrutura />,
        children: [
          { index: true, element: <Carteira /> },
          { path: 'compradores', element: <Compradores /> },
          { path: 'compradores/novo', element: <CompradorNovo /> },
          { path: 'compradores/:id', element: <CompradorDetalhe /> },
          { path: 'imoveis', element: <Imoveis /> },
          { path: 'imoveis/:id', element: <ImovelForm /> },
          { path: 'comunicados', element: <Comunicados /> },
          { element: <SoAdmin />, children: [{ path: 'configuracoes', element: <Configuracoes /> }] },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ProvedorAvisos>
        <ProvedorSessao>
          <RouterProvider router={router} />
        </ProvedorSessao>
      </ProvedorAvisos>
    </QueryClientProvider>
  </StrictMode>,
);
