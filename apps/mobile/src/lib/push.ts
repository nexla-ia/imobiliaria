import type { Notificacao } from '@planejar/shared';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { armazenamentoSeguro } from './armazenamento';
import { supabase } from './supabase';

type ModuloNotificacoes = typeof import('expo-notifications');

const CHAVE_TOKEN = 'planejar.push_token';

/**
 * O Expo Go no Android não tem o módulo nativo de push desde o SDK 53, e só
 * importar expo-notifications já derruba o app lá. Por isso o módulo é carregado
 * sob demanda e só fora do Expo Go (development build e versão das lojas).
 */
const pushDisponivel = Platform.OS !== 'web' && !isRunningInExpoGo();

let modulo: ModuloNotificacoes | null = null;
function notificacoes(): ModuloNotificacoes | null {
  if (!pushDisponivel) return null;
  if (!modulo) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modulo = require('expo-notifications') as ModuloNotificacoes;
    // notificação com o app aberto: mostra o banner e guarda na central
    modulo.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }
  return modulo;
}

/**
 * Pede permissão e registra o aparelho para receber push.
 * Não lança erro: sem permissão ou no Expo Go, o app segue normal e as
 * notificações continuam aparecendo na central dentro do app.
 */
export async function registrarPush(): Promise<void> {
  const N = notificacoes();
  if (!N) return;
  try {
    if (Platform.OS === 'android') {
      // precisa existir antes do pedido de permissão (Android 13+) e do token
      await N.setNotificationChannelAsync('padrao', {
        name: 'Avisos da imobiliária',
        importance: N.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#0AC1FA',
      });
    }
    let { status } = await N.getPermissionsAsync();
    if (status !== 'granted') status = (await N.requestPermissionsAsync()).status;
    if (status !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('push: projectId do EAS ausente em app.json (extra.eas.projectId)');
      return;
    }
    const token = (await N.getExpoPushTokenAsync({ projectId })).data;
    const { error } = await supabase.rpc('registrar_push_token', { p_token: token, p_plataforma: Platform.OS });
    if (error) throw error;
    await armazenamentoSeguro.setItem(CHAVE_TOKEN, token);
  } catch (e) {
    console.warn('push: não foi possível registrar', e);
  }
}

/** Ao sair, este aparelho para de receber push da conta. */
export async function desregistrarPush(): Promise<void> {
  try {
    const token = await armazenamentoSeguro.getItem(CHAVE_TOKEN);
    if (token) await supabase.rpc('desativar_push_token', { p_token: token });
    await armazenamentoSeguro.removeItem(CHAVE_TOKEN);
  } catch {
    // sair do app não pode falhar por causa disso
  }
}

/**
 * Chama `aoTocar` quando o comprador toca numa notificação, inclusive a que
 * abriu o app fechado. Devolve a função para parar de ouvir.
 */
export function ouvirToquesEmNotificacoes(aoTocar: (payload: Notificacao['payload']) => void): () => void {
  const N = notificacoes();
  if (!N) return () => {};
  const ultima = N.getLastNotificationResponse();
  if (ultima) {
    aoTocar(ultima.notification.request.content.data as Notificacao['payload']);
    N.clearLastNotificationResponse();
  }
  const sub = N.addNotificationResponseReceivedListener((r) => {
    aoTocar(r.notification.request.content.data as Notificacao['payload']);
  });
  return () => sub.remove();
}
