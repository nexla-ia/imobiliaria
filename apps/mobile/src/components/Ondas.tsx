import { StyleSheet } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { cores } from '@/tema';

/** Linhas finas em onda da arte da marca ("Atendimento Online"). Decorativo. */
export function Ondas({ variante = 'topo' }: { variante?: 'topo' | 'login' | 'cartao' }) {
  const altura = variante === 'login' ? 900 : 260;
  const qtd = variante === 'cartao' ? 16 : 26;
  const linhas = [];
  for (let i = 0; i < qtd; i++) {
    const destaque = i % (variante === 'login' ? 6 : 7) === 0;
    const cor = destaque ? cores.ciano : cores.linhaOnda;
    if (variante === 'login') {
      linhas.push(
        <Path key={`a${i}`} d={`M440 ${-20 + i * 6} C ${300 - i * 4} ${180 + i * 3}, ${120 + i * 6} ${260 + i * 9}, -40 ${520 + i * 7}`} stroke={cor} strokeOpacity={destaque ? 0.35 : 0.22} />,
        <Path key={`b${i}`} d={`M440 ${560 + i * 5} C 300 ${520 + i * 9}, 160 ${640 + i * 4}, -40 ${600 + i * 10}`} stroke={cores.linhaOnda} strokeOpacity={0.12 + (i / qtd) * 0.12} />,
      );
    } else {
      linhas.push(
        <Path key={i} d={`M430 ${-10 + i * 5} C ${320 - i * 3} ${60 + i * 4}, ${200 + i * 2} ${130 + i * 5}, -30 ${150 + i * 6}`} stroke={cor} strokeOpacity={variante === 'cartao' ? 0.14 : 0.2} />,
      );
    }
  }
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox={`0 0 400 ${altura}`} preserveAspectRatio="xMidYMid slice" pointerEvents="none">
      <G fill="none" strokeWidth={0.8}>{linhas}</G>
    </Svg>
  );
}
