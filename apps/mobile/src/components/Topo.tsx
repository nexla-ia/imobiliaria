import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cores } from '@/tema';
import { Ondas } from './Ondas';
import { Texto } from './Texto';

/** Cabeçalho azul-noite com as ondas da marca, usado no topo das telas. */
export function Topo({ titulo, subtitulo, children, style, esquerda, direita }: {
  titulo?: string;
  subtitulo?: string | null;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  esquerda?: ReactNode;
  direita?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[estilos.topo, { paddingTop: insets.top + 14 }, style]}>
      <Ondas />
      {(titulo || esquerda || direita) && (
        <View style={estilos.linha}>
          {esquerda}
          <View style={{ flex: 1 }}>
            {titulo && <Texto peso="negrito" tamanho={24} cor="#FFFFFF" accessibilityRole="header">{titulo}</Texto>}
            {subtitulo ? <Texto cor={cores.textoClaro}>{subtitulo}</Texto> : null}
          </View>
          {direita}
        </View>
      )}
      {children}
    </View>
  );
}

const estilos = StyleSheet.create({
  topo: { backgroundColor: cores.azulNoite, paddingHorizontal: 20, paddingBottom: 24, overflow: 'hidden' },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
