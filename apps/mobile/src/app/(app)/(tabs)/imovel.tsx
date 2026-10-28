import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ondas } from '@/components/Ondas';
import { Texto } from '@/components/Texto';
import { Botao, Cartao, Carregando, Icone, SecaoTitulo, Vazio } from '@/components/ui';
import { useFotosImovel } from '@/lib/dados';
import { useImovelAtual } from '@/lib/imovel-atual';
import { cores } from '@/tema';

function linkMapa(lat: number, lng: number, nome: string, rota: boolean): string {
  if (Platform.OS === 'ios') {
    return rota
      ? `https://maps.apple.com/directions?destination=${lat},${lng}`
      : `https://maps.apple.com/place?coordinate=${lat},${lng}&name=${encodeURIComponent(nome)}`;
  }
  return rota
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat}%2C${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`;
}

export default function MeuImovel() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { contrato, carregando } = useImovelAtual();
  const fotos = useFotosImovel(contrato?.imovel_id);
  const [foto, setFoto] = useState(0);

  if (carregando) return <Carregando />;
  if (!contrato) return <Vazio icone="home-outline" titulo="Nenhum imóvel vinculado ainda" />;
  const i = contrato.imoveis;
  const temMapa = i.lat != null && i.lng != null;
  const listaFotos = fotos.data ?? [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: cores.fundo }} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={[estilos.galeria, { height: 260 + insets.top }]}>
        {listaFotos.length ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setFoto(Math.round(e.nativeEvent.contentOffset.x / width))}
          >
            {listaFotos.map((url, n) => (
              <Image key={url} source={{ uri: url }} style={{ width, height: '100%' }} contentFit="cover" accessibilityLabel={`Foto ${n + 1} do imóvel`} />
            ))}
          </ScrollView>
        ) : (
          <View style={estilos.semFoto}>
            <Ondas />
            <Icone nome="home-outline" tamanho={44} cor="rgba(255,255,255,0.8)" />
          </View>
        )}
        <View style={estilos.sombraLegenda} pointerEvents="none" />
        <View style={estilos.legenda} pointerEvents="none">
          <Texto peso="extra" tamanho={26} cor="#FFFFFF" accessibilityRole="header">{i.identificacao}</Texto>
          {i.empreendimentos && (
            <Texto cor="#E0E8FF">{i.empreendimentos.nome}{i.empreendimentos.cidade ? ` · ${i.empreendimentos.cidade}` : ''}</Texto>
          )}
        </View>
        {listaFotos.length > 1 && (
          <View style={estilos.pontos}>
            {listaFotos.map((u, n) => <View key={u} style={[estilos.ponto, n === foto && estilos.pontoAtivo]} />)}
          </View>
        )}
      </View>

      <View style={estilos.fichas}>
        <Cartao style={estilos.ficha}>
          <Icone nome="resize-outline" cor={cores.cianoEscuro} />
          <Texto tamanho={14} cor={cores.textoSuave} style={{ marginTop: 6 }}>Metragem</Texto>
          <Texto peso="negrito" tamanho={17}>{i.metragem_m2 ? `${Number(i.metragem_m2).toLocaleString('pt-BR')} m²` : '—'}</Texto>
        </Cartao>
        <Cartao style={estilos.ficha}>
          <Icone nome="business-outline" cor={cores.cianoEscuro} />
          <Texto tamanho={14} cor={cores.textoSuave} style={{ marginTop: 6 }}>Empreendimento</Texto>
          <Texto peso="negrito" tamanho={17}>{i.empreendimentos?.nome ?? '—'}</Texto>
        </Cartao>
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        <SecaoTitulo titulo="Localização" />
        <Cartao style={{ overflow: 'hidden' }}>
          <MapaIlustrado />
          <View style={{ padding: 16, gap: 10 }}>
            <Texto peso="negrito">{i.identificacao}</Texto>
            <Texto cor={cores.textoSuave}>{i.endereco || 'Endereço não informado pela imobiliária.'}</Texto>
            {temMapa && (
              <>
                <Botao titulo="Abrir no mapa" icone="map-outline" variante="navy" aoTocar={() => Linking.openURL(linkMapa(i.lat!, i.lng!, i.identificacao, false)).catch(() => {})} />
                <Botao titulo="Como chegar" icone="navigate-outline" variante="claro" aoTocar={() => Linking.openURL(linkMapa(i.lat!, i.lng!, i.identificacao, true)).catch(() => {})} />
              </>
            )}
          </View>
        </Cartao>

        {i.descricao ? (
          <>
            <SecaoTitulo titulo="Sobre o imóvel" />
            <Cartao style={{ padding: 16 }}>
              <Texto cor="#2C3656" style={{ lineHeight: 24 }}>{i.descricao}</Texto>
            </Cartao>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

/** Ilustração de quadras com o pino da marca (o mapa de verdade abre no app de mapas). */
function MapaIlustrado() {
  return (
    <Svg width="100%" height={150} viewBox="0 0 380 150" preserveAspectRatio="xMidYMid slice" accessibilityElementsHidden>
      <Rect width={380} height={150} fill="#E9EEF5" />
      <Path d="M0 110 C80 90 140 130 220 100 S330 70 380 85" stroke="#BFD9EA" strokeWidth={16} fill="none" />
      <G stroke="#FFFFFF" strokeWidth={9} fill="none">
        <Path d="M-10 55H390" /><Path d="M60 -10V160" /><Path d="M175 -10V160" /><Path d="M290 -10V160" />
      </G>
      <G fill="#DCE9D8"><Rect x={74} y={68} width={88} height={70} rx={4} /><Rect x={304} y={6} width={70} height={36} rx={4} /></G>
      <G fill="#D6DDEA"><Rect x={189} y={6} width={88} height={36} rx={4} /><Rect x={8} y={6} width={40} height={36} rx={4} /><Rect x={189} y={68} width={88} height={70} rx={4} /></G>
      <Rect x={203} y={78} width={34} height={26} rx={3} fill={cores.ciano} opacity={0.35} stroke={cores.cianoEscuro} strokeWidth={2} />
      <G transform="translate(220 92)">
        <Circle r={20} fill={cores.ciano} opacity={0.18} />
        <Path d="M0 -4c-9-10-13-16-13-22a13 13 0 0 1 26 0c0 6-4 12-13 22z" fill={cores.azulNoite} />
        <Circle cy={-26} r={5} fill={cores.ciano} />
      </G>
    </Svg>
  );
}

const estilos = StyleSheet.create({
  galeria: { backgroundColor: cores.azulNoite, overflow: 'hidden' },
  semFoto: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.azulMarinho },
  sombraLegenda: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 130, backgroundColor: 'rgba(0,13,56,0.45)' },
  legenda: { position: 'absolute', left: 20, right: 20, bottom: 44 },
  pontos: { position: 'absolute', bottom: 30, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  ponto: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.5)' },
  pontoAtivo: { width: 20, backgroundColor: '#FFFFFF' },
  fichas: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: -22 },
  ficha: { flex: 1, padding: 14 },
});
