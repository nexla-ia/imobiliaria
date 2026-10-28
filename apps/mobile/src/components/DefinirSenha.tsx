import { linkWhatsapp, marca, SENHA_MINIMA, type DefinirSenhaReq } from '@planejar/shared';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chamar, ErroDaApi, mensagemDeErro } from '@/lib/api';
import { useSessao } from '@/lib/sessao';
import { cores } from '@/tema';
import { CampoEscuro } from './CampoEscuro';
import { Ondas } from './Ondas';
import { Texto } from './Texto';
import { Botao, LinkTexto } from './ui';

const URL_TERMOS = process.env.EXPO_PUBLIC_URL_TERMOS;
const URL_PRIVACIDADE = process.env.EXPO_PUBLIC_URL_PRIVACIDADE;
const abrir = (url: string | undefined) => url && Linking.openURL(url).catch(() => {});

/**
 * Primeiro acesso com a senha provisória enviada pela imobiliária: o comprador cria a
 * própria senha (e aceita os termos). Até isso, o servidor não libera os dados dele.
 */
export function DefinirSenha() {
  const insets = useSafeAreaInsets();
  const { comprador, empresa, recarregar, sair } = useSessao();
  const [senha, setSenha] = useState('');
  const [repetir, setRepetir] = useState('');
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const pedirAceite = !comprador?.termos_aceitos_em;
  const expirou = !!comprador?.senha_provisoria_expira_em && new Date(comprador.senha_provisoria_expira_em) < new Date();
  const whatsapp = empresa?.whatsapp_atendimento ?? marca.whatsapp;
  const primeiroNome = comprador?.nome.split(' ')[0] ?? '';

  async function salvar() {
    if (senha.length < SENHA_MINIMA) return setErro(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
    if (senha !== repetir) return setErro('As duas senhas não são iguais.');
    if (pedirAceite && !aceite) return setErro('Para continuar, aceite os Termos de uso e a Política de privacidade.');
    setErro(null);
    setSalvando(true);
    try {
      await chamar('conta-definir-senha', { senha, aceitou_termos: aceite } satisfies DefinirSenhaReq);
      await recarregar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  const pedirNova = () =>
    Linking.openURL(
      linkWhatsapp(whatsapp, `Olá! Sou ${comprador?.nome ?? ''} e minha senha provisória do app expirou. Pode me enviar uma nova?`),
    ).catch(() => {});

  return (
    <KeyboardAvoidingView style={estilos.tela} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Ondas variante="login" />
      <ScrollView
        contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Texto peso="extraItalico" tamanho={30} cor="#FFFFFF" accessibilityRole="header">
          {expirou ? 'SENHA ' : 'CRIE SUA '}
          <Texto peso="extraItalico" tamanho={30} cor={cores.ciano}>{expirou ? 'EXPIRADA' : 'SENHA'}</Texto>
        </Texto>

        {expirou ? (
          <>
            <Texto cor="#B9C6EA" style={{ marginTop: 10 }}>
              A senha provisória que a imobiliária enviou já venceu. Peça uma nova pelo WhatsApp; ela chega em instantes.
            </Texto>
            <Botao titulo="Pedir nova senha" icone="logo-whatsapp" variante="ciano" style={{ marginTop: 24 }} aoTocar={pedirNova} />
          </>
        ) : (
          <>
            <Texto cor="#B9C6EA" style={{ marginTop: 10 }}>
              Olá, {primeiroNome}! Você entrou com a senha provisória. Agora crie uma senha só sua para os próximos acessos.
            </Texto>
            <CampoEscuro rotulo="Nova senha" value={senha} onChangeText={setSenha} secureTextEntry placeholder={`Mínimo de ${SENHA_MINIMA} caracteres`} autoComplete="new-password" textContentType="newPassword" />
            <CampoEscuro rotulo="Repita a senha" value={repetir} onChangeText={setRepetir} secureTextEntry placeholder="Digite de novo" autoComplete="new-password" textContentType="newPassword" />
            {pedirAceite && (
              <View style={estilos.aceite}>
                <Switch
                  value={aceite}
                  onValueChange={setAceite}
                  trackColor={{ true: cores.ciano, false: '#2A3560' }}
                  thumbColor="#FFFFFF"
                  accessibilityLabel="Aceito os Termos de uso e a Política de privacidade"
                />
                <Texto cor="#C9D4F2" style={{ flex: 1 }}>
                  Li e aceito os{' '}
                  <Texto cor={cores.ciano} peso="semi" onPress={() => abrir(URL_TERMOS)}>Termos de uso</Texto> e a{' '}
                  <Texto cor={cores.ciano} peso="semi" onPress={() => abrir(URL_PRIVACIDADE)}>Política de privacidade</Texto>.
                </Texto>
              </View>
            )}
            {erro ? <Texto tamanho={15} cor="#FFB3C0" style={{ marginTop: 10 }}>{erro}</Texto> : null}
            <Botao titulo="Salvar e entrar" variante="ciano" aoTocar={salvar} carregando={salvando} style={{ marginTop: 22 }} />
          </>
        )}
        <View style={{ alignItems: 'center', marginTop: 8 }}>
          <LinkTexto titulo="Sair" cor={cores.ciano} aoTocar={sair} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.azulNoite },
  conteudo: { flexGrow: 1, paddingHorizontal: 24 },
  aceite: { flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 20 },
});
