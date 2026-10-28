import { useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { DefinirSenha } from '@/components/DefinirSenha';
import { Ondas } from '@/components/Ondas';
import { Texto } from '@/components/Texto';
import { Botao, Carregando } from '@/components/ui';
import { ProvedorImovelAtual } from '@/lib/imovel-atual';
import { abrirDestino } from '@/lib/navegacao';
import { ouvirToquesEmNotificacoes, registrarPush } from '@/lib/push';
import { useSessao } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';
import { cores } from '@/tema';

export default function AppLayout() {
  const { comprador, empresa, bloqueado, carregando, erroCarga, sair, recarregar } = useSessao();
  const queryClient = useQueryClient();
  // com senha provisória ainda não trocada, o servidor não libera nada (nem push, nem tempo real)
  const liberado = comprador?.status_acesso === 'ativo' && !comprador.deve_trocar_senha;
  const compradorId = liberado ? comprador.id : null;

  // fundo do sistema (área da barra de gestos do Android): branco como a barra de abas;
  // volta ao azul-noite das telas de login ao sair
  useEffect(() => {
    if (!liberado) return;
    SystemUI.setBackgroundColorAsync('#FFFFFF').catch(() => {});
    return () => {
      SystemUI.setBackgroundColorAsync(cores.azulNoite).catch(() => {});
    };
  }, [liberado]);

  // push: registra o aparelho e trata toques (inclusive com o app fechado)
  useEffect(() => {
    if (!compradorId) return;
    registrarPush();
    return ouvirToquesEmNotificacoes(abrirDestino);
  }, [compradorId]);

  // tempo real: pagamento confirmado no Asaas aparece na hora
  useEffect(() => {
    if (!compradorId) return;
    const canal = supabase
      .channel(`comprador:${compradorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cobrancas', filter: `comprador_id=eq.${compradorId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['cobrancas'] });
        queryClient.invalidateQueries({ queryKey: ['contratos'] });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `comprador_id=eq.${compradorId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['notificacoes'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [compradorId, queryClient]);

  if (carregando) return <Carregando />;

  // sem internet ao abrir: não é "conta excluída", é só tentar de novo
  if (erroCarga && (!comprador || (comprador.status_acesso === 'ativo' && !empresa))) {
    return (
      <View style={{ flex: 1, backgroundColor: cores.azulNoite, justifyContent: 'center', padding: 24, gap: 12 }}>
        <Ondas variante="login" />
        <Texto peso="extraItalico" tamanho={28} cor="#FFFFFF">SEM CONEXÃO</Texto>
        <Texto cor={cores.textoClaro}>Não conseguimos carregar seus dados. Confira a internet do celular e tente de novo.</Texto>
        <Botao titulo="Tentar de novo" variante="ciano" aoTocar={recarregar} style={{ marginTop: 12 }} />
        <Botao titulo="Sair" variante="contorno" aoTocar={sair} />
      </View>
    );
  }

  if (comprador?.status_acesso === 'ativo' && comprador.deve_trocar_senha) return <DefinirSenha />;

  if (bloqueado) {
    return (
      <View style={{ flex: 1, backgroundColor: cores.azulNoite, justifyContent: 'center', padding: 24, gap: 12 }}>
        <Ondas variante="login" />
        <Texto peso="extraItalico" tamanho={28} cor="#FFFFFF">ACESSO INDISPONÍVEL</Texto>
        <Texto cor={cores.textoClaro}>
          Seu acesso ao app está suspenso ou sua conta foi excluída. Fale com a imobiliária para voltar a acompanhar suas parcelas.
        </Texto>
        <Botao titulo="Sair" variante="ciano" aoTocar={sair} style={{ marginTop: 12 }} />
      </View>
    );
  }

  return (
    <ProvedorImovelAtual>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: cores.fundo } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="cobranca/[id]"
          options={
            // no Android a formSheet abriu invisível e travou os toques (Expo Go SDK 58, Pixel 5 / Android 14)
            Platform.OS === 'ios'
              ? {
                  presentation: 'formSheet',
                  sheetAllowedDetents: [0.92],
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 26,
                  contentStyle: { backgroundColor: '#FFFFFF' },
                }
              : { presentation: 'modal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: '#FFFFFF' } }
          }
        />
        <Stack.Screen name="notificacoes" />
        <Stack.Screen name="trocar-senha" options={{ presentation: 'modal' }} />
      </Stack>
    </ProvedorImovelAtual>
  );
}
