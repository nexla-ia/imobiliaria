import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { cores, fontes } from '@/tema';
import { Texto } from './Texto';

/** Campo de formulário das telas escuras (login e primeiro acesso). */
export function CampoEscuro({ rotulo, erro, ...props }: TextInputProps & { rotulo: string; erro?: string | null }) {
  const [foco, setFoco] = useState(false);
  return (
    <View style={{ marginTop: 16 }}>
      <Texto peso="semi" cor="#DCE6FF" style={{ marginBottom: 6 }}>{rotulo}</Texto>
      <TextInput
        placeholderTextColor="#7D8DBA"
        maxFontSizeMultiplier={1.4}
        accessibilityLabel={rotulo}
        {...props}
        onFocus={(e) => { setFoco(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFoco(false); props.onBlur?.(e); }}
        style={[estilos.entrada, foco && estilos.foco, !!erro && { borderColor: '#FF8FA3' }, props.style]}
      />
      {erro ? <Texto tamanho={15} cor="#FFB3C0" style={{ marginTop: 6 }}>{erro}</Texto> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  entrada: {
    height: 56,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 18,
    fontFamily: fontes.media,
    color: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  foco: { borderColor: cores.ciano, backgroundColor: 'rgba(10,193,250,0.08)' },
});

/** "12345678900" → "123.456.789-00" enquanto digita. */
export function mascaraCpf(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
