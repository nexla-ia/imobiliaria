import { Tabs } from 'expo-router/js-tabs';
import { Icone, type NomeIcone } from '@/components/ui';
import { cores, fontes } from '@/tema';

const abas: Array<{ nome: string; titulo: string; icone: NomeIcone; iconeAtivo: NomeIcone }> = [
  { nome: 'index', titulo: 'Início', icone: 'home-outline', iconeAtivo: 'home' },
  { nome: 'parcelas', titulo: 'Parcelas', icone: 'list-outline', iconeAtivo: 'list' },
  { nome: 'imovel', titulo: 'Imóvel', icone: 'location-outline', iconeAtivo: 'location' },
  { nome: 'documentos', titulo: 'Documentos', icone: 'document-text-outline', iconeAtivo: 'document-text' },
  { nome: 'perfil', titulo: 'Perfil', icone: 'person-outline', iconeAtivo: 'person' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: cores.azulNoite,
        tabBarInactiveTintColor: '#6B7699',
        // 12px cabe "Documentos" inteiro em 5 abas num celular de 360dp
        tabBarLabelStyle: { fontFamily: fontes.media, fontSize: 12, letterSpacing: -0.2 },
        tabBarItemStyle: { paddingHorizontal: 0 },
        tabBarAllowFontScaling: false,
        tabBarStyle: { backgroundColor: '#FFFFFF', borderTopColor: cores.linha, minHeight: 64, paddingTop: 6 },
        sceneStyle: { backgroundColor: cores.fundo },
      }}
    >
      {abas.map((a) => (
        <Tabs.Screen
          key={a.nome}
          name={a.nome}
          options={{
            title: a.titulo,
            tabBarIcon: ({ focused, size }) => (
              <Icone nome={focused ? a.iconeAtivo : a.icone} tamanho={size} cor={focused ? cores.cianoEscuro : '#6B7699'} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
