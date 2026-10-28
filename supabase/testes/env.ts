// Carrega um .env sem expandir "$" (a chave do Asaas começa com $).
export function carregarEnv(caminho: string | URL) {
  for (const linha of Deno.readTextFileSync(caminho).split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2]!.replace(/\s+#.*$/, '').trim();
    if (/^'.*'$/.test(v) || /^".*"$/.test(v)) v = v.slice(1, -1);
    Deno.env.set(m[1]!, v);
  }
}
