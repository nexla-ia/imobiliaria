const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 1250 → "R$ 1.250,00" */
export function formatarMoeda(valor: number): string {
  // Intl usa espaço não separável depois do "R$"; normaliza para espaço comum
  return moeda.format(valor).replace(/ /g, ' ');
}

export function somenteDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

/** "12345678900" → "123.456.789-00" */
export function formatarCpf(cpf: string): string {
  const d = somenteDigitos(cpf).padStart(11, '0').slice(-11);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function cpfValido(cpf: string): boolean {
  const d = somenteDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(d.slice(0, 9), 10) === Number(d[9]) && digito(d.slice(0, 10), 11) === Number(d[10]);
}

/** "5565999373761" → "(65) 9 9937-3761" */
export function formatarTelefone(telefone: string): string {
  const d = somenteDigitos(telefone).replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d[2]} ${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return telefone;
}

/** "2026-10-20" → "20/10/2026". Datas do Asaas são dias de calendário, sem fuso. */
export function formatarData(isoDate: string): string {
  const [ano, mes, dia] = isoDate.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Dias entre hoje e a data (negativo = já passou), comparando só o dia de calendário. */
export function diasAte(isoDate: string, hoje: Date = new Date()): number {
  const [ano, mes, dia] = isoDate.slice(0, 10).split('-').map(Number);
  const alvo = Date.UTC(ano!, mes! - 1, dia!);
  const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo - base) / 86_400_000);
}

/** Link do WhatsApp com mensagem pré-preenchida. */
export function linkWhatsapp(numero: string, mensagem: string): string {
  const d = somenteDigitos(numero);
  // o wa.me exige o DDI: número brasileiro sem o 55 (DDD + 8 ou 9 dígitos) ganha o 55
  const comDdi = d.length === 10 || d.length === 11 ? `55${d}` : d;
  return `https://wa.me/${comDdi}?text=${encodeURIComponent(mensagem)}`;
}
