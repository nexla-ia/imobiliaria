import { formatarData, formatarMoeda, type Documento } from '@planejar/shared';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Texto } from '@/components/Texto';
import { Topo } from '@/components/Topo';
import { Cartao, Carregando, ErroCarga, Icone, SecaoTitulo, Vazio } from '@/components/ui';
import { abrirDocumentoUrl, useDocumentos } from '@/lib/dados';
import { usePuxarParaAtualizar } from '@/lib/puxar';
import { useImovelAtual } from '@/lib/imovel-atual';
import { cores } from '@/tema';

const abrir = (url: string) => WebBrowser.openBrowserAsync(url, { toolbarColor: cores.azulNoite, controlsColor: cores.ciano }).catch(() => {});
const tipos: Record<Documento['tipo'], string> = { contrato: 'Contrato', aditivo: 'Aditivo', escritura: 'Escritura', outro: 'Documento' };

export default function Documentos() {
  const docs = useDocumentos();
  const puxar = usePuxarParaAtualizar(() => docs.refetch());
  const { contrato, parcelas } = useImovelAtual();
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // documentos gerais + os do imóvel escolhido
  const lista = (docs.data ?? []).filter((d) => !d.contrato_id || d.contrato_id === contrato?.id);
  const comprovantes = parcelas
    .filter((p) => p.status_app === 'paga' && p.comprovante_url)
    .sort((a, b) => (b.data_pagamento ?? '').localeCompare(a.data_pagamento ?? ''));
  const total = contrato?.resumo?.total_parcelas;

  async function abrirDocumento(d: Documento) {
    setErro(null);
    setAbrindo(d.id);
    try {
      await abrir(await abrirDocumentoUrl(d.storage_path));
    } catch {
      setErro('Não foi possível abrir o documento. Confira sua conexão.');
    } finally {
      setAbrindo(null);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: cores.fundo }}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={puxar.atualizando} onRefresh={puxar.aoPuxar} tintColor={cores.ciano} />}
    >
      <Topo titulo="Documentos" subtitulo={contrato?.imoveis.identificacao} />
      <View style={{ paddingHorizontal: 16 }}>
        <SecaoTitulo titulo="Enviados pela imobiliária" />
        {erro && <Texto cor={cores.erro} style={{ marginBottom: 8 }}>{erro}</Texto>}
        <Cartao style={{ overflow: 'hidden' }}>
          {docs.isLoading ? (
            <Carregando />
          ) : docs.error ? (
            <ErroCarga aoTentar={() => docs.refetch()} />
          ) : lista.length === 0 ? (
            <Vazio titulo="Nenhum documento ainda" texto="Quando a imobiliária enviar o contrato ou outros arquivos, eles aparecem aqui." />
          ) : (
            lista.map((d, n) => (
              <Linha
                key={d.id}
                ultima={n === lista.length - 1}
                titulo={d.titulo}
                sub={`${tipos[d.tipo]} · enviado em ${new Date(d.created_at).toLocaleDateString('pt-BR')}`}
                selo="PDF"
                carregando={abrindo === d.id}
                aoTocar={() => abrirDocumento(d)}
              />
            ))
          )}
        </Cartao>

        <SecaoTitulo titulo="Comprovantes de pagamento" />
        <Cartao style={{ overflow: 'hidden' }}>
          {comprovantes.length === 0 ? (
            <Vazio icone="receipt-outline" titulo="Nenhum comprovante ainda" />
          ) : (
            comprovantes.map((p, n) => (
              <Linha
                key={p.id}
                ultima={n === comprovantes.length - 1}
                titulo={`Parcela ${p.numero_parcela ?? '–'}${total ? ` de ${total}` : ''}`}
                sub={`Pago em ${p.data_pagamento ? formatarData(p.data_pagamento) : '—'} · ${formatarMoeda(p.valor)}`}
                comprovante
                aoTocar={() => abrir(p.comprovante_url!)}
              />
            ))
          )}
        </Cartao>
      </View>
    </ScrollView>
  );
}

function Linha({ titulo, sub, selo, comprovante, ultima, carregando, aoTocar }: {
  titulo: string;
  sub: string;
  selo?: string;
  comprovante?: boolean;
  ultima: boolean;
  carregando?: boolean;
  aoTocar: () => void;
}) {
  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="button"
      accessibilityLabel={`${titulo}, ${sub}`}
      style={({ pressed }) => [estilos.linha, ultima && { borderBottomWidth: 0 }, pressed && { backgroundColor: '#F7F9FC' }]}
    >
      <View style={[estilos.ico, comprovante && { backgroundColor: cores.okBg }]}>
        {comprovante ? <Icone nome="receipt-outline" cor={cores.sucesso} /> : <Texto peso="extra" tamanho={13} cor={cores.erro}>{selo}</Texto>}
      </View>
      <View style={{ flex: 1 }}>
        <Texto peso="negrito">{titulo}</Texto>
        <Texto tamanho={15} cor={cores.textoSuave}>{sub}</Texto>
      </View>
      {carregando ? <ActivityIndicator color={cores.cianoEscuro} /> : <Icone nome={comprovante ? 'open-outline' : 'download-outline'} cor="#9AA6C4" />}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderBottomWidth: 1, borderBottomColor: cores.linhaSuave },
  ico: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.erroBg },
});
