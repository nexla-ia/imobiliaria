import { cpfValido, linkWhatsapp, marca, somenteDigitos } from '@planejar/shared';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CampoEscuro, mascaraCpf } from '@/components/CampoEscuro';
import { Ondas } from '@/components/Ondas';
import { Texto } from '@/components/Texto';
import { Botao, LinkTexto } from '@/components/ui';
import { useSessao } from '@/lib/sessao';
import { cores } from '@/tema';

export default function Entrar() {
  const insets = useSafeAreaInsets();
  const { entrar } = useSessao();
  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEntrar() {
    if (!cpfValido(somenteDigitos(cpf))) return setErro('Confira o CPF digitado.');
    if (!senha) return setErro('Digite sua senha.');
    setErro(null);
    setEnviando(true);
    const falha = await entrar(cpf, senha);
    if (falha) {
      setEnviando(false);
      setErro(falha);
    }
  }

  return (
    <KeyboardAvoidingView style={estilos.tela} behavior="padding">
      <Ondas variante="login" />
      <ScrollView
        contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Image source={require('@/assets/images/logo-branco.png')} style={estilos.logo} contentFit="contain" accessibilityLabel={marca.nome} />
        <Texto peso="extraItalico" tamanho={30} cor="#FFFFFF" accessibilityRole="header">
          ÁREA DO <Texto peso="extraItalico" tamanho={30} cor={cores.ciano}>COMPRADOR</Texto>
        </Texto>
        <Texto cor="#B9C6EA" style={{ marginTop: 8 }}>Suas parcelas, boletos e documentos na palma da mão.</Texto>

        <CampoEscuro
          rotulo="CPF"
          value={cpf}
          onChangeText={(t) => setCpf(mascaraCpf(t))}
          keyboardType="number-pad"
          placeholder="000.000.000-00"
          autoComplete="username"
          textContentType="username"
        />
        <CampoEscuro
          rotulo="Senha"
          value={senha}
          onChangeText={setSenha}
          secureTextEntry
          placeholder="Sua senha"
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={aoEntrar}
          returnKeyType="go"
          erro={erro}
        />
        <Texto tamanho={15} cor="#93A3CF" style={{ marginTop: 10 }}>
          Primeiro acesso? Use a senha provisória que a imobiliária enviou pelo WhatsApp.
        </Texto>
        <Botao titulo="Entrar" variante="ciano" aoTocar={aoEntrar} carregando={enviando} style={{ marginTop: 18 }} />

        <View style={estilos.links}>
          <LinkTexto titulo="Primeiro acesso" cor={cores.ciano} aoTocar={() => router.push({ pathname: '/primeiro-acesso', params: { modo: 'primeiro' } })} />
          <LinkTexto titulo="Esqueci a senha" cor={cores.ciano} aoTocar={() => router.push({ pathname: '/primeiro-acesso', params: { modo: 'esqueci' } })} />
        </View>

        <Botao
          titulo="Falar com a imobiliária"
          icone="logo-whatsapp"
          variante="contorno"
          style={{ marginTop: 12 }}
          aoTocar={() => Linking.openURL(linkWhatsapp(marca.whatsapp, 'Olá! Preciso de ajuda para acessar o app da imobiliária.')).catch(() => {})}
        />
        <Texto tamanho={14} cor="#6F7FAE" style={estilos.nexla}>Desenvolvido por Nexla</Texto>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.azulNoite },
  conteudo: { flexGrow: 1, paddingHorizontal: 24 },
  logo: { width: 230, height: 190, alignSelf: 'center', marginBottom: 24 },
  links: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  nexla: { marginTop: 'auto', paddingTop: 28, textAlign: 'center' },
});
