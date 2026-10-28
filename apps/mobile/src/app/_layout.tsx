import {
  Saira_400Regular,
  Saira_500Medium,
  Saira_600SemiBold,
  Saira_700Bold,
  Saira_800ExtraBold,
  Saira_800ExtraBold_Italic,
  useFonts,
} from '@expo-google-fonts/saira';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProvedorSessao, useSessao } from '@/lib/sessao';
import { cores } from '@/tema';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});

function Navegacao() {
  const { carregando, session } = useSessao();
  const [fontesProntas, erroFontes] = useFonts({
    Saira_400Regular,
    Saira_500Medium,
    Saira_600SemiBold,
    Saira_700Bold,
    Saira_800ExtraBold,
    Saira_800ExtraBold_Italic,
  });
  const pronto = !carregando && (fontesProntas || !!erroFontes);

  useEffect(() => {
    if (pronto) SplashScreen.hide();
  }, [pronto]);

  if (!pronto) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: cores.fundo } }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="entrar" />
        <Stack.Screen name="primeiro-acesso" />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ProvedorSessao>
          <StatusBar style="light" />
          <Navegacao />
        </ProvedorSessao>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
