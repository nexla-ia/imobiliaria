import { useState } from 'react';

/**
 * "Puxar para atualizar": a roda aparece só quando a pessoa puxa a tela, não a cada
 * recarga em segundo plano (tempo real, volta ao app).
 */
export function usePuxarParaAtualizar(atualizar: () => Promise<unknown> | unknown) {
  const [atualizando, setAtualizando] = useState(false);
  return {
    atualizando,
    aoPuxar: async () => {
      setAtualizando(true);
      try {
        await atualizar();
      } finally {
        setAtualizando(false);
      }
    },
  };
}
