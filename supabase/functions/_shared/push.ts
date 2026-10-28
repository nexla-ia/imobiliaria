import type { Admin } from './supabase.ts';

/** Envia push pelo serviço da Expo para todos os aparelhos ativos dos compradores. */
export async function enviarPush(
  db: Admin,
  compradorIds: string[],
  mensagem: { titulo: string; corpo: string; dados?: Record<string, unknown> },
): Promise<number> {
  if (compradorIds.length === 0) return 0;

  const tokens: Array<{ id: string; expo_token: string }> = [];
  for (let i = 0; i < compradorIds.length; i += 500) {
    const { data, error } = await db
      .from('push_tokens')
      .select('id, expo_token')
      .in('comprador_id', compradorIds.slice(i, i + 500))
      .eq('ativo', true);
    if (error) throw error;
    tokens.push(...(data ?? []));
  }

  let enviados = 0;
  const invalidos: string[] = [];
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');

  // a Expo aceita até 100 mensagens por requisição
  for (let i = 0; i < tokens.length; i += 100) {
    const lote = tokens.slice(i, i + 100);
    const resp = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(
        lote.map((t) => ({
          to: t.expo_token,
          title: mensagem.titulo,
          body: mensagem.corpo,
          data: mensagem.dados ?? {},
          sound: 'default',
          channelId: 'padrao',
        })),
      ),
    });
    if (!resp.ok) {
      console.error('Expo push', resp.status, await resp.text());
      continue;
    }
    const { data: tickets } = (await resp.json()) as {
      data: Array<{ status: 'ok' | 'error'; details?: { error?: string } }>;
    };
    tickets.forEach((ticket, j) => {
      if (ticket.status === 'ok') enviados++;
      else if (ticket.details?.error === 'DeviceNotRegistered') invalidos.push(lote[j]!.id);
    });
  }

  if (invalidos.length) await db.from('push_tokens').update({ ativo: false }).in('id', invalidos);
  return enviados;
}

export interface NovaNotificacao {
  empresa_id: string;
  comprador_id: string;
  tipo: 'vencimento' | 'pagamento' | 'comunicado';
  titulo: string;
  corpo: string;
  payload?: Record<string, unknown>;
  chave_dedup: string;
}

/**
 * Grava na central de notificações e manda o push só para quem ainda não tinha
 * recebido (chave_dedup), para o cron e o webhook poderem rodar de novo sem duplicar.
 */
export async function notificar(db: Admin, itens: NovaNotificacao[]): Promise<{ novas: number; pushes: number }> {
  if (itens.length === 0) return { novas: 0, pushes: 0 };
  const { data, error } = await db
    .from('notificacoes')
    .upsert(itens.map((n) => ({ ...n, payload: n.payload ?? {} })), { onConflict: 'chave_dedup', ignoreDuplicates: true })
    .select('comprador_id, titulo, corpo, payload');
  if (error) throw error;

  let pushes = 0;
  // agrupa por conteúdo para mandar um lote por mensagem igual
  const grupos = new Map<string, { titulo: string; corpo: string; dados: Record<string, unknown>; ids: string[] }>();
  for (const n of data ?? []) {
    const chave = JSON.stringify([n.titulo, n.corpo, n.payload]);
    const g = grupos.get(chave) ?? { titulo: n.titulo, corpo: n.corpo, dados: n.payload ?? {}, ids: [] as string[] };
    g.ids.push(n.comprador_id);
    grupos.set(chave, g);
  }
  for (const g of grupos.values()) {
    pushes += await enviarPush(db, g.ids, { titulo: g.titulo, corpo: g.corpo, dados: g.dados });
  }
  return { novas: data?.length ?? 0, pushes };
}
