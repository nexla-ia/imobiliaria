# App do comprador (Expo SDK 58)

- Configuração: copie `.env.example` para `.env`.
- Rodar no emulador Android: `npx expo start --go --android` (o `--go` abre no Expo Go; o projeto tem `expo-dev-client`).
- Push só funciona em development build (`npx eas-cli build --profile development`), não no Expo Go.
- Antes de mexer, leia `AGENTS.md` (o Expo muda API a cada SDK) e o `CLAUDE.md` da raiz.
