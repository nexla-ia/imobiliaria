# Publicação na Google Play (Android)

Checklist para publicar o app do comprador na Google Play. A conta do Play Console é **pessoal** (sem D-U-N-S), então antes da produção é obrigatório um **teste fechado com pelo menos 12 testadores por 14 dias seguidos**.

## 1. O que já está pronto (2026-11-24)

| Item | Onde |
|---|---|
| Pacote `br.com.planejarassessoria.comprador`, ícone adaptativo, splash, retrato | `apps/mobile/app.json` |
| Projeto EAS `@nexlaia/planejar-comprador` e variáveis `EXPO_PUBLIC_*` (inclusive URLs de termos e privacidade) nos ambientes production, preview e development | expo.dev |
| Pacotes no SDK 58 recomendado; `expo-doctor` 20/20; bundle Android gerado sem erro | — |
| Política de privacidade, termos de uso e página de suporte com instruções de exclusão de conta | `apps/admin/public/` |
| Ícone da loja 512×512 e imagem de destaque 1024×500 | `docs/lojas/` |
| Exclusão de conta dentro do app | Perfil → Excluir minha conta |

**URLs públicas** (servidas pelo painel na Vercel):

| Uso | URL |
|---|---|
| Política de privacidade | https://imobiliaria-alpha-one.vercel.app/privacidade.html |
| Termos de uso | https://imobiliaria-alpha-one.vercel.app/termos.html |
| Suporte | https://imobiliaria-alpha-one.vercel.app/suporte.html |
| Exclusão de conta (exigida pelo Google) | https://imobiliaria-alpha-one.vercel.app/suporte.html#excluir-conta |

Os textos de privacidade e termos são um modelo escrito a partir do que o sistema faz com os dados. A Planejar precisa ler e aprovar. Dá para mudar o texto a qualquer hora sem gerar outro build, porque o app só abre o link.

## 2. Falta antes do primeiro build

### 2.1 Firebase (push no Android)

Sem isso o app funciona, mas **não recebe notificações no Android**. O arquivo entra no build, então precisa ser feito antes.

1. Em https://console.firebase.google.com, criar o projeto **Planejar Comprador** (conta Google da Nexla).
2. Adicionar um app **Android** com o pacote `br.com.planejarassessoria.comprador`.
3. Baixar o `google-services.json` e colocar em `apps/mobile/google-services.json`. Em `app.json`, adicionar `"googleServicesFile": "./google-services.json"` dentro de `android`.
4. Em Configurações do projeto → **Contas de serviço** → **Gerar nova chave privada** (JSON).
5. Enviar essa chave para o EAS: `npx eas-cli@latest credentials -p android` → *production* → *Google Service Account* → *Manage your Google Service Account Key for Push Notifications (FCM V1)* → *Upload*. A chave é secreta: não versionar.

### 2.2 Conta do Play Console

- Concluir as verificações pedidas no painel: identidade do titular, status de comerciante ("não sou comerciante", distribuição só no Brasil), aparelho Android e telefone.
- Convidar `nexla@nexla.com.br` em **Usuários e permissões** como **Administrador**.

## 3. Ficha da loja

| Campo | Texto |
|---|---|
| Nome do app (até 30) | Planejar Assessoria |
| Descrição curta (até 80) | Acompanhe seu imóvel, suas parcelas e pague com boleto ou Pix. |
| Categoria | Casa e decoração |
| E-mail de contato | o e-mail de atendimento da Planejar |
| Site | https://imobiliaria-alpha-one.vercel.app/suporte.html |
| Política de privacidade | https://imobiliaria-alpha-one.vercel.app/privacidade.html |

**Descrição completa:**

> O app oficial da Planejar Assessoria para quem comprou um imóvel ou lote com a gente.
>
> • Veja o seu imóvel: endereço, lote, quadra, metragem, fotos e como chegar.
> • Acompanhe as parcelas: quantas já foram pagas, quantas faltam e o saldo em aberto.
> • Pague com facilidade: abra o boleto, copie a linha digitável ou use o Pix copia e cola e o QR Code.
> • Receba avisos antes do vencimento e a confirmação quando o pagamento cair.
> • Consulte o contrato e outros documentos enviados pela imobiliária.
> • Fale com a nossa equipe pelo WhatsApp com um toque.
>
> O acesso é exclusivo para compradores da Planejar Assessoria. No primeiro acesso, informe o seu CPF e o código enviado para o seu WhatsApp.

**Imagens:** ícone `docs/lojas/google-play-icone-512.png`, destaque `docs/lojas/google-play-destaque-1024x500.png` e de 2 a 8 capturas de tela do celular (tirar no build do teste fechado).

## 4. Conteúdo do app (Política → Conteúdo do app)

| Declaração | Resposta |
|---|---|
| Política de privacidade | URL acima |
| Anúncios | Não contém anúncios |
| Acesso ao app | Algumas funcionalidades são restritas: informar CPF e senha da conta de demonstração (a mesma da revisão da Apple) e a instrução "Entrar com CPF e senha na tela inicial" |
| Classificação de conteúdo | Questionário: categoria "Utilitário/produtividade/outros"; responder **não** a violência, sexo, drogas, jogos de azar, interação entre usuários e compartilhamento de localização → classificação Livre |
| Público-alvo | 18 anos ou mais; não é direcionado a crianças |
| App de notícias | Não |
| App governamental | Não |
| Recursos financeiros | Descrever que o app **só exibe** boletos e Pix de parcelas de imóveis comprados na imobiliária; não oferece empréstimo, conta, investimento nem movimenta dinheiro |
| Saúde / COVID-19 | Não |

### Segurança dos dados

- Coleta dados: **sim**. Compartilha com terceiros: **não** (prestadores que processam em nome da Planejar não contam como compartilhamento).
- Criptografia em trânsito: **sim**. O usuário pode pedir exclusão: **sim**, URL `.../suporte.html#excluir-conta`.

| Tipo de dado | Coletado | Obrigatório | Finalidade |
|---|---|---|---|
| Informações pessoais → Nome | Sim | Sim | Funcionalidade do app, gerenciamento da conta |
| Informações pessoais → Endereço de e-mail | Sim | Não | Funcionalidade do app, comunicações do desenvolvedor |
| Informações pessoais → IDs do usuário (CPF) | Sim | Sim | Gerenciamento da conta |
| Informações pessoais → Número de telefone | Sim | Sim | Gerenciamento da conta (código de acesso), comunicações |
| Informações financeiras → Outras informações financeiras (parcelas e pagamentos) | Sim | Sim | Funcionalidade do app |
| Dispositivo ou outros IDs (token de notificação) | Sim | Não | Funcionalidade do app (notificações) |

Não coletados: localização, contatos, fotos e vídeos, áudio, arquivos, histórico de navegação, dados de saúde, mensagens, atividade no app, diagnósticos.

## 5. Build, teste fechado e produção

Em `apps/mobile`:

```bash
npx eas-cli@latest build -p android --profile production     # gera o .aab (versionCode incrementa sozinho)
npx eas-cli@latest submit -p android --latest                # envia para o Play Console (pede a chave de serviço do Google na 1ª vez)
```

1. No Play Console: **Testar → Teste fechado** → criar a faixa, adicionar a lista de e-mails (Gmail) dos testadores e publicar o build.
2. Enviar o link de participação aos **12+ testadores** (equipe da Planejar, da Nexla e alguns compradores). Cada um aceita o convite, instala pela Play Store e mantém o app instalado por **14 dias**.
3. Depois dos 14 dias, o Play Console libera o pedido de **acesso à produção** (questionário sobre o teste). Aprovado, promover o build para **Produção**.
