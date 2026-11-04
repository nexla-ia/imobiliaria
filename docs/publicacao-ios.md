# Publicação na App Store (iOS)

Checklist para publicar o app do comprador na App Store. O código já está preparado (seção 1); o que falta depende de contas e dados da cliente (seções 2 e 3).

## 1. O que já está pronto no código (2026-11-04)

| Item | Onde |
|---|---|
| Bundle ID `br.com.planejarassessoria.comprador`, só iPhone (`supportsTablet: false`), retrato, idioma pt-BR | `apps/mobile/app.json` → `ios` |
| Criptografia: o app não usa criptografia própria (`usesNonExemptEncryption: false`), então não pede documentação de exportação | `app.json` |
| Push em modo produção (`aps-environment: production`) | plugin `expo-notifications`, `mode: "production"` |
| Manifesto de privacidade: UserDefaults, FileTimestamp, SystemBootTime, DiskSpace, com os motivos copiados dos `PrivacyInfo.xcprivacy` do React Native e dos pacotes Expo | `app.json` → `ios.privacyManifests` |
| Sem pedido de Face ID (o app não usa biometria) | plugin `expo-secure-store`, `faceIDPermission: false` |
| Ícone 1024×1024 sem transparência (a Apple recusa ícone com canal alfa) | `assets/images/icon.png` |
| Excluir conta dentro do app (regra 5.1.1(v) da Apple) | Perfil → Excluir minha conta |
| Login sem rede social, então "Entrar com a Apple" não é exigido (regra 4.8) | — |
| Preenchimento automático de senha e de código SMS/WhatsApp no iPhone | `textContentType` nos campos de login |
| Tela Boleto/Pix como modal padrão do iOS (o `formSheet` customizado nunca foi testado num iPhone) | `src/app/(app)/_layout.tsx` |
| Pacotes Expo na versão recomendada do SDK 58; `expo-doctor` 20/20; bundle iOS gerado sem erro | — |

Não deu para testar num iPhone a partir do Windows. O primeiro teste real é pelo **TestFlight** (seção 4) ou pelo **Expo Go num iPhone** (seção 5).

## 2. O que precisamos da cliente / da Nexla

1. **Conta Apple Developer como organização** (US$ 99/ano), com CNPJ e número **D-U-N-S** da Planejar. O D-U-N-S pode levar alguns dias.
2. **Acesso à conta**: convite para um e-mail da Nexla com papel **Admin** ou **App Manager** em App Store Connect → Usuários e acesso.
3. **Conta Expo/EAS** da Nexla para o projeto (gera o `extra.eas.projectId`, que o push exige).
4. **Nome do app na loja** (até 30 caracteres; o nome embaixo do ícone continua "Planejar") e subtítulo (até 30).
5. **URLs públicas**: política de privacidade, termos de uso e uma página de suporte (pode ser o WhatsApp de atendimento numa página simples).
6. **Conta de demonstração para a revisão da Apple** (seção 3.4). Sem ela o app é recusado, porque o revisor não consegue entrar.

## 3. App Store Connect: o que preencher

### 3.1 Dados do app

| Campo | Sugestão |
|---|---|
| Categoria principal | Finanças |
| Classificação etária | 4+ (sem conteúdo sensível) |
| Preço | Grátis |
| Disponibilidade | Brasil |
| SKU | `planejar-comprador` |

### 3.2 Privacidade do app ("rótulos nutricionais")

Nenhum dado é usado para **rastreamento** e não há anúncios nem SDK de análise. Todos os dados abaixo são **vinculados à identidade** do comprador e usados só para **funcionalidade do app**:

| Tipo na Apple | O que é |
|---|---|
| Informações de contato → Nome | nome do comprador |
| Informações de contato → Número de telefone | WhatsApp para o código de acesso |
| Informações de contato → E-mail | e-mail do cadastro no Asaas |
| Identificadores → ID do usuário | CPF (login) e ID da conta |
| Informações financeiras → Outras informações financeiras | parcelas, valores e situação dos pagamentos |
| Identificadores → ID do dispositivo | token de notificação push |

Não coletamos: localização, contatos, fotos, histórico de navegação, dados de saúde, diagnóstico ou dados de uso.

### 3.3 Pagamentos (regra 3.1 da Apple)

O app mostra boleto e Pix de **parcelas de imóveis**, um bem físico pago fora do app pelo banco do comprador. Isso não entra na compra dentro do app da Apple (regra 3.1.3(e), bens e serviços consumidos fora do app). Vale explicar nas notas para o revisor (abaixo).

### 3.4 Conta de demonstração e notas para o revisor

O revisor precisa de um CPF e uma senha que entrem e mostrem parcelas reais, com Boleto e Pix funcionando. Recomendação:

1. Criar no **Asaas de produção** um cliente de demonstração com o CPF de alguém da equipe (com autorização), com um parcelamento pequeno (ex.: 3× R$ 5,00 com vencimento distante) e **notificações do Asaas desligadas** para esse cliente.
2. No painel, importar esse CPF, vincular a um imóvel de exemplo e gerar a senha. Entrar uma vez pelo app e trocar a senha.
3. Informar CPF e senha em App Store Connect → Informações para revisão do app.
4. Se a Apple testar **Excluir minha conta**, a conta some: refazer os passos 2–3 antes de reenviar.

Texto sugerido para as notas (em inglês, idioma do revisor):

> This app is for existing buyers of Planejar Assessoria, a real estate agency in Brazil. Accounts are created by the agency (no public sign-up). Log in with the demo CPF and password provided. The app shows the buyer's property and installment payments; "Boleto" and "Pix" display bank payment slips for real estate installments, paid outside the app through the buyer's bank, so In-App Purchase does not apply (physical goods). Account deletion is available in Perfil > Excluir minha conta.

## 4. Build e envio (EAS)

Rodar em `apps/mobile`, depois de ter as contas da seção 2:

```bash
npx eas-cli@latest login
npx eas-cli@latest init                      # cria o projeto e grava extra.eas.projectId no app.json
npx eas-cli@latest env:create                # EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY,
                                             # EXPO_PUBLIC_EMPRESA_SLUG, EXPO_PUBLIC_URL_PRIVACIDADE, EXPO_PUBLIC_URL_TERMOS
                                             # (ambiente "production"; o .env local não sobe para o build)
npx eas-cli@latest build -p ios --profile production   # pede login da Apple e cria certificado, perfil e chave de push
npx eas-cli@latest submit -p ios --latest              # envia para o App Store Connect / TestFlight
```

Depois do envio:
- A Apple manda um e-mail em minutos se faltar algum motivo no manifesto de privacidade. Se vier, acrescentar em `ios.privacyManifests` e gerar outro build.
- Instalar pelo **TestFlight** (interno, sem revisão) e testar no iPhone: login, primeiro acesso com código no WhatsApp, Início, Parcelas, Boleto (abrir PDF, copiar linha), Pix (QR e copia e cola), Meu imóvel (Apple Maps), Documentos, notificação push, Fale com a imobiliária, trocar senha, sair, excluir conta (com uma conta descartável).
- **Capturas de tela**: tirar no iPhone pelo TestFlight. A loja exige o tamanho de 6,9" (1320×2868) ou 6,5" (1284×2778).

## 5. Teste rápido num iPhone antes das contas (opcional)

Com o app **Expo Go** (App Store) num iPhone com SDK 58:

```bash
cd apps/mobile
npx expo start --go --tunnel
```

Ler o QR Code com a câmera do iPhone. O push não funciona no Expo Go; o resto sim. Atenção: o app aponta para o banco de **produção**, então use só a conta de demonstração.
