import { emailDoComprador, SENHA_MINIMA } from '@planejar/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Texto } from '@/components/Texto';
import { Botao } from '@/components/ui';
import { useComprador } from '@/lib/sessao';
import { EMPRESA_SLUG, supabase } from '@/lib/supabase';
import { cores, fontes } from '@/tema';

export default function TrocarSenha() {
  const insets = useSafeAreaInsets();
  const { comprador } = useComprador();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repetir, setRepetir] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (nova.length < SENHA_MINIMA) return setErro(`A nova senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
    if (nova !== repetir) return setErro('As duas senhas novas não são iguais.');
    setErro(null);
    setSalvando(true);
    // confere a senha atual antes de trocar
    const { error: erroAtual } = await supabase.auth.signInWithPassword({ email: emailDoComprador(comprador.cpf, EMPRESA_SLUG), password: atual });
    if (erroAtual) {
      setSalvando(false);
      return setErro('A senha atual está incorreta.');
    }
    const { error } = await supabase.auth.updateUser({ password: nova });
    setSalvando(false);
    if (error) return setErro(/different/i.test(error.message) ? 'A nova senha precisa ser diferente da atual.' : 'Não foi possível trocar a senha agora.');
    Alert.alert('Senha alterada', 'Use a nova senha da próxima vez que entrar.');
    router.back();
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#FFFFFF' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: Platform.OS === 'ios' ? 24 : insets.top + 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Texto peso="negrito" tamanho={24} accessibilityRole="header">Trocar senha</Texto>
        <Texto cor={cores.textoSuave}>Use pelo menos {SENHA_MINIMA} caracteres. Esqueceu a atual? Saia do app e toque em "Esqueci a senha".</Texto>
        <Campo rotulo="Senha atual" valor={atual} aoMudar={setAtual} autoComplete="current-password" />
        <Campo rotulo="Nova senha" valor={nova} aoMudar={setNova} autoComplete="new-password" />
        <Campo rotulo="Repita a nova senha" valor={repetir} aoMudar={setRepetir} autoComplete="new-password" />
        {erro && <Texto cor={cores.erro}>{erro}</Texto>}
        <View style={{ gap: 10, marginTop: 6 }}>
          <Botao titulo="Salvar nova senha" variante="navy" aoTocar={salvar} carregando={salvando} />
          <Botao titulo="Cancelar" variante="claro" aoTocar={() => router.back()} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Campo({ rotulo, valor, aoMudar, autoComplete }: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
}) {
  return (
    <View style={{ gap: 6 }}>
      <Texto peso="semi">{rotulo}</Texto>
      <TextInput
        value={valor}
        onChangeText={aoMudar}
        secureTextEntry
        autoComplete={autoComplete}
        accessibilityLabel={rotulo}
        maxFontSizeMultiplier={1.4}
        style={estilos.entrada}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  entrada: {
    height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: cores.linha, paddingHorizontal: 14,
    fontSize: 17, fontFamily: fontes.media, color: cores.texto,
  },
});
