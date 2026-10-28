import { formatarData, formatarMoeda, type Cobranca, type StatusApp } from '@planejar/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Texto } from '@/components/Texto';
import { Topo } from '@/components/Topo';
import { Carregando, ErroCarga, PillStatus, Vazio } from '@/components/ui';
import { useImovelAtual } from '@/lib/imovel-atual';
import { useComprador } from '@/lib/sessao';
import { cores } from '@/tema';

type Filtro = 'todas' | Exclude<StatusApp, 'oculta'>;
const rotulos: Record<Filtro, string> = { todas: 'Todas', em_aberto: 'Em aberto', vencida: 'Vencidas', paga: 'Pagas', estornada: 'Estornadas' };

export default function Parcelas() {
  const { empresa } = useComprador();
  const { contrato, parcelas, avulsas, carregando, erro, recarregar, cobrancas } = useImovelAtual();
  const [filtro, setFiltro] = useState<Filtro>('todas');

  // avulsas só aparecem se a imobiliária liberou (a RLS já filtra; aqui é só a seção)
  const todas = empresa.mostrar_cobrancas_avulsas ? [...parcelas, ...avulsas] : parcelas;
  const contagem = (f: Filtro) => (f === 'todas' ? todas.length : todas.filter((p) => p.status_app === f).length);
  const filtros = (Object.keys(rotulos) as Filtro[]).filter((f) => f !== 'estornada' || contagem(f) > 0);
  const lista = filtro === 'todas' ? todas : todas.filter((p) => p.status_app === filtro);

  const resumo = contrato?.resumo;
  const total = resumo?.total_parcelas ?? parcelas.length;
  const pagas = parcelas.filter((p) => p.status_app === 'paga').length;

  return (
    <View style={{ flex: 1, backgroundColor: cores.fundo }}>
      <Topo titulo="Minhas parcelas" subtitulo={contrato?.imoveis.identificacao}>
        <View style={estilos.resumo}>
          <Resumo rotulo="Total pago" valor={formatarMoeda(Number(resumo?.total_pago ?? 0))} />
          <Resumo rotulo="Faltam" valor={`${Math.max(0, total - pagas)} de ${total}`} />
          <Resumo rotulo="Saldo" valor={formatarMoeda(Number(resumo?.saldo_em_aberto ?? 0))} />
        </View>
      </Topo>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.filtros}>
          {filtros.map((f) => {
            const ativo = filtro === f;
            return (
              <Pressable
                key={f}
                onPress={() => setFiltro(f)}
                accessibilityRole="button"
                accessibilityState={{ selected: ativo }}
                style={[estilos.filtro, ativo && estilos.filtroAtivo]}
              >
                <Texto peso="semi" tamanho={15} cor={ativo ? '#FFFFFF' : cores.textoSuave}>{rotulos[f]} ({contagem(f)})</Texto>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {carregando ? (
        <Carregando />
      ) : erro ? (
        <ErroCarga aoTentar={recarregar} />
      ) : (
        <FlatList
          data={lista}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={cobrancas.isRefetching} onRefresh={() => { void recarregar(); }} tintColor={cores.cianoEscuro} />}
          ListEmptyComponent={
            <Vazio
              icone={filtro === 'vencida' ? 'happy-outline' : 'file-tray-outline'}
              titulo={filtro === 'vencida' ? 'Nenhuma parcela vencida' : 'Nenhuma parcela aqui'}
            />
          }
          renderItem={({ item, index }) => (
            <LinhaParcela cobranca={item} total={total} primeira={index === 0} ultima={index === lista.length - 1} />
          )}
        />
      )}
    </View>
  );
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={estilos.resumoItem}>
      <Texto tamanho={14} cor={cores.textoClaro}>{rotulo}</Texto>
      <Texto peso="negrito" tamanho={16} cor="#FFFFFF" adjustsFontSizeToFit numberOfLines={1}>{valor}</Texto>
    </View>
  );
}

function LinhaParcela({ cobranca: c, total, primeira, ultima }: { cobranca: Cobranca; total: number; primeira: boolean; ultima: boolean }) {
  const avulsa = !c.contrato_id;
  const titulo = avulsa ? c.descricao || 'Cobrança' : `Parcela ${c.numero_parcela ?? '–'} de ${total}`;
  const sub =
    c.status_app === 'paga' && c.data_pagamento
      ? `Pago em ${formatarData(c.data_pagamento)}`
      : c.status_app === 'vencida'
        ? `Venceu em ${formatarData(c.vencimento)}`
        : `Vence em ${formatarData(c.vencimento)}`;
  const corNum = c.status_app === 'paga' ? [cores.okBg, cores.sucesso] : c.status_app === 'vencida' ? [cores.erroBg, cores.erro] : [cores.fundo, cores.azulNoite];
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/cobranca/[id]', params: { id: c.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${titulo}, ${sub}, ${formatarMoeda(c.valor)}`}
      style={({ pressed }) => [
        estilos.linha,
        primeira && { borderTopLeftRadius: 18, borderTopRightRadius: 18 },
        ultima && { borderBottomLeftRadius: 18, borderBottomRightRadius: 18, borderBottomWidth: 0 },
        pressed && { backgroundColor: '#F7F9FC' },
      ]}
    >
      <View style={[estilos.num, { backgroundColor: corNum[0] }]}>
        <Texto peso="extra" cor={corNum[1]}>{avulsa ? '•' : c.numero_parcela ?? '–'}</Texto>
      </View>
      <View style={{ flex: 1 }}>
        <Texto peso="negrito" numberOfLines={1}>{titulo}</Texto>
        <Texto tamanho={15} cor={cores.textoSuave}>{sub}</Texto>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Texto peso="negrito">{formatarMoeda(c.status_app === 'paga' && c.valor_original ? c.valor_original : c.valor)}</Texto>
        <PillStatus status={c.status_app} />
      </View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  resumo: { flexDirection: 'row', gap: 8, marginTop: 18 },
  resumoItem: {
    flex: 1, padding: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  filtros: { gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  filtro: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: cores.linha },
  filtroAtivo: { backgroundColor: cores.azulNoite, borderColor: cores.azulNoite },
  linha: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: cores.linhaSuave,
  },
  num: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
