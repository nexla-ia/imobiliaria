import { formatarData, formatarMoeda, podePagar, type BoletoRes, type PixRes } from '@planejar/shared';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Texto } from '@/components/Texto';
import { Botao, Carregando, Icone, PillStatus, Vazio } from '@/components/ui';
import { chamar, mensagemDeErro } from '@/lib/api';
import { useImovelAtual } from '@/lib/imovel-atual';
import { cores, fontes } from '@/tema';

type Forma = 'boleto' | 'pix';

const abrirNavegador = (url: string) =>
  WebBrowser.openBrowserAsync(url, { toolbarColor: cores.azulNoite, controlsColor: cores.ciano, dismissButtonStyle: 'close' });

export default function CobrancaDetalhe() {
  const { id, forma: formaInicial } = useLocalSearchParams<{ id: string; forma?: Forma }>();
  const insets = useSafeAreaInsets();
  const { cobrancas, lista } = useImovelAtual();
  const [forma, setForma] = useState<Forma>(formaInicial === 'pix' ? 'pix' : 'boleto');

  const c = cobrancas.data?.find((x) => x.id === id);
  if (cobrancas.isLoading) return <Carregando />;
  if (!c) return <Vazio titulo="Parcela não encontrada" texto="Ela pode ter sido cancelada pela imobiliária." />;

  const contrato = lista.find((k) => k.id === c.contrato_id);
  const total = contrato?.resumo?.total_parcelas;
  const titulo = c.contrato_id ? `Parcela ${c.numero_parcela ?? '–'}${total ? ` de ${total}` : ''}` : c.descricao || 'Cobrança';

  return (
    <ScrollView
      style={{ backgroundColor: '#FFFFFF' }}
      contentContainerStyle={{ padding: 20, paddingTop: Platform.OS === 'ios' ? 20 : insets.top + 16, paddingBottom: insets.bottom + 28 }}
    >
      <View style={estilos.cabecalho}>
        <View style={{ flex: 1 }}>
          <Texto peso="negrito" tamanho={22} accessibilityRole="header">{titulo}</Texto>
          <Texto cor={cores.textoSuave}>
            {c.status_app === 'paga' ? 'Paga' : c.status_app === 'vencida' ? `Venceu em ${formatarData(c.vencimento)}` : `Vence em ${formatarData(c.vencimento)}`}
            {contrato ? ` · ${contrato.imoveis.identificacao}` : ''}
          </Texto>
        </View>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Fechar" hitSlop={10} style={estilos.fechar}>
          <Icone nome="close" cor={cores.textoSuave} />
        </Pressable>
      </View>

      {podePagar(c.status_app) ? (
        <>
          <View style={estilos.seg} accessibilityRole="tablist">
            {(['boleto', 'pix'] as const).map((f) => (
              <Pressable
                key={f}
                onPress={() => setForma(f)}
                accessibilityRole="tab"
                accessibilityState={{ selected: forma === f }}
                style={[estilos.segBotao, forma === f && estilos.segAtivo]}
              >
                <Icone nome={f === 'boleto' ? 'barcode-outline' : 'qr-code-outline'} tamanho={20} cor={forma === f ? cores.azulNoite : cores.textoSuave} />
                <Texto peso="negrito" cor={forma === f ? cores.azulNoite : cores.textoSuave}>{f === 'boleto' ? 'Boleto' : 'Pix'}</Texto>
              </Pressable>
            ))}
          </View>
          <View style={estilos.valorBox}>
            <View>
              <Texto tamanho={14} cor={cores.textoSuave}>Valor da parcela</Texto>
              <Texto peso="negrito" tamanho={22}>{formatarMoeda(c.valor)}</Texto>
            </View>
            <PillStatus status={c.status_app} />
          </View>
          {c.status_app === 'vencida' && (
            <Texto tamanho={15} cor={cores.alerta} style={{ marginTop: 10 }}>
              {c.valor_juros && c.valor_juros > 0
                ? `Mais ${formatarMoeda(c.valor_juros)} de juros e multa, já incluídos no valor final do pagamento.`
                : 'Como a parcela venceu, juros e multa entram no valor final do pagamento.'}
            </Texto>
          )}
          {forma === 'boleto' ? <Boleto id={c.id} /> : <Pix id={c.id} />}
        </>
      ) : (
        <Detalhes
          valorPago={c.valor_original ?? c.valor}
          vencimento={c.vencimento}
          pagoEm={c.data_pagamento}
          forma={c.billing_type}
          comprovante={c.comprovante_url}
          estornada={c.status_app === 'estornada'}
        />
      )}
    </ScrollView>
  );
}

function useCopiar() {
  const [copiado, setCopiado] = useState(false);
  return {
    copiado,
    copiar: async (texto: string) => {
      await Clipboard.setStringAsync(texto);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    },
  };
}

function Boleto({ id }: { id: string }) {
  const { copiado, copiar } = useCopiar();
  const q = useQuery({
    queryKey: ['boleto', id],
    staleTime: 5 * 60_000,
    queryFn: () => chamar<BoletoRes>('asaas-boleto', { cobranca_id: id }),
  });
  if (q.isLoading) return <Buscando texto="Buscando o boleto atualizado…" />;
  if (q.error) return <FalhaBusca mensagem={mensagemDeErro(q.error)} aoTentar={() => q.refetch()} />;
  const b = q.data!;
  return (
    <View style={{ marginTop: 16, gap: 10 }}>
      {b.linha_digitavel ? (
        <>
          <Texto peso="semi">Linha digitável</Texto>
          <Texto selectable style={estilos.codigo} accessibilityLabel={`Linha digitável ${b.linha_digitavel}`}>{b.linha_digitavel}</Texto>
          <Botao
            titulo={copiado ? 'Copiado!' : 'Copiar código de barras'}
            icone={copiado ? 'checkmark' : 'copy-outline'}
            variante="navy"
            aoTocar={() => copiar(b.linha_digitavel!)}
          />
        </>
      ) : (
        <Texto cor={cores.textoSuave}>Esta cobrança não tem código de barras. Use o Pix ou abra a fatura.</Texto>
      )}
      {b.bank_slip_url && <Botao titulo="Abrir boleto em PDF" icone="download-outline" variante="claro" aoTocar={() => abrirNavegador(b.bank_slip_url!)} />}
      {b.invoice_url && <Botao titulo="Ver fatura completa" icone="open-outline" variante="claro" aoTocar={() => abrirNavegador(b.invoice_url!)} />}
      <Texto tamanho={14} cor={cores.textoSuave} style={{ textAlign: 'center' }}>
        O pagamento por boleto leva até 2 dias úteis para ser confirmado.
      </Texto>
    </View>
  );
}

function Pix({ id }: { id: string }) {
  const { copiado, copiar } = useCopiar();
  const q = useQuery({
    queryKey: ['pix', id],
    staleTime: 5 * 60_000,
    queryFn: () => chamar<PixRes>('asaas-pix', { cobranca_id: id }),
  });
  if (q.isLoading) return <Buscando texto="Gerando o Pix…" />;
  if (q.error) return <FalhaBusca mensagem={mensagemDeErro(q.error)} aoTentar={() => q.refetch()} />;
  const p = q.data!;
  return (
    <View style={{ marginTop: 16, gap: 10 }}>
      <View style={estilos.qrMoldura}>
        <Image
          source={{ uri: `data:image/png;base64,${p.qr_code_base64}` }}
          cachePolicy="none"
          contentFit="contain"
          style={{ width: 220, height: 220 }}
          accessibilityLabel="QR Code do Pix"
        />
      </View>
      {p.expira_em && <Texto tamanho={14} cor={cores.textoSuave} style={{ textAlign: 'center' }}>Válido até {formatarData(p.expira_em)}</Texto>}
      <Texto peso="semi">Pix copia e cola</Texto>
      <Texto selectable numberOfLines={3} style={[estilos.codigo, { fontSize: 13 }]}>{p.copia_e_cola}</Texto>
      <Botao
        titulo={copiado ? 'Copiado!' : 'Copiar Pix copia e cola'}
        icone={copiado ? 'checkmark' : 'copy-outline'}
        variante="ciano"
        aoTocar={() => copiar(p.copia_e_cola)}
      />
      <Texto tamanho={15} cor={cores.textoSuave} style={{ textAlign: 'center' }}>
        Abra o app do seu banco, escolha Pix copia e cola e cole o código. A confirmação chega aqui em instantes.
      </Texto>
    </View>
  );
}

function Detalhes({ valorPago, vencimento, pagoEm, forma, comprovante, estornada }: {
  valorPago: number;
  vencimento: string;
  pagoEm: string | null;
  forma: string | null;
  comprovante: string | null;
  estornada: boolean;
}) {
  const formas: Record<string, string> = { PIX: 'Pix', BOLETO: 'Boleto', CREDIT_CARD: 'Cartão', UNDEFINED: 'Boleto ou Pix' };
  return (
    <View style={{ marginTop: 18 }}>
      {estornada && (
        <View style={[estilos.valorBox, { backgroundColor: cores.alertaBg, marginBottom: 12 }]}>
          <Texto cor={cores.alerta} style={{ flex: 1 }}>Este pagamento foi estornado. Fale com a imobiliária se tiver dúvidas.</Texto>
        </View>
      )}
      {[
        ['Situação', estornada ? 'Estornada' : 'Paga'],
        ['Vencimento', formatarData(vencimento)],
        ['Pago em', pagoEm ? formatarData(pagoEm) : '—'],
        ['Valor pago', formatarMoeda(valorPago)],
        ['Forma', forma ? formas[forma] ?? forma : '—'],
      ].map(([r, v]) => (
        <View key={r} style={estilos.info}>
          <Texto cor={cores.textoSuave}>{r}</Texto>
          <Texto peso="negrito">{v}</Texto>
        </View>
      ))}
      {comprovante && (
        <Botao titulo="Ver comprovante" icone="receipt-outline" variante="navy" style={{ marginTop: 18 }} aoTocar={() => abrirNavegador(comprovante)} />
      )}
    </View>
  );
}

function Buscando({ texto }: { texto: string }) {
  return (
    <View style={{ paddingVertical: 36, alignItems: 'center', gap: 12 }}>
      <Carregando />
      <Texto cor={cores.textoSuave}>{texto}</Texto>
    </View>
  );
}

function FalhaBusca({ mensagem, aoTentar }: { mensagem: string; aoTentar: () => void }) {
  return (
    <View style={{ marginTop: 20, gap: 12 }}>
      <Texto cor={cores.erro}>{mensagem}</Texto>
      <Botao titulo="Tentar de novo" variante="claro" aoTocar={aoTentar} />
    </View>
  );
}

const estilos = StyleSheet.create({
  cabecalho: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  fechar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.fundo },
  seg: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: cores.fundo, marginTop: 18, marginBottom: 14 },
  segBotao: { flex: 1, minHeight: 46, borderRadius: 11, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  segAtivo: { backgroundColor: '#FFFFFF', shadowColor: '#000D38', shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
  valorBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 14, backgroundColor: cores.fundo },
  codigo: {
    padding: 14, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C6D0E3',
    fontFamily: fontes.media, fontSize: 16, color: cores.texto,
  },
  qrMoldura: { alignSelf: 'center', padding: 12, borderRadius: 18, borderWidth: 1, borderColor: cores.linha, backgroundColor: '#FFFFFF' },
  info: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: cores.linhaSuave },
});
