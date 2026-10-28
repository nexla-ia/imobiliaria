import type { Comprador, ConvidarRes } from '@planejar/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { chamar, mensagemDeErro } from '../lib/api';
import { Botao, MensagemErro, Modal } from './ui';

type CompradorConvite = Pick<Comprador, 'id' | 'nome' | 'telefone' | 'status_acesso' | 'deve_trocar_senha'>;

/**
 * Gera a senha provisória do comprador e entrega a mensagem pronta para mandar
 * pelo WhatsApp da imobiliária. Usado no convite e no "esqueci a senha".
 */
export function ModalConvite({ comprador, aoFechar }: { comprador: CompradorConvite; aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ConvidarRes | null>(null);
  const [copiado, setCopiado] = useState(false);
  const jaUsaApp = comprador.status_acesso === 'ativo' && !comprador.deve_trocar_senha;

  async function gerar() {
    setGerando(true);
    setErro(null);
    try {
      setResultado(await chamar<ConvidarRes>('acesso-convidar', { comprador_id: comprador.id }));
      await queryClient.invalidateQueries({ queryKey: ['comprador', comprador.id] });
      await queryClient.invalidateQueries({ queryKey: ['compradores'] });
      await queryClient.invalidateQueries({ queryKey: ['carteira'] });
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setGerando(false);
    }
  }

  async function copiar() {
    if (!resultado) return;
    try {
      await navigator.clipboard.writeText(resultado.mensagem);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErro('Não foi possível copiar. Selecione o texto e copie à mão.');
    }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo={resultado ? 'Convite pronto' : jaUsaApp ? 'Gerar nova senha' : 'Gerar acesso ao app'} largura="max-w-xl">
      {!resultado ? (
        <div className="space-y-4 text-sm text-suave">
          <p>
            Vamos gerar uma <strong className="text-texto">senha provisória</strong> para {comprador.nome}. Ele entra no app com o CPF e essa
            senha, e o app pede para criar uma senha nova no primeiro acesso. A provisória vale 30 dias.
          </p>
          {jaUsaApp && (
            <p className="rounded-lg bg-alerta-bg px-3 py-2 font-medium text-alerta">
              Ele já usa o app. A senha atual dele deixa de funcionar assim que você gerar a nova.
            </p>
          )}
          {comprador.status_acesso === 'ativo' && comprador.deve_trocar_senha && (
            <p className="rounded-lg bg-info-bg px-3 py-2 text-ciano-escuro">A senha provisória anterior deixa de valer.</p>
          )}
          {!comprador.telefone && (
            <p className="rounded-lg bg-alerta-bg px-3 py-2 font-medium text-alerta">
              Este comprador não tem WhatsApp cadastrado. Você vai poder copiar a mensagem e enviar por outro meio.
            </p>
          )}
          <MensagemErro erro={erro} />
          <div className="flex justify-end gap-2">
            <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
            <Botao onClick={gerar} carregando={gerando}>Gerar senha provisória</Botao>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl bg-noite px-5 py-4 text-white">
            <p className="text-xs font-semibold tracking-wide text-white/60 uppercase">Senha provisória</p>
            <p className="mt-1 font-mono text-3xl font-bold tracking-widest text-ciano select-all">{resultado.senha}</p>
            <p className="mt-1 text-xs text-white/60">Vale até {new Date(resultado.expira_em).toLocaleDateString('pt-BR')}. Login: CPF do comprador.</p>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-semibold">Mensagem</p>
            <pre className="max-h-48 overflow-auto rounded-lg border border-linha bg-fundo p-3 font-sans text-sm whitespace-pre-wrap text-texto">
              {resultado.mensagem}
            </pre>
          </div>
          <MensagemErro erro={erro} />
          <div className="flex flex-wrap justify-end gap-2">
            <Botao variante="secundario" onClick={copiar}>{copiado ? 'Copiado!' : 'Copiar mensagem'}</Botao>
            {resultado.link_whatsapp && (
              <a
                href={resultado.link_whatsapp}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1F9E55] px-4 text-sm font-semibold text-white hover:brightness-95"
              >
                Abrir no WhatsApp
              </a>
            )}
          </div>
          <p className="text-xs text-suave">
            O WhatsApp abre com a mensagem pronta para o número do comprador; é só enviar. A senha não fica guardada no sistema: se perder,
            gere outra.
          </p>
        </div>
      )}
    </Modal>
  );
}
