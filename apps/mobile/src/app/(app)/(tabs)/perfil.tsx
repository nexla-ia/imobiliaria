import { formatarCpf, formatarTelefone, marca, type ExcluirContaRes } from '@planejar/shared';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Texto } from '@/components/Texto';
import { Topo } from '@/components/Topo';
import { Cartao, Icone, SecaoTitulo, type NomeIcone } from '@/components/ui';
import { chamar, mensagemDeErro } from '@/lib/api';
import { linkAtendimento, useImovelAtual } from '@/lib/imovel-atual';
import { useComprador, useSessao } from '@/lib/sessao';
import { supabase } from '@/lib/supabase';
import { cores } from '@/tema';

export default function Perfil() {
  const { comprador, empresa } = useComprador();
  const { sair } = useSessao();
  const { lista, contrato } = useImovelAtual();
  const [excluindo, setExcluindo] = useState(false);
  const iniciais = comprador.nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const whats = linkAtendimento(empresa, comprador, contrato?.imoveis.identificacao);
  const termos = empresa.textos?.link_termos;
  const privacidade = empresa.textos?.link_privacidade;

  function confirmarSaida() {
    Alert.alert('Sair do app?', 'Você vai precisar do CPF e da senha para entrar de novo.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', onPress: sair },
    ]);
  }

  function confirmarExclusao() {
    Alert.alert(
      'Excluir sua conta?',
      'Seu acesso ao app e seus dados de uso são apagados. Seu contrato e suas parcelas continuam válidos com a imobiliária: excluir a conta não cancela a compra nem quita parcelas.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir conta',
          style: 'destructive',
          onPress: async () => {
            setExcluindo(true);
            try {
              await chamar<ExcluirContaRes>('conta-excluir');
              await supabase.auth.signOut();
            } catch (e) {
              Alert.alert('Não foi possível excluir', mensagemDeErro(e));
            } finally {
              setExcluindo(false);
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: cores.fundo }} contentContainerStyle={{ paddingBottom: 32 }}>
      <Topo>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={estilos.avatar}><Texto peso="extra" tamanho={26} cor={cores.azulNoite}>{iniciais}</Texto></View>
          <View style={{ flex: 1 }}>
            <Texto peso="negrito" tamanho={22} cor="#FFFFFF" accessibilityRole="header">{comprador.nome}</Texto>
            <Texto cor={cores.textoClaro}>CPF {formatarCpf(comprador.cpf)}</Texto>
          </View>
        </View>
      </Topo>

      <View style={{ paddingHorizontal: 16 }}>
        <SecaoTitulo titulo="Meus dados" />
        <Cartao style={{ paddingHorizontal: 16 }}>
          <Info rotulo="WhatsApp" valor={comprador.telefone ? formatarTelefone(comprador.telefone) : '—'} />
          <Info rotulo="E-mail" valor={comprador.email || '—'} />
          <Info rotulo="Imóveis" valor={String(lista.length)} ultima />
        </Cartao>
        <Texto tamanho={15} cor={cores.textoSuave} style={{ marginTop: 8, marginHorizontal: 4 }}>
          Para corrigir seus dados, fale com a imobiliária.
        </Texto>

        <SecaoTitulo titulo="Conta" />
        <Cartao style={{ overflow: 'hidden' }}>
          <Item icone="lock-closed-outline" titulo="Trocar senha" aoTocar={() => router.push('/trocar-senha')} />
          <Item icone="notifications-outline" titulo="Notificações" aoTocar={() => router.push('/notificacoes')} />
          {whats && <Item icone="logo-whatsapp" titulo="Fale com a imobiliária" aoTocar={() => Linking.openURL(whats).catch(() => {})} />}
          {termos && <Item icone="document-outline" titulo="Termos de uso" aoTocar={() => Linking.openURL(termos).catch(() => {})} />}
          {privacidade && <Item icone="shield-checkmark-outline" titulo="Política de privacidade" aoTocar={() => Linking.openURL(privacidade).catch(() => {})} />}
          <Item icone="log-out-outline" titulo="Sair" aoTocar={confirmarSaida} semSeta />
          <Item icone="trash-outline" titulo={excluindo ? 'Excluindo…' : 'Excluir minha conta'} perigo aoTocar={confirmarExclusao} semSeta ultima />
        </Cartao>

        <View style={estilos.assinatura}>
          <Image source={require('@/assets/images/simbolo-branco.png')} style={estilos.simbolo} tintColor={cores.azulNoite} />
          <Texto tamanho={14} cor={cores.textoSuave} style={{ textAlign: 'center' }}>
            {empresa.nome}{empresa.creci ? ` · ${empresa.creci}` : ` · ${marca.creci}`}
            {'\n'}Versão {Constants.expoConfig?.version ?? '1.0.0'} · Desenvolvido por Nexla
          </Texto>
        </View>
      </View>
    </ScrollView>
  );
}

function Info({ rotulo, valor, ultima }: { rotulo: string; valor: string; ultima?: boolean }) {
  return (
    <View style={[estilos.info, ultima && { borderBottomWidth: 0 }]}>
      <Texto cor={cores.textoSuave}>{rotulo}</Texto>
      <Texto peso="negrito" style={{ flexShrink: 1, textAlign: 'right' }}>{valor}</Texto>
    </View>
  );
}

function Item({ icone, titulo, aoTocar, perigo, semSeta, ultima }: {
  icone: NomeIcone;
  titulo: string;
  aoTocar: () => void;
  perigo?: boolean;
  semSeta?: boolean;
  ultima?: boolean;
}) {
  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="button"
      style={({ pressed }) => [estilos.item, ultima && { borderBottomWidth: 0 }, pressed && { backgroundColor: '#F7F9FC' }]}
    >
      <Icone nome={icone} cor={perigo ? cores.erro : cores.cianoEscuro} />
      <Texto peso="media" cor={perigo ? cores.erro : cores.texto} style={{ flex: 1 }}>{titulo}</Texto>
      {!semSeta && <Icone nome="chevron-forward" cor="#9AA6C4" tamanho={20} />}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  avatar: { width: 72, height: 72, borderRadius: 22, backgroundColor: cores.ciano, alignItems: 'center', justifyContent: 'center' },
  info: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: cores.linhaSuave },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderBottomWidth: 1, borderBottomColor: cores.linhaSuave },
  assinatura: { alignItems: 'center', gap: 8, marginTop: 28 },
  simbolo: { width: 36, height: 36 },
});
