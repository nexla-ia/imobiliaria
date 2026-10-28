import type { Notificacao } from '@planejar/shared';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Texto } from '@/components/Texto';
import { Topo } from '@/components/Topo';
import { Carregando, ErroCarga, Icone, Vazio, type NomeIcone } from '@/components/ui';
import { useNotificacoes } from '@/lib/dados';
import { abrirDestino } from '@/lib/navegacao';
import { usePuxarParaAtualizar } from '@/lib/puxar';
import { supabase } from '@/lib/supabase';
import { cores } from '@/tema';

const visual: Record<Notificacao['tipo'], { icone: NomeIcone; cor: string; fundo: string }> = {
  vencimento: { icone: 'calendar-outline', cor: cores.alerta, fundo: cores.alertaBg },
  pagamento: { icone: 'checkmark-circle-outline', cor: cores.sucesso, fundo: cores.okBg },
  comunicado: { icone: 'megaphone-outline', cor: cores.comunicado, fundo: cores.comunicadoBg },
};

function quando(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return mesmoDia ? `hoje, ${hora}` : `${d.toLocaleDateString('pt-BR')}, ${hora}`;
}

export default function Notificacoes() {
  const q = useNotificacoes();
  const puxar = usePuxarParaAtualizar(() => q.refetch());
  const queryClient = useQueryClient();
  const naoLidas = (q.data ?? []).filter((n) => !n.lida_em);

  async function marcar(ids: string[]) {
    if (!ids.length) return;
    await supabase.from('notificacoes').update({ lida_em: new Date().toISOString() }).in('id', ids);
    queryClient.invalidateQueries({ queryKey: ['notificacoes'] });
  }

  return (
    <View style={{ flex: 1, backgroundColor: cores.fundo }}>
      <Topo
        titulo="Notificações"
        esquerda={
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Voltar" style={estilos.voltar}>
            <Icone nome="chevron-back" cor="#FFFFFF" />
          </Pressable>
        }
        direita={
          naoLidas.length > 0 ? (
            <Pressable onPress={() => marcar(naoLidas.map((n) => n.id))} accessibilityRole="button" hitSlop={8}>
              <Texto peso="semi" tamanho={15} cor={cores.ciano}>Marcar como lidas</Texto>
            </Pressable>
          ) : null
        }
      />
      {q.isLoading ? (
        <Carregando />
      ) : q.error ? (
        <ErroCarga aoTentar={() => q.refetch()} />
      ) : (
        <FlatList
          data={q.data}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={puxar.atualizando} onRefresh={puxar.aoPuxar} tintColor={cores.cianoEscuro} />}
          ListEmptyComponent={
            <Vazio icone="notifications-off-outline" titulo="Nenhuma notificação" texto="Avisos de vencimento, pagamentos e comunicados da imobiliária aparecem aqui." />
          }
          renderItem={({ item: n, index }) => {
            const v = visual[n.tipo];
            const ultima = index === (q.data?.length ?? 0) - 1;
            return (
              <Pressable
                onPress={() => {
                  if (!n.lida_em) marcar([n.id]);
                  abrirDestino(n.payload);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${n.lida_em ? '' : 'Não lida. '}${n.titulo}. ${n.corpo}`}
                style={({ pressed }) => [
                  estilos.item,
                  index === 0 && { borderTopLeftRadius: 18, borderTopRightRadius: 18 },
                  ultima && { borderBottomLeftRadius: 18, borderBottomRightRadius: 18, borderBottomWidth: 0 },
                  !n.lida_em && { backgroundColor: '#F5FAFF' },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={[estilos.ico, { backgroundColor: v.fundo }]}><Icone nome={v.icone} cor={v.cor} /></View>
                <View style={{ flex: 1 }}>
                  <Texto peso="negrito" style={{ paddingRight: 14 }}>{n.titulo}</Texto>
                  <Texto tamanho={15} cor="#3A4466" style={{ marginTop: 2 }}>{n.corpo}</Texto>
                  <Texto tamanho={14} cor={cores.textoSuave} style={{ marginTop: 4 }}>{quando(n.created_at)}</Texto>
                </View>
                {!n.lida_em && <View style={estilos.ponto} />}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  voltar: {
    width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  item: { flexDirection: 'row', gap: 12, padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: cores.linhaSuave },
  ico: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ponto: { position: 'absolute', top: 20, right: 16, width: 10, height: 10, borderRadius: 5, backgroundColor: cores.cianoEscuro },
});
