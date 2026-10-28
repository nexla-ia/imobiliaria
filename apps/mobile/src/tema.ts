import { marca } from '@planejar/shared';

export const cores = {
  ...marca.cores,
  fundo: '#F2F5FA',
  cartao: '#FFFFFF',
  linha: '#DFE5F0',
  linhaSuave: '#EDF1F7',
  textoClaro: '#AFC0EC',
  okBg: '#E3F5EC',
  // texto sobre os fundos claros das etiquetas, com contraste AA (>= 4,5:1)
  okTexto: '#0A6B3D',
  abertoTexto: '#00658F',
  alertaTexto: '#9A4508',
  alertaBg: '#FDF0E1',
  erroBg: '#FCE8EB',
  abertoBg: '#E4F3FB',
  comunicado: '#3446B8',
  comunicadoBg: '#EEF1FF',
  linhaOnda: '#4A5CFF',
} as const;

/** Faces da Saira carregadas no _layout raiz. */
export const fontes = {
  regular: 'Saira_400Regular',
  media: 'Saira_500Medium',
  semi: 'Saira_600SemiBold',
  negrito: 'Saira_700Bold',
  extra: 'Saira_800ExtraBold',
  extraItalico: 'Saira_800ExtraBold_Italic',
} as const;

export const raio = { p: 12, m: 16, g: 22 } as const;

export const sombra = {
  shadowColor: '#000D38',
  shadowOpacity: 0.08,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
} as const;
