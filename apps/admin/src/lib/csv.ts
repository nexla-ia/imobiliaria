/** Gera um CSV com ";" (padrão do Excel em português) e BOM UTF-8 para acentos. */
export function baixarCsv(nomeArquivo: string, cabecalho: string[], linhas: Array<Array<string | number>>) {
  const escapar = (v: string | number) => {
    // texto começando com = + - @ vira fórmula no Excel: prefixa com apóstrofo
    const s = typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const conteudo = [cabecalho, ...linhas].map((l) => l.map(escapar).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}
