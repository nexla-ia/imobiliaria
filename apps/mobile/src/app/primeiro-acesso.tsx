import {
  cpfValido,
  linkWhatsapp,
  marca,
  SENHA_MINIMA,
  somenteDigitos,
  type SolicitarCodigoRes,
  type ValidarCodigoRes,
} from '@planejar/shared';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CampoEscuro, mascaraCpf } from '@/components/CampoEscuro';
import { Ondas } from '@/components/Ondas';
import { Texto } from '@/components/Texto';
import { Botao, Icone, LinkTexto } from '@/components/ui';
import { chamar, ErroDaApi, mensagemDeErro } from '@/lib/api';
import { useSessao } from '@/lib/sessao';
import { EMPRESA_SLUG } from '@/lib/supabase';
import { cores, fontes } from '@/tema';

type Passo = 1 | 2 | 3;

// URLs públicas exigidas pelas lojas; definidas no .env do app quando os textos forem aprovados.
const URL_TERMOS = process.env.EXPO_PUBLIC_URL_TERMOS;
const URL_PRIVACIDADE = process.env.EXPO_PUBLIC_URL_PRIVACIDADE;
const abrir = (url: string | undefined) => url && Linking.openURL(url).catch(() => {});

export default function PrimeiroAcesso() {
  const insets = useSafeAreaInsets();
  const { modo } = useLocalSearchParams<{ modo?: 'primeiro' | 'esqueci' }>();
  const recuperar = modo === 'esqueci';
  const { entrarComEmail } = useSessao();

  const [passo, setPasso] = useState<Passo>(1);
  const [cpf, setCpf] = useState('');
  const [codigo, setCodigo] = useState('');
  const [senha, setSenha] = useState('');
  const [repetir, setRepetir] = useState('');
  const [aceite, setAceite] = useState(false);
  const [pedirAceite, setPedirAceite] = useState(!recuperar);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [manual, setManual] = useState(false);
  const campoCodigo = useRef<ComponentRef<typeof TextInput>>(null);

  async function pedirCodigo(canal?: 'email') {
    if (!cpfValido(somenteDigitos(cpf))) return setErro('Confira o CPF digitado.');
    setErro(null);
    setEnviando(true);
    try {
      const r = await chamar<SolicitarCodigoRes>('auth-solicitar-codigo', {
        empresa: EMPRESA_SLUG,
        cpf: somenteDigitos(cpf),
        finalidade: recuperar ? 'recuperar_senha' : 'primeiro_acesso',
        canal,
      });
      // sem WhatsApp/e-mail automático neste ambiente: a senha provisória vem da imobiliária
      if (!r.automatico) {
        setManual(true);
        return;
      }
      setAviso(canal === 'email' ? 'Se houver e-mail cadastrado, o código chega lá em instantes.' : null);
      setCodigo('');
      setPasso(2);
      setTimeout(() => campoCodigo.current?.focus(), 300);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  function confirmarCodigo() {
    if (codigo.length !== 6) return setErro('Digite os 6 números do código.');
    setErro(null);
    setPasso(3);
  }

  async function salvar() {
    if (senha.length < SENHA_MINIMA) return setErro(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
    if (senha !== repetir) return setErro('As duas senhas não são iguais.');
    if (pedirAceite && !aceite) return setErro('Para continuar, aceite os Termos de uso e a Política de privacidade.');
    setErro(null);
    setEnviando(true);
    try {
      const r = await chamar<ValidarCodigoRes>('auth-validar-codigo', {
        empresa: EMPRESA_SLUG,
        cpf: somenteDigitos(cpf),
        codigo,
        senha,
        aceitou_termos: aceite,
      });
      const falha = await entrarComEmail(r.email_login, senha);
      if (falha) setErro(falha);
      // com a sessão criada, o guard do layout leva para o Início
    } catch (e) {
      if (e instanceof ErroDaApi) {
        if (e.codigo === 'termos_obrigatorios') setPedirAceite(true);
        if (e.codigo === 'codigo_invalido' || e.codigo === 'codigo_expirado' || e.codigo === 'muitas_tentativas') {
          setPasso(e.codigo === 'codigo_invalido' ? 2 : 1);
        }
      }
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={estilos.tela} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Ondas variante="login" />
      <ScrollView
        contentContainerStyle={[estilos.conteudo, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() => (manual ? setManual(false) : passo === 1 ? router.back() : setPasso((p) => (p - 1) as Passo))}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          style={estilos.voltar}
        >
          <Icone nome="chevron-back" cor="#FFFFFF" />
        </Pressable>
        <View style={estilos.passos} accessibilityLabel={`Passo ${passo} de 3`}>
          {[1, 2, 3].map((n) => <View key={n} style={[estilos.passo, n <= passo && { backgroundColor: cores.ciano }]} />)}
        </View>

        {manual && (
          <>
            <Titulo a="Peça sua" b="senha" />
            <Texto cor="#B9C6EA" style={{ marginTop: 8 }}>
              Para entrar, use seu CPF e a senha provisória que a imobiliária envia pelo WhatsApp. Ainda não recebeu ou esqueceu a senha? Peça
              aqui que a equipe manda em instantes.
            </Texto>
            <Botao
              titulo="Pedir senha pelo WhatsApp"
              icone="logo-whatsapp"
              variante="ciano"
              style={{ marginTop: 22 }}
              aoTocar={() =>
                Linking.openURL(
                  linkWhatsapp(
                    marca.whatsapp,
                    `Olá! Sou o(a) titular do CPF ${cpf} e ${recuperar ? 'esqueci minha senha do app' : 'quero a senha provisória para acessar o app'}.`,
                  ),
                ).catch(() => {})
              }
            />
            <Botao titulo="Já tenho a senha · Entrar" variante="contorno" style={{ marginTop: 12 }} aoTocar={() => router.back()} />
          </>
        )}

        {!manual && passo === 1 && (
          <>
            <Titulo a={recuperar ? 'Recuperar' : 'Primeiro'} b={recuperar ? 'senha' : 'acesso'} />
            <Texto cor="#B9C6EA" style={{ marginTop: 8 }}>
              Digite seu CPF. Vamos enviar um código de 6 números para o WhatsApp cadastrado na imobiliária.
            </Texto>
            <CampoEscuro
              rotulo="CPF"
              value={cpf}
              onChangeText={(t) => setCpf(mascaraCpf(t))}
              keyboardType="number-pad"
              placeholder="000.000.000-00"
              erro={erro}
              onSubmitEditing={() => pedirCodigo()}
            />
            <Botao titulo="Enviar código" variante="ciano" aoTocar={() => pedirCodigo()} carregando={enviando} style={{ marginTop: 22 }} />
          </>
        )}

        {!manual && passo === 2 && (
          <>
            <Titulo a="Digite o" b="código" />
            <Texto cor="#B9C6EA" style={{ marginTop: 8 }}>
              Se o CPF {cpf} estiver cadastrado, o código chega no WhatsApp em instantes. Ele vale por 10 minutos.
            </Texto>
            {aviso && <Texto cor={cores.ciano} style={{ marginTop: 8 }}>{aviso}</Texto>}
            <TextInput
              ref={campoCodigo}
              value={codigo}
              onChangeText={(t) => setCodigo(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={6}
              placeholder="••••••"
              placeholderTextColor="#5D6C9A"
              accessibilityLabel="Código de 6 números"
              maxFontSizeMultiplier={1.3}
              style={estilos.codigo}
              onSubmitEditing={confirmarCodigo}
            />
            {erro ? <Texto tamanho={15} cor="#FFB3C0" style={{ marginTop: 6 }}>{erro}</Texto> : null}
            <Botao titulo="Continuar" variante="ciano" aoTocar={confirmarCodigo} style={{ marginTop: 22 }} />
            <LinkTexto titulo="Não recebi · enviar de novo" cor={cores.ciano} aoTocar={() => pedirCodigo()} />
            <LinkTexto titulo="Receber por e-mail" cor={cores.ciano} aoTocar={() => pedirCodigo('email')} />
          </>
        )}

        {!manual && passo === 3 && (
          <>
            <Titulo a="Crie sua" b="senha" />
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
            <Botao titulo="Salvar e entrar" variante="ciano" aoTocar={salvar} carregando={enviando} style={{ marginTop: 22 }} />
          </>
        )}

        <Texto tamanho={14} cor="#6F7FAE" style={estilos.nexla}>Desenvolvido por Nexla</Texto>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Titulo({ a, b }: { a: string; b: string }) {
  return (
    <Texto peso="extraItalico" tamanho={30} cor="#FFFFFF" accessibilityRole="header">
      {a.toUpperCase()} <Texto peso="extraItalico" tamanho={30} cor={cores.ciano}>{b.toUpperCase()}</Texto>
    </Texto>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.azulNoite },
  conteudo: { flexGrow: 1, paddingHorizontal: 24 },
  voltar: {
    width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', marginBottom: 20,
  },
  passos: { flexDirection: 'row', gap: 6, marginBottom: 24 },
  passo: { flex: 1, height: 4, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.18)' },
  codigo: {
    marginTop: 20, height: 68, borderRadius: 16, textAlign: 'center', fontSize: 32, letterSpacing: 14,
    fontFamily: fontes.negrito, color: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)',
  },
  aceite: { flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 20 },
  nexla: { marginTop: 'auto', paddingTop: 28, textAlign: 'center' },
});
