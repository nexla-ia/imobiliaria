import { Text, type TextProps } from 'react-native';
import { cores, fontes } from '@/tema';

type Peso = keyof typeof fontes;

/**
 * Texto padrão do app: Saira, mínimo de 16px no corpo e respeitando o tamanho de
 * fonte do sistema (até 1,6×, para não quebrar os cartões).
 */
export function Texto({ peso = 'regular', tamanho = 16, cor = cores.texto, style, ...props }: TextProps & {
  peso?: Peso;
  tamanho?: number;
  cor?: string;
}) {
  return (
    <Text
      maxFontSizeMultiplier={1.6}
      {...props}
      style={[{ fontFamily: fontes[peso], fontSize: tamanho, lineHeight: Math.round(tamanho * 1.35), color: cor }, style]}
    />
  );
}
