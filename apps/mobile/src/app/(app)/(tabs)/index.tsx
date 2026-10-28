import { diasAte, formatarData, formatarMoeda, type Cobranca } from '@planejar/shared';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Ondas } from '@/components/Ondas';
import { Texto } from '@/components/Texto';
import { Topo } from '@/components/Topo';
import { BarraProgresso, Botao, Cartao, Carregando, ErroCarga, Icone, SecaoTitulo, Vazio, type NomeIcone } from '@/components/ui';
import { useNotificacoes } from '@/lib/dados';
import { linkAtendimento, proximaParcela, useImovelAtual } from '@/lib/imovel-atual';
import { useComprador } from '@/lib/sessao';
import { cores, raio } from '@/tema';

function quando(vencimento: string): string {
  const n = diasAte(vencimento);
  if (n === 0) return 'vence hoje';
  if (n === 1) return 'vence amanhã';
  if (n > 1) return `faltam ${n} dias`;
  return `há ${-n} dia${n === -1 ? '' : 's'}`;
}

function abrirPagamento(c: Cobranca, forma: 'boleto' | 'pix') {
  router.push({ pathname: '/cobranca/[id]', params: { id: c.id, forma } });
}

export default function Inicio() {
  const { comprador, empresa } = useComprador();
  const { lista, contrato, parcelas, escolher, carregando, erro, recarregar, contratos } = useImovelAtual();
  const notificacoes = useNotificacoes();
  const naoLidas = (notificacoes.data ?? []).filter((n) => !n.lida_em).length;
  const ultimoComunicado = (notificacoes.data ?? []).find((n) => n.tipo === 'comunicado');
  const primeiroNome = comprador.nome.split(' ')[0];

  const pagas = parcelas.filter((p) => p.status_app === 'paga');
  const resumo = contrato?.resumo;
  const total = resumo?.total_parcelas ?? parcelas.length;
  const proxima = proximaParcela(parcelas);
  const depois = proxima ? proximaParcela(parcelas.filter((p) => p.id !== proxima.id && p.status_app === 'em_aberto')) : null;
  const whats = linkAtendimento(empresa, comprador, contrato?.imoveis.identificacao);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: cores.fundo }}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={contratos.isRefetching} onRefresh={() => { recarregar(); notificacoes.refetch(); }} tintColor={cores.ciano} />}
    >
      <Topo
        style={{ paddingBottom: lista.length > 1 ? 44 : 48 }}
        esquerda={
          <View style={estilos.avatar}>
            <Image source={require('@/assets/images/simbolo-branco.png')} style={{ width: 30, height: 30 }} />
          </View>
        }
        titulo={`Olá, ${primeiroNome}`}
        subtitulo="Que bom ver você por aqui"
        direita={
          <Pressable
            onPress={() => router.push('/notificacoes')}
            accessibilityRole="button"
            accessibilityLabel={naoLidas ? `Notificações, ${naoLidas} não lidas` : 'Notificações'}
            style={estilos.sino}
          >
            <Icone nome="notifications-outline" cor="#FFFFFF" />
            {naoLidas > 0 && (
              <View style={estilos.badge}>
                <Texto peso="extra" tamanho={12} cor={cores.azulNoite} style={{ lineHeight: 16 }}>{naoLidas > 9 ? '9+' : naoLidas}</Texto>
              </View>
            )}
          </Pressable>
        }
      >
        {lista.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 18 }}>
            {lista.map((c) => {
              const ativo = c.id === contrato?.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => escolher(c.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: ativo }}
                  style={[estilos.chip, ativo && estilos.chipAtivo]}
                >
                  <Texto peso="semi" tamanho={15} cor={ativo ? cores.azulNoite : '#DCE6FF'}>{c.imoveis.identificacao}</Texto>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </Topo>

      <View style={estilos.corpo}>
        {carregando ? (
          <Cartao style={{ height: 160 }}><Carregando /></Cartao>
        ) : erro ? (
          <Cartao><ErroCarga aoTentar={recarregar} /></Cartao>
        ) : !contrato ? (
          <Cartao>
            <Vazio
              icone="home-outline"
              titulo="Nenhum imóvel vinculado ainda"
              texto="Assim que a imobiliária vincular seu contrato, suas parcelas aparecem aqui."
              acao={whats ? <Botao titulo="Falar com a imobiliária" icone="logo-whatsapp" variante="whatsapp" aoTocar={() => Linking.openURL(whats)} /> : null}
            />
          </Cartao>
        ) : (
          <>
            <Cartao aoTocar={() => router.navigate('/imovel')} rotulo={`Ver meu imóvel: ${contrato.imoveis.identificacao}`} style={estilos.imovel}>
              <View style={estilos.thumb}>
                <Image source={require('@/assets/images/simbolo-branco.png')} style={{ width: 38, height: 38 }} />
              </View>
              <View style={{ flex: 1 }}>
                <Texto peso="negrito" tamanho={18}>{contrato.imoveis.identificacao}</Texto>
                <Texto cor={cores.textoSuave} tamanho={15} numberOfLines={1}>{contrato.imoveis.empreendimentos?.nome ?? ''}</Texto>
              </View>
              <Icone nome="chevron-forward" cor={cores.textoSuave} />
            </Cartao>

            <Cartao style={estilos.progresso}>
              <View style={estilos.linhaEntre}>
                <Texto peso="negrito" tamanho={19}>{pagas.length} de {total} parcelas pagas</Texto>
                <Texto peso="extra" tamanho={18} cor={cores.cianoEscuro}>{total ? Math.round((pagas.length / total) * 100) : 0}%</Texto>
              </View>
              <BarraProgresso valor={pagas.length} total={total} />
              <View style={estilos.miniStats}>
                <View style={estilos.mini}>
                  <Texto tamanho={14} cor={cores.textoSuave}>Total pago</Texto>
                  <Texto peso="negrito" tamanho={17}>{formatarMoeda(Number(resumo?.total_pago ?? 0))}</Texto>
                </View>
                <View style={estilos.mini}>
                  <Texto tamanho={14} cor={cores.textoSuave}>Faltam</Texto>
                  <Texto peso="negrito" tamanho={17}>{Math.max(0, total - pagas.length)} parcelas</Texto>
                </View>
              </View>
            </Cartao>

            {!proxima ? (
              <Cartao style={{ padding: 20, alignItems: 'center', marginTop: 12 }}>
                <Icone nome="checkmark-circle" tamanho={36} cor={cores.sucesso} />
                <Texto peso="negrito" tamanho={18} style={{ marginTop: 8, textAlign: 'center' }}>
                  {contrato.status === 'quitado' ? 'Parabéns! Seu imóvel está quitado.' : 'Nenhuma parcela em aberto agora.'}
                </Texto>
              </Cartao>
            ) : (
              <CartaoProxima cobranca={proxima} total={total} />
            )}

            {proxima?.status_app === 'vencida' && depois && (
              <Cartao style={[estilos.imovel, { marginTop: 12 }]} aoTocar={() => abrirPagamento(depois, 'boleto')} rotulo="Ver próxima parcela">
                <View style={[estilos.num]}><Texto peso="extra">{depois.numero_parcela ?? '–'}</Texto></View>
                <View style={{ flex: 1 }}>
                  <Texto peso="negrito">Próxima parcela</Texto>
                  <Texto cor={cores.textoSuave} tamanho={15}>Vence em {formatarData(depois.vencimento)}</Texto>
                </View>
                <Texto peso="negrito">{formatarMoeda(depois.valor)}</Texto>
              </Cartao>
            )}
          </>
        )}

        <SecaoTitulo titulo="Atalhos" />
        <View style={estilos.atalhos}>
          <Atalho icone="list-outline" titulo="Minhas parcelas" aoTocar={() => router.navigate('/parcelas')} />
          <Atalho icone="location-outline" titulo="Meu imóvel" aoTocar={() => router.navigate('/imovel')} />
          <Atalho icone="document-text-outline" titulo="Documentos" aoTocar={() => router.navigate('/documentos')} />
          {whats && <Atalho icone="logo-whatsapp" titulo="Fale com a imobiliária" whatsapp aoTocar={() => Linking.openURL(whats).catch(() => {})} />}
        </View>

        {ultimoComunicado && (
          <>
            <SecaoTitulo
              titulo="Comunicado"
              acao={<Pressable onPress={() => router.push('/notificacoes')} hitSlop={8}><Texto peso="semi" cor={cores.cianoEscuro}>Ver todos</Texto></Pressable>}
            />
            <Cartao style={estilos.comunicado}>
              <View style={[estilos.icoBg, { backgroundColor: cores.comunicadoBg }]}><Icone nome="megaphone-outline" cor={cores.comunicado} /></View>
              <View style={{ flex: 1 }}>
                <Texto peso="negrito">{ultimoComunicado.titulo}</Texto>
                <Texto cor={cores.textoSuave} tamanho={15}>{ultimoComunicado.corpo}</Texto>
              </View>
            </Cartao>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function CartaoProxima({ cobranca, total }: { cobranca: Cobranca; total: number }) {
  const vencida = cobranca.status_app === 'vencida';
  const juros = vencida && cobranca.valor_juros && cobranca.valor_juros > 0 ? cobranca.valor_juros : null;
  return (
    <View style={[estilos.proxima, vencida && { backgroundColor: '#2A0B26' }]}>
      <Ondas variante="cartao" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icone nome={vencida ? 'alert-circle-outline' : 'calendar-outline'} tamanho={20} cor={vencida ? '#FFB3C0' : cores.textoClaro} />
        <Texto peso="semi" tamanho={15} cor={vencida ? '#FFB3C0' : cores.textoClaro}>
          {vencida ? 'Parcela vencida' : 'Próxima parcela'}
          {cobranca.numero_parcela ? ` · ${cobranca.numero_parcela}/${total}` : ''}
        </Texto>
      </View>
      <Texto peso="extra" tamanho={38} cor="#FFFFFF" style={{ marginTop: 6, lineHeight: 46 }}>
        {formatarMoeda(cobranca.valor)}
      </Texto>
      <Texto cor="#DCE6FF">
        {vencida ? 'Venceu' : 'Vence'} em {formatarData(cobranca.vencimento)} · {quando(cobranca.vencimento)}
      </Texto>
      {vencida && (
        <View style={estilos.aviso}>
          <Texto tamanho={15} cor="#F3D7DE">
            {juros
              ? `Mais ${formatarMoeda(juros)} de juros e multa. O valor final aparece no boleto e no Pix.`
              : 'Juros e multa entram no valor final do boleto e do Pix.'}
          </Texto>
        </View>
      )}
      <View style={estilos.acoes}>
        <Botao titulo="Boleto" icone="barcode-outline" variante="contorno" style={{ flex: 1 }} aoTocar={() => abrirPagamento(cobranca, 'boleto')} />
        <Botao titulo="Pix" icone="qr-code-outline" variante="ciano" style={{ flex: 1 }} aoTocar={() => abrirPagamento(cobranca, 'pix')} />
      </View>
    </View>
  );
}

function Atalho({ icone, titulo, aoTocar, whatsapp }: { icone: NomeIcone; titulo: string; aoTocar: () => void; whatsapp?: boolean }) {
  return (
    <Cartao aoTocar={aoTocar} rotulo={titulo} style={estilos.atalho}>
      <View style={[estilos.icoBg, { backgroundColor: whatsapp ? '#E2F8EA' : '#E6F4FB' }]}>
        <Icone nome={icone} cor={whatsapp ? '#128C4A' : cores.cianoEscuro} />
      </View>
      <Texto peso="negrito">{titulo}</Texto>
    </Cartao>
  );
}

const estilos = StyleSheet.create({
  avatar: {
    width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  sino: {
    width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  badge: {
    position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9,
    backgroundColor: cores.ciano, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: cores.azulNoite,
  },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  chipAtivo: { backgroundColor: cores.ciano, borderColor: cores.ciano },
  corpo: { paddingHorizontal: 16, marginTop: -28 },
  imovel: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12 },
  thumb: { width: 64, height: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.cianoEscuro },
  progresso: { padding: 18, marginTop: 12, gap: 10 },
  linhaEntre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  miniStats: { flexDirection: 'row', gap: 10, marginTop: 4 },
  mini: { flex: 1, backgroundColor: cores.fundo, borderRadius: 12, padding: 10 },
  proxima: { marginTop: 12, padding: 20, borderRadius: raio.g, backgroundColor: cores.azulMarinho, overflow: 'hidden' },
  aviso: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)' },
  acoes: { flexDirection: 'row', gap: 10, marginTop: 18 },
  num: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.fundo },
  atalhos: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  atalho: { flexBasis: '47%', flexGrow: 1, padding: 16, gap: 10, minHeight: 104 },
  icoBg: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  comunicado: { flexDirection: 'row', gap: 12, padding: 16, alignItems: 'flex-start' },
});
