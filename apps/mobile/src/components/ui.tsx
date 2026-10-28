import { Ionicons } from '@react-native-vector-icons/ionicons';
import type { StatusApp } from '@planejar/shared';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { cores, raio, sombra } from '@/tema';
import { Texto } from './Texto';

export type NomeIcone = ComponentProps<typeof Ionicons>['name'];

export function Icone({ nome, tamanho = 22, cor = cores.texto }: { nome: NomeIcone; tamanho?: number; cor?: string }) {
  return <Ionicons name={nome} size={tamanho} color={cor} />;
}

export function Cartao({ children, style, aoTocar, rotulo }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  aoTocar?: () => void;
  rotulo?: string;
}) {
  if (!aoTocar) return <View style={[estilos.cartao, style]}>{children}</View>;
  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      style={({ pressed }) => [estilos.cartao, style, pressed && { opacity: 0.85 }]}
    >
      {children}
    </Pressable>
  );
}

type VarianteBotao = 'ciano' | 'contorno' | 'navy' | 'claro' | 'perigo' | 'whatsapp';

const estiloVariante: Record<VarianteBotao, { fundo: string; texto: string; borda?: string }> = {
  ciano: { fundo: cores.ciano, texto: cores.azulNoite },
  contorno: { fundo: 'transparent', texto: '#FFFFFF', borda: 'rgba(255,255,255,0.55)' },
  navy: { fundo: cores.azulNoite, texto: '#FFFFFF' },
  claro: { fundo: '#E8EEF8', texto: cores.azulNoite },
  perigo: { fundo: cores.erro, texto: '#FFFFFF' },
  whatsapp: { fundo: '#1F9E55', texto: '#FFFFFF' },
};

export function Botao({ titulo, aoTocar, variante = 'navy', icone, carregando, desabilitado, style }: {
  titulo: string;
  aoTocar: () => void;
  variante?: VarianteBotao;
  icone?: NomeIcone;
  carregando?: boolean;
  desabilitado?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const v = estiloVariante[variante];
  const inativo = desabilitado || carregando;
  return (
    <Pressable
      onPress={aoTocar}
      disabled={inativo}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inativo, busy: !!carregando }}
      style={({ pressed }) => [
        estilos.botao,
        { backgroundColor: v.fundo, borderColor: v.borda ?? v.fundo, borderWidth: v.borda ? 1.5 : 0 },
        variante === 'ciano' && estilos.brilho,
        (pressed || inativo) && { opacity: inativo ? 0.55 : 0.85 },
        style,
      ]}
    >
      {carregando ? (
        <ActivityIndicator color={v.texto} />
      ) : (
        <>
          {icone && <Icone nome={icone} cor={v.texto} tamanho={20} />}
          <Texto peso="negrito" tamanho={17} cor={v.texto}>{titulo}</Texto>
        </>
      )}
    </Pressable>
  );
}

export function LinkTexto({ titulo, aoTocar, cor = cores.cianoEscuro }: { titulo: string; aoTocar: () => void; cor?: string }) {
  return (
    <Pressable onPress={aoTocar} accessibilityRole="link" hitSlop={8} style={{ paddingVertical: 10 }}>
      <Texto peso="semi" cor={cor}>{titulo}</Texto>
    </Pressable>
  );
}

const pills: Record<Exclude<StatusApp, 'oculta'>, { fundo: string; texto: string; rotulo: string }> = {
  paga: { fundo: cores.okBg, texto: cores.sucesso, rotulo: 'Paga' },
  em_aberto: { fundo: cores.abertoBg, texto: cores.cianoEscuro, rotulo: 'Em aberto' },
  vencida: { fundo: cores.erroBg, texto: cores.erro, rotulo: 'Vencida' },
  estornada: { fundo: cores.alertaBg, texto: cores.alerta, rotulo: 'Estornada' },
};

export function PillStatus({ status }: { status: StatusApp }) {
  if (status === 'oculta') return null;
  const p = pills[status];
  return (
    <View style={[estilos.pill, { backgroundColor: p.fundo }]}>
      <Texto peso="negrito" tamanho={14} cor={p.texto}>{p.rotulo}</Texto>
    </View>
  );
}

export function BarraProgresso({ valor, total }: { valor: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (valor / total) * 100) : 0;
  return (
    <View
      style={estilos.barra}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: valor }}
      accessibilityLabel={`${valor} de ${total} parcelas pagas`}
    >
      <View style={[estilos.barraCheia, { width: `${pct}%` }]} />
    </View>
  );
}

export function Carregando({ escuro }: { escuro?: boolean }) {
  return (
    <View style={estilos.centro}>
      <ActivityIndicator size="large" color={escuro ? cores.ciano : cores.cianoEscuro} />
    </View>
  );
}

export function Vazio({ icone = 'file-tray-outline', titulo, texto, acao }: {
  icone?: NomeIcone;
  titulo: string;
  texto?: string;
  acao?: ReactNode;
}) {
  return (
    <View style={estilos.vazio}>
      <Icone nome={icone} tamanho={36} cor={cores.textoSuave} />
      <Texto peso="semi" tamanho={17} style={{ textAlign: 'center', marginTop: 10 }}>{titulo}</Texto>
      {texto && <Texto cor={cores.textoSuave} style={{ textAlign: 'center', marginTop: 4 }}>{texto}</Texto>}
      {acao && <View style={{ marginTop: 16, alignSelf: 'stretch' }}>{acao}</View>}
    </View>
  );
}

export function ErroCarga({ aoTentar }: { aoTentar: () => void }) {
  return (
    <Vazio
      icone="cloud-offline-outline"
      titulo="Não conseguimos carregar"
      texto="Confira sua conexão com a internet."
      acao={<Botao titulo="Tentar de novo" variante="claro" aoTocar={aoTentar} />}
    />
  );
}

export function SecaoTitulo({ titulo, acao }: { titulo: string; acao?: ReactNode }) {
  return (
    <View style={estilos.secao}>
      <Texto peso="negrito" tamanho={18} accessibilityRole="header">{titulo}</Texto>
      {acao}
    </View>
  );
}

export const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.cartao, borderRadius: raio.m + 2, ...sombra },
  botao: { minHeight: 52, borderRadius: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  brilho: { shadowColor: cores.ciano, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  pill: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 99, alignSelf: 'flex-end' },
  barra: { height: 12, borderRadius: 99, backgroundColor: '#E3E9F4', overflow: 'hidden' },
  barraCheia: { height: '100%', borderRadius: 99, backgroundColor: cores.ciano },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  vazio: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24 },
  secao: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 10, marginHorizontal: 4 },
});
