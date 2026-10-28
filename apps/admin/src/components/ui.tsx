import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

// --- Botão -------------------------------------------------------------------
type VarianteBotao = 'primario' | 'destaque' | 'secundario' | 'fantasma' | 'perigo';

const estilosBotao: Record<VarianteBotao, string> = {
  primario: 'bg-noite text-white hover:bg-marinho',
  destaque: 'bg-ciano text-noite hover:brightness-95',
  secundario: 'bg-white text-noite border border-linha hover:bg-fundo',
  fantasma: 'text-ciano-escuro hover:bg-info-bg',
  perigo: 'bg-erro text-white hover:brightness-95',
};

export function Botao({
  variante = 'primario',
  carregando,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBotao; carregando?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled || carregando}
      className={cx(
        'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        estilosBotao[variante],
        className,
      )}
    >
      {carregando && <Giro />}
      {children}
    </button>
  );
}

export function Giro({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx('inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)}
    />
  );
}

// --- Formulário ----------------------------------------------------------------
export function Campo({ rotulo, dica, erro, children, className }: {
  rotulo: string;
  dica?: ReactNode;
  erro?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx('flex flex-col gap-1.5', className)}>
      <span className="text-sm font-semibold text-texto">{rotulo}</span>
      {children}
      {dica && !erro && <span className="text-xs text-suave">{dica}</span>}
      {erro && <span className="text-xs font-medium text-erro">{erro}</span>}
    </label>
  );
}

const baseEntrada =
  'h-10 w-full rounded-lg border border-linha bg-white px-3 text-sm text-texto placeholder:text-suave/60 focus:border-ciano-escuro focus:outline-none disabled:bg-fundo';

export function Entrada({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(baseEntrada, className)} />;
}

export function Selecao({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cx(baseEntrada, 'pr-8', className)}>
      {children}
    </select>
  );
}

export function AreaTexto({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(baseEntrada, 'h-auto min-h-24 py-2 leading-relaxed', className)} />;
}

export function Interruptor({ ligado, aoMudar, rotulo, descricao }: {
  ligado: boolean;
  aoMudar: (v: boolean) => void;
  rotulo: string;
  descricao?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-semibold">{rotulo}</span>
        {descricao && <span className="block text-xs text-suave">{descricao}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={ligado}
        onChange={(e) => aoMudar(e.target.checked)}
        className="relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-linha transition before:absolute before:top-0.5 before:left-0.5 before:size-5 before:rounded-full before:bg-white before:shadow before:transition checked:bg-ciano-escuro checked:before:translate-x-5"
      />
    </label>
  );
}

// --- Estrutura -----------------------------------------------------------------
export function Cartao({ children, className, titulo, acoes }: {
  children: ReactNode;
  className?: string;
  titulo?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <section className={cx('rounded-xl border border-linha bg-white', className)}>
      {(titulo || acoes) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-linha px-5 py-3.5">
          {titulo && <h2 className="text-base font-bold">{titulo}</h2>}
          {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function CabecalhoPagina({ titulo, subtitulo, acoes }: { titulo: string; subtitulo?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-noite">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-suave">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

type TomSelo = 'neutro' | 'ok' | 'alerta' | 'erro' | 'info';
const estilosSelo: Record<TomSelo, string> = {
  neutro: 'bg-fundo text-suave',
  ok: 'bg-ok-bg text-ok',
  alerta: 'bg-alerta-bg text-alerta',
  erro: 'bg-erro-bg text-erro',
  info: 'bg-info-bg text-ciano-escuro',
};

export function Selo({ tom = 'neutro', children }: { tom?: TomSelo; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap', estilosSelo[tom])}>
      {children}
    </span>
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-suave">
      <Giro /> {texto}
    </div>
  );
}

export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-semibold text-texto">{titulo}</p>
      {children && <div className="mt-1 text-sm text-suave">{children}</div>}
    </div>
  );
}

export function MensagemErro({ erro }: { erro: string | null | undefined }) {
  if (!erro) return null;
  return <p role="alert" className="rounded-lg bg-erro-bg px-3 py-2 text-sm font-medium text-erro">{erro}</p>;
}

export function Tabela({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-xs [&_th]:font-semibold [&_th]:tracking-wide [&_th]:text-suave [&_th]:uppercase [&_thead]:border-b [&_thead]:border-linha [&_tbody_tr]:border-b [&_tbody_tr]:border-linha/70 [&_tbody_tr:last-child]:border-0">
        {children}
      </table>
    </div>
  );
}

// --- Modal ---------------------------------------------------------------------
export function Modal({ aberto, aoFechar, titulo, children, largura = 'max-w-lg' }: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  children: ReactNode;
  largura?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);
  return (
    <dialog
      ref={ref}
      onClose={aoFechar}
      onClick={(e) => e.target === ref.current && aoFechar()}
      className={cx('m-auto w-[calc(100%-2rem)] rounded-2xl p-0 shadow-2xl backdrop:bg-noite/50', largura)}
    >
      {aberto && (
        <div className="p-6">
          <h2 className="mb-4 text-lg font-bold text-noite">{titulo}</h2>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Confirmar({ aberto, aoFechar, aoConfirmar, titulo, texto, rotulo = 'Confirmar', perigo, carregando }: {
  aberto: boolean;
  aoFechar: () => void;
  aoConfirmar: () => void;
  titulo: string;
  texto: ReactNode;
  rotulo?: string;
  perigo?: boolean;
  carregando?: boolean;
}) {
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={titulo} largura="max-w-md">
      <div className="text-sm leading-relaxed text-suave">{texto}</div>
      <div className="mt-6 flex justify-end gap-2">
        <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante={perigo ? 'perigo' : 'primario'} onClick={aoConfirmar} carregando={carregando}>{rotulo}</Botao>
      </div>
    </Modal>
  );
}

// --- Avisos (toast) --------------------------------------------------------------
interface Aviso { id: number; texto: string; tom: 'ok' | 'erro' }
const ContextoAviso = createContext<(texto: string, tom?: 'ok' | 'erro') => void>(() => {});

export function ProvedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const avisar = useCallback((texto: string, tom: 'ok' | 'erro' = 'ok') => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, texto, tom }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ContextoAviso.Provider value={avisar}>
      {children}
      <div aria-live="polite" className="fixed right-4 bottom-4 z-50 flex flex-col gap-2">
        {avisos.map((a) => (
          <div
            key={a.id}
            className={cx(
              'max-w-sm rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg',
              a.tom === 'ok' ? 'bg-noite' : 'bg-erro',
            )}
          >
            {a.texto}
          </div>
        ))}
      </div>
    </ContextoAviso.Provider>
  );
}

export function useAvisar() {
  return useContext(ContextoAviso);
}

export function BarraProgresso({ valor, total }: { valor: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((valor / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-linha" role="progressbar" aria-valuenow={valor} aria-valuemax={total}>
        <div className="h-full rounded-full bg-gradient-to-r from-ciano-escuro to-ciano" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-suave tabular-nums">{valor}/{total}</span>
    </div>
  );
}
