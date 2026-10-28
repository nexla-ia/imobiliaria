import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Botao, Campo, Carregando, Entrada, MensagemErro } from '../components/ui';
import { useSessao } from '../lib/sessao';
import { supabase } from '../lib/supabase';

/** Usada no primeiro acesso (senha provisória) e no link de recuperação de senha. */
export function TrocarSenha() {
  const { carregando, session } = useSessao();
  const navegar = useNavigate();
  const [senha, setSenha] = useState('');
  const [repetir, setRepetir] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  if (carregando) return <Carregando />;
  if (!session) return <Navigate to="/login" replace />;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (senha.length < 8) return setErro('Use pelo menos 8 caracteres.');
    if (senha !== repetir) return setErro('As duas senhas não são iguais.');
    setErro(null);
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha, data: { trocar_senha: false } });
    setSalvando(false);
    if (error) return setErro(error.message.includes('different') ? 'A nova senha precisa ser diferente da atual.' : 'Não foi possível salvar a senha.');
    navegar('/', { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={salvar} className="w-full max-w-sm space-y-4">
        <img src="/simbolo-azul.png" alt="" className="size-14" />
        <h1 className="text-2xl font-bold text-noite">Crie sua senha</h1>
        <p className="text-sm text-suave">Escolha uma senha só sua para entrar no painel.</p>
        <Campo rotulo="Nova senha">
          <Entrada id="nova-senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
        </Campo>
        <Campo rotulo="Repita a senha">
          <Entrada id="repetir-senha" type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} autoComplete="new-password" />
        </Campo>
        <MensagemErro erro={erro} />
        <Botao type="submit" className="w-full" carregando={salvando}>Salvar e entrar</Botao>
      </form>
    </div>
  );
}
