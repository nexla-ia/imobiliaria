# App do Comprador — Planejar Assessoria × Asaas

> Projeto Nexla Automação e Inteligência Artificial · Especificação de desenvolvimento
> Status: **proposta aprovada pela cliente (out/2026)** · início do desenvolvimento

Este arquivo é a fonte de verdade do projeto. Leia inteiro antes de escrever código e mantenha-o atualizado quando uma decisão mudar.

---

## 1. Contexto do negócio

A cliente é a **Planejar Assessoria** (CRECI 4.447 MT), imobiliária que vende imóveis/lotes **parcelados**. Todas as cobranças (boletos e Pix) são criadas e recebidas no **Asaas**. Hoje, cada comprador que quer saber quantas parcelas faltam, o valor atualizado ou pedir a 2ª via do boleto precisa mandar mensagem para a equipe.

**Objetivo:** um app próprio da imobiliária (Android + iOS) onde cada comprador acessa o próprio imóvel e vê parcelas, boletos, Pix, documentos e dados do imóvel. Tudo isso sincronizado automaticamente com o Asaas. Junto vem um **painel web** para a equipe da imobiliária gerenciar imóveis, compradores e comunicados.

**Regra de ouro:** o Asaas continua sendo a única fonte da verdade financeira. O sistema **lê** cobranças e **gera/recupera** boleto e Pix, mas nunca recalcula valores, juros ou multa por conta própria.

### Escopo fechado

- App nativo **Android + iOS**, publicado na **Google Play e na App Store** com a marca da imobiliária
- Painel web administrativo para a equipe
- Backend com integração à API do Asaas (leitura + webhooks)
- Notificações push de vencimento e comunicados

### Fora de escopo (não implementar sem nova proposta)

- Assistente de IA no WhatsApp (é uma proposta separada; mas veja a seção 12, porque a arquitetura deve facilitar essa venda depois)
- Criação de cobranças/parcelamentos pelo app ou painel (continuam sendo criados no Asaas)
- Renegociação de dívidas, simulação de quitação, assinatura digital de contrato
- Pagamento com cartão dentro do app

---

## 2. Funcionalidades

### 2.1 App do comprador (mobile)

| Módulo | O que faz |
|---|---|
| **Login** | Entrada com CPF + senha. No primeiro acesso a senha é a **provisória** que a imobiliária envia pelo WhatsApp (gerada no painel); o app obriga a criar uma senha nova. "Esqueci a senha": a equipe gera outra provisória. Se a Evolution API estiver configurada, o código de 6 dígitos automático também funciona (ver decisão de 2026-10-28). |
| **Início** | Card do imóvel, barra de progresso "18 de 60 parcelas pagas", próxima parcela (valor + vencimento) e botões **Boleto** e **Pix**. |
| **Minhas parcelas** | Lista com filtros Pagas / Em aberto / Vencidas. Mostra número da parcela, vencimento, valor original, valor atualizado (vindo do Asaas) e status. Resumo no topo: total pago, quantas faltam, saldo em aberto. |
| **Boleto / Pix** | Para qualquer parcela em aberto ou vencida: abre o PDF do boleto, copia a linha digitável, mostra o QR Code Pix e o "Pix copia e cola". |
| **Meu imóvel** | Endereço, mapa (abre no Google Maps/Apple Maps), empreendimento, lote/quadra, metragem, fotos. |
| **Documentos** | Contrato e outros PDFs enviados pela imobiliária. Também lista comprovantes de parcelas pagas (link do comprovante do Asaas). |
| **Notificações** | Push X dias antes do vencimento (padrão: 3 dias e no dia), confirmação de pagamento recebido e comunicados da imobiliária. Também tem uma central de notificações dentro do app. |
| **Fale com a imobiliária** | Botão que abre o WhatsApp de atendimento com mensagem pré-preenchida. |
| **Perfil** | Dados básicos, trocar senha, **excluir conta** (obrigatório pela Apple), sair. |

Se o comprador tiver **mais de um imóvel**, mostrar um seletor no topo da tela Início.

### 2.2 Painel web (equipe da imobiliária)

| Módulo | O que faz |
|---|---|
| **Login** | E-mail + senha. Perfis: `admin` (tudo) e `operador` (sem configurações). |
| **Empreendimentos e imóveis** | CRUD de empreendimentos e de imóveis (endereço, coordenadas, lote/quadra, metragem, fotos, descrição). |
| **Compradores** | **Importar todos do Asaas** (clientes com CPF e parcelamento, em lote) ou um CPF por vez; vincula o comprador a um imóvel e ao parcelamento (`installment`). Imóveis criados na importação ficam marcados "Revisar". |
| **Documentos** | Upload de PDFs por comprador/contrato. |
| **Comunicados** | Envio de push para todos, para um empreendimento ou para um comprador. Fica salvo no histórico. |
| **Carteira** | Visão de quem está em dia ou em atraso, total recebido no mês e parcelas vencidas, com filtros por empreendimento. Exporta CSV. |
| **Acessos** | Gerar a senha provisória (convite pronto com botão "Abrir no WhatsApp"), ver quem está "Aguardando 1º acesso", gerar nova senha e bloquear acesso. |
| **Configurações** | Dias de antecedência do aviso, número do WhatsApp de atendimento, textos padrão, logo/cores. |

---

## 3. Stack

Segue o padrão já usado nos produtos Nexla (CliniSac etc.):

| Camada | Tecnologia |
|---|---|
| App mobile | **React Native + Expo** (TypeScript, Expo Router), build e publicação via **EAS Build / EAS Submit**, atualizações OTA via **EAS Update** |
| Painel web | **React + Vite** (TypeScript), Tailwind, deploy na **Vercel** |
| Backend / banco | **Supabase**: Postgres, Auth, Storage, Edge Functions (Deno), Row Level Security |
| Integração Asaas | Edge Functions do Supabase (a chave da API **nunca** vai para o app ou para o painel) |
| Push | **Expo Push Notifications** (FCM/APNs por baixo) |
| Jobs agendados | `pg_cron` do Supabase chamando Edge Functions (ou n8n, se preferir manter o padrão da Nexla) |
| Envio de código de acesso | Evolution API (WhatsApp) da Nexla, com e-mail como alternativa |

### Estrutura do repositório (monorepo)

```
/
├── CLAUDE.md                 ← este arquivo
├── apps/
│   ├── mobile/               ← Expo SDK 58 (app do comprador). Rotas em src/app/, ver apps/mobile/AGENTS.md
│   └── admin/                ← Vite 8 + React 19 + Tailwind 4 (painel web)
├── packages/
│   └── shared/               ← tipos das tabelas e das Edge Functions, formatação (moeda, CPF, datas), status, marca
├── supabase/
│   ├── config.toml           ← verify_jwt por função
│   ├── migrations/           ← SQL versionado
│   ├── functions/            ← Edge Functions (asaas-*, auth-*, notify-*, acesso-*, equipe-*, conta-*)
│   │   ├── deno.json
│   │   └── _shared/          ← asaas.ts (cliente Asaas), cobrancas.ts (sync), push.ts, mensagens.ts, http.ts
│   └── seed.sql
└── docs/
    ├── brand/                ← logo original, logo/símbolo em PNG transparente, arte de referência
    └── prototipo/            ← protótipo navegável das telas (semana 1, para aprovação da cliente)
```

Gerenciador: **pnpm workspaces** (`corepack enable` ou `npm i -g pnpm`; sem instalar: `npx pnpm@9.15.0`). `.npmrc` com `node-linker=hoisted` e `pnpm.overrides` fixando `react`/`react-dom` 19.3.0 (versão do SDK 58; duas versões de React quebram o build nativo).

### Como rodar

| O quê | Comando | Observação |
|---|---|---|
| Instalar | `pnpm install` (raiz) | |
| Tipos de tudo | `pnpm typecheck` | shared + mobile + admin |
| Painel | `pnpm admin` | precisa de `.env.local` na raiz (ver `.env.example`) |
| App | `pnpm mobile` | precisa de `apps/mobile/.env`; push só em development build (`eas build --profile development`), não no Expo Go |
| Edge Functions (checagem) | `npx deno@2.9.6 check supabase/functions/*/index.ts` | rodar dentro de `supabase/functions` |
| Testes unitários | `npx deno@2.9.6 test -A --config supabase/functions/deno.json supabase/testes/unitarios.test.ts` | sem rede nem senha |
| Bateria de testes do sistema | ver `supabase/testes/README.md` | só contra o ambiente de desenvolvimento (sandbox) |
| Banco local | `supabase start` + `supabase db reset` | precisa de Docker |

Ao mexer no app, siga `apps/mobile/AGENTS.md`: o Expo muda API a cada SDK, então confira a doc da versão 58 antes de usar um módulo.

---

## 4. Arquitetura

```
 App (Expo)  ─┐                       ┌─► Asaas API v3
              ├─► Supabase ── Edge ───┤
 Painel web  ─┘   (Auth, DB,  Functions└─◄ Webhooks Asaas
                   Storage)     │
                                └─► Expo Push / Evolution API
```

- O app e o painel falam **só com o Supabase** (consultas com RLS + chamadas a Edge Functions).
- As Edge Functions guardam a `ASAAS_API_KEY` em secrets e são as únicas que falam com o Asaas.
- O **webhook do Asaas** atualiza a tabela `cobrancas` em tempo real. Quando um pagamento cai, o app já mostra como pago e dispara um push de confirmação.
- Leituras do app vêm do **cache local (`cobrancas`)**, para ser rápido e não depender do rate limit do Asaas. Boleto e Pix são buscados **sob demanda** no Asaas no momento do clique, porque o QR Code e o valor atualizado precisam estar frescos.
- Uma **sincronização completa** roda 1x por dia via cron como rede de segurança, caso algum webhook se perca.

---

## 5. Modelo de dados (Postgres / Supabase)

Implementado em `supabase/migrations/20261023120000_schema_inicial.sql`. Todas as tabelas têm `id uuid pk`, `created_at` e `updated_at` (trigger). Também têm **`empresa_id`**, para a mesma base atender outras imobiliárias no futuro (multi-tenant desde o dia 1, ver seção 12).

```
empresas              (slug, nome, creci, logo_url, cor_primaria, cor_destaque, whatsapp_atendimento,
                       dias_aviso int[], fuso_horario, asaas_ambiente, mostrar_cobrancas_avulsas,
                       permitir_alterar_vencimento, textos jsonb)
usuarios_admin        (auth_user_id, empresa_id, nome, papel: admin|operador)
compradores           (auth_user_id null até ativar, empresa_id, nome, cpf unique por empresa,
                       email, telefone, asaas_customer_id, status_acesso: convidado|ativo|bloqueado,
                       termos_aceitos_em, ativado_em, excluido_em)
empreendimentos       (empresa_id, nome, cidade, uf)
imoveis               (empresa_id, empreendimento_id, identificacao "Lote 12 · Quadra B",
                       endereco, lat, lng, metragem_m2, descricao)
imovel_fotos          (empresa_id, imovel_id, storage_path, ordem)
contratos             (empresa_id, comprador_id, imovel_id, asaas_installment_id null,
                       numero_parcelas, data_inicio, status: ativo|quitado|cancelado, ultima_sync_em)
cobrancas             (empresa_id, comprador_id, contrato_id null = avulsa, asaas_payment_id unique,
                       numero_parcela, descricao, vencimento, vencimento_original, valor, valor_original,
                       valor_liquido, valor_juros, status_asaas, status_app (gerada), removida,
                       data_pagamento, billing_type, invoice_url, bank_slip_url, comprovante_url,
                       atualizado_asaas_em)
documentos            (empresa_id, comprador_id, contrato_id null, titulo, storage_path, tipo)
comunicados           (empresa_id, titulo, corpo, alvo: todos|empreendimento|comprador, alvo_id,
                       criado_por, enviado_em, total_destinatarios)
notificacoes          (empresa_id, comprador_id, tipo: vencimento|pagamento|comunicado, titulo, corpo,
                       lida_em, payload jsonb, chave_dedup unique)
push_tokens           (empresa_id, comprador_id, expo_token unique, plataforma, ativo)
codigos_acesso        (empresa_id, comprador_id, codigo_hash, canal, expira_em, tentativas, usado_em)
rate_limits           (chave, janela_inicio, contador)
asaas_webhook_eventos (empresa_id, asaas_event_id unique, evento, payload jsonb, processado_em, erro)
audit_log             (empresa_id, ator_id, acao, entidade, entidade_id, dados jsonb)

vw_resumo_contrato    (view security_invoker: total/pagas/vencidas, total_pago, saldo, próxima cobrança)
```

Storage: buckets privados `imoveis` (`{empresa_id}/{imovel_id}/arquivo`) e `documentos` (`{empresa_id}/{comprador_id}/arquivo`); bucket público `marca` (logo).

### Row Level Security

- **Comprador** lê apenas o que for dele: os próprios `contratos`, as `cobrancas` desses contratos, os `imoveis` vinculados, as próprias `notificacoes` e `documentos`. Ele não escreve nada além de `push_tokens` e do campo `lida_em`. Comprador `bloqueado` não vê nada além do próprio cadastro.
- **Admin/operador** lê e escreve apenas dentro da própria `empresa_id`. Só `admin` altera `empresas` (configurações) e `usuarios_admin`.
- `cobrancas`, `notificacoes` e `audit_log` não aceitam escrita de usuário logado; `codigos_acesso`, `rate_limits` e `asaas_webhook_eventos` nem leitura.
- Escritas vindas do Asaas (webhook e sync) usam `service_role` dentro das Edge Functions.
- Ações da equipe em compradores, contratos, comunicados, documentos, equipe e configurações vão para o `audit_log` por gatilho.
- Testado em 2026-10-23 num Postgres local com stubs de `auth`/`storage` (ver decisões).

---

## 6. Integração com o Asaas

> ⚠️ Confirme cada endpoint e campo na documentação oficial antes de implementar: https://docs.asaas.com
> Comece **sempre no sandbox** e passe para produção só após os testes com a cliente.

- **Base URL produção:** `https://api.asaas.com/v3`
- **Base URL sandbox:** `https://api-sandbox.asaas.com/v3`
- **Autenticação:** header `access_token: <ASAAS_API_KEY>`
- Respeitar paginação (`offset`/`limit`, máx. 100) e os limites de requisição. Retry com backoff para 429/5xx já implementado em `_shared/asaas.ts`.
- `_shared/asaas.ts` recusa rodar se o prefixo da chave (`$aact_prod_` / `$aact_hmlg_`) não bater com `ASAAS_AMBIENTE`.

### Endpoints usados

| Uso | Endpoint |
|---|---|
| Buscar cliente por CPF | `GET /customers?cpfCnpj={cpf}` |
| Listar cobranças do cliente | `GET /payments?customer={id}` (+ filtros de status) |
| Cobranças de um parcelamento | `GET /payments?installment={id}` |
| Detalhe do parcelamento | `GET /installments/{id}` |
| Detalhe da cobrança | `GET /payments/{id}` (traz `invoiceUrl`, `bankSlipUrl`, `status`, `value`, `dueDate`…) |
| Linha digitável | `GET /payments/{id}/identificationField` |
| QR Code Pix | `GET /payments/{id}/pixQrCode` (retorna imagem base64 + payload copia e cola) |

### Status do Asaas → status no app

| Asaas | App |
|---|---|
| `PENDING` | Em aberto |
| `OVERDUE` | Vencida |
| `RECEIVED`, `CONFIRMED`, `RECEIVED_IN_CASH` | Paga |
| `REFUNDED`, `REFUND_REQUESTED`, `REFUND_IN_PROGRESS`, `CHARGEBACK_*` | Estornada (mostrar com aviso) |
| `DELETED` / removida / demais | Esconder do comprador |

Mapeamento implementado duas vezes, que devem ficar iguais: coluna gerada `cobrancas.status_app` (SQL) e `statusApp()` em `packages/shared/src/status.ts`.

### Webhook

- Configurar no painel do Asaas, apontando para a Edge Function `asaas-webhook`.
- Validar o token de autenticação do webhook (header `asaas-access-token`, configurado no Asaas) e responder `200` rápido.
- Eventos tratados: `PAYMENT_CREATED`, `PAYMENT_UPDATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_RESTORED`, `PAYMENT_REFUNDED`.
- **Idempotência:** gravar em `asaas_webhook_eventos` com `asaas_event_id` único antes de processar, e ignorar duplicados.
- Em `PAYMENT_RECEIVED`/`CONFIRMED`, criar uma notificação "Pagamento da parcela X recebido" e enviar o push.

### 2ª via de parcela vencida

- Primeiro tentar o `invoiceUrl`/`bankSlipUrl` atual. O Asaas normalmente aceita pagamento após o vencimento com juros e multa configurados na cobrança.
- **Decidir com a cliente** (pendência, seção 11) se o app pode **alterar o vencimento** de uma cobrança vencida (`POST /payments/{id}` com nova `dueDate`) ou se isso fica só com a equipe. Por padrão, o app **não altera** nada no Asaas (`empresas.permitir_alterar_vencimento = false`).

### A confirmar no sandbox (semana 2)

Testado no sandbox em 2026-10-27 (cliente de teste `cus_000009703477`, "Comprador Teste Nexla", CPF 529.982.247-25, parcelamento 3× R$ 1.250 "TESTE NEXLA"; a 1ª parcela foi forçada para vencida):

- `installmentNumber` vem preenchido (1, 2, 3) e a descrição automática é `"Parcela 1 de 3. <descrição>"`.
- **`interestValue` e `originalValue` vêm `null` numa cobrança vencida ainda não paga.** Não há como saber o valor com juros antes do pagamento; o app mostra "juros e multa entram no valor final do boleto e do Pix" (já implementado). O objeto traz só a regra (`interest.value`, `fine.value` em %), que **não** usamos para calcular nada.
- `identificationField` funciona na vencida; a linha digitável carrega o valor original (juros entram no pagamento).
- `pixQrCode` funciona na em aberto e na vencida; o QR vale até 12 meses após o vencimento. O Pix é dinâmico (sem campo de valor no copia e cola): o banco busca o valor atualizado na hora.
- **Sem chave Pix cadastrada na conta, `pixQrCode` dá erro 400** ("Você não possui uma chave Pix cadastrada"), apesar de a doc falar em QR provisório. A conta de produção da cliente precisa de chave Pix (pendência, seção 11).
- Forçar vencimento no sandbox muda o `dueDate` para ontem e mantém o original em `originalDueDate`.

---

## 7. Edge Functions

| Função | Quem chama | O que faz |
|---|---|---|
| `auth-solicitar-codigo` | app (anônimo) | Recebe CPF, verifica se é comprador cadastrado e envia código de 6 dígitos (WhatsApp/e-mail). Rate limit por CPF e IP (`rate_limits`). A resposta é genérica para não revelar se o CPF existe. |
| `auth-validar-codigo` | app (anônimo) | Valida o código (máx. 5 tentativas, expira em 10 min), cria ou atualiza o usuário no Supabase Auth e define a senha. |
| `asaas-boleto` | app (comprador logado) | Confere se a cobrança é do comprador, busca no Asaas e devolve `bankSlipUrl` e linha digitável. |
| `asaas-pix` | app (comprador logado) | Mesma checagem; devolve QR Code base64 + copia e cola + validade. |
| `asaas-webhook` | Asaas | Ver seção 6. |
| `asaas-sync` | cron diário / painel | Ressincroniza as cobranças de todos os contratos ativos. Também pode ser chamada para um contrato específico pelo botão "Sincronizar" no painel. |
| `asaas-buscar-cliente` | painel (admin) | Busca no Asaas por CPF e lista os parcelamentos/cobranças, para vincular ao comprador. |
| `notify-vencimentos` | cron diário 8h (`America/Cuiaba`) | Encontra as parcelas que vencem em N dias, cria notificações (com `chave_dedup`) e envia push. |
| `notify-comunicado` | painel | Envia o comunicado para o público-alvo. |
| `conta-excluir` | app | Exclui o login e os dados pessoais do comprador e anonimiza o histórico (exigência da Apple e da LGPD). |
| `acesso-convidar` | painel | Gera a **senha provisória** (8 caracteres aleatórios, vale 30 dias), cria/atualiza o login e devolve a mensagem de convite + link `wa.me` para a equipe mandar pelo WhatsApp da imobiliária. Com `enviar_automatico` e Evolution configurada, envia sozinha. Também é o "esqueci a senha". |
| `asaas-importar-clientes` | painel (só admin) | Importa em lote os clientes do Asaas com CPF e parcelamento: cria comprador, imóvel provisório (`revisar = true`, nome = descrição do parcelamento) e contrato; sincroniza até ~80 s e devolve o que ficou pendente. Pode rodar de novo sem duplicar. |
| `conta-definir-senha` | app | Primeiro acesso com senha provisória: valida a validade, exige aceite dos termos (se ainda não aceitou) e grava a senha escolhida pelo comprador. |
| `equipe-adicionar` | painel (só admin) | Cria o login de um membro da equipe com senha provisória; a pessoa troca no primeiro acesso. |

Login do comprador: ver decisão de 2026-10-23 na seção 13.

Contratos de entrada/saída das funções: `packages/shared/src/api.ts` (as funções Deno não importam esse pacote; manter os dois iguais à mão).

Autenticação das funções: as chamadas pelo app/painel usam JWT; `auth-*` são anônimas com rate limit; `asaas-webhook` valida `asaas-access-token`; as chamadas do `pg_cron` mandam `x-cron-secret` (secret `CRON_SECRET`, mesmo valor no Vault como `cron_secret`, junto com `project_url`).

Agendamentos (migration `20261026120000`): `notify-vencimentos` às 08:00 de Cuiabá; `asaas-sync` a cada 15 min entre 02:00 e 05:45, cada chamada processa ~110 s de compradores com sync mais antigo que 20 h; limpeza semanal de dados técnicos.

---

## 8. Telas e identidade

- Identidade visual **da imobiliária**, não da Nexla. O rodapé "Desenvolvido por Nexla" é discreto e fica só na tela de login/perfil.
- Referência de UX aprovada na proposta: tela inicial com card do imóvel, barra de progresso de parcelas, card da próxima parcela e botões Boleto/Pix em destaque.
- Formatos BR: moeda `R$ 1.250,00`, datas `20/10/2026`, CPF `123.456.789-00` (`packages/shared/src/format.ts`).
- Acessibilidade: textos ≥ 16px, contraste AA, tamanho de fonte do sistema respeitado.
- **Semana 1 do cronograma = protótipo das telas para a cliente aprovar** antes do desenvolvimento pesado: `docs/prototipo/index.html` (abre direto no navegador). Publicado em https://claude.ai/artifact/22ZybxNmHre2zf7fVgepzE (privado; atualizar republicando o mesmo arquivo para manter o link). Atalhos: `#inicio`, `#parcelas`, `#imovel`, `#documentos`, `#notificacoes`, `#perfil`, `#vencida`, `#boleto`, `#pix`.

### Marca Planejar Assessoria (recebida em 2026-10-23)

- **Logo:** `docs/brand/logo-original-fundo-cinza.png` (original, branco sobre cinza `#5A5A5A`). Versões extraídas com fundo transparente: `logo-branco.png` / `logo-azul.png` (logo completa) e `simbolo-branco.png` / `simbolo-azul.png` (só o monograma, quadrado, base para ícone do app e splash). Pedir à cliente o **vetor (SVG/PDF/AI)** para o ícone final das lojas.
- **Arte de referência:** `docs/brand/referencia-atendimento-online.png` — fundo azul-noite com degradê, linhas finas em onda, destaque em ciano, tipografia sem serifa condensada em itálico/bold.
- **Cores** (tokens em `packages/shared/src/marca.ts`):

| Token | Hex | Uso |
|---|---|---|
| `azulNoite` | `#000D38` | cor primária, fundos de marca, cabeçalhos |
| `azulProfundo` | `#00020E` | cantos do degradê |
| `azulMarinho` | `#0A1F5C` | superfícies sobre o fundo escuro |
| `ciano` | `#0AC1FA` | destaque sobre fundo escuro (não usar como texto sobre branco: contraste baixo) |
| `cianoEscuro` | `#0078A8` | ciano para texto/links sobre fundo claro (AA) |

- **Tipografia:** Saira (Google Fonts, `@expo-google-fonts/saira` no app) — próxima da fonte da arte.
- **WhatsApp de atendimento:** (65) 9 9937-3761 → `5565999373761`.

---

## 9. Segurança e LGPD

- Chave do Asaas só em secrets das Edge Functions; nunca no repositório, no app ou no painel. Localmente fica em `supabase/functions/.env` (sandbox) e `supabase/functions/.env.production` (produção), ambos no `.gitignore`.
- Toda Edge Function que recebe um `payment_id` confere no banco se aquela cobrança pertence ao comprador autenticado.
- Rate limit no login e no envio de código.
- Cadastro aberto desligado no Supabase Auth (`enable_signup = false`); usuários são criados só pelas Edge Functions.
- Sessão do app no armazenamento seguro (`expo-secure-store`). Biometria para reabrir o app é opcional (fase 2).
- `audit_log` para ações do painel (vincular comprador, enviar comunicado, bloquear acesso).
- Política de privacidade publicada em URL pública (exigida pelas duas lojas), com termo de uso aceito no primeiro acesso (`compradores.termos_aceitos_em`).
- Exclusão de conta dentro do app.

---

## 10. Cronograma (6 semanas)

| Semana | Entrega |
|---|---|
| 1 | Setup do monorepo, Supabase, schema + RLS, protótipo das telas para aprovação, sandbox do Asaas conectado |
| 2 | Edge Functions do Asaas (busca, boleto, Pix, webhook, sync), login por CPF + código |
| 3 | App: Início, Parcelas, Boleto/Pix, Meu imóvel, Documentos · Painel: imóveis, compradores, vínculo com o Asaas |
| 4 | Push (vencimento, pagamento, comunicados), carteira, documentos, testes com a equipe e alguns compradores reais (TestFlight + teste interno da Play) |
| 5 | Ajustes, troca do Asaas para produção, publicação na **Google Play** |
| 6 | Publicação na **App Store** (depende da revisão da Apple), acompanhamento pós-lançamento |

Critério de pronto de cada etapa: funciona no sandbox do Asaas com dados reais da cliente espelhados, roda em Android e iOS e foi validado por ela.

**Andamento (2026-10-26):** protótipo aprovado pela cliente. Código das semanas 2 e 3 escrito:
- Backend: 3 migrations, 12 Edge Functions. Tipos conferidos com Deno; SQL e RLS testados num Postgres local com stubs.
- App: login, primeiro acesso, Início, Parcelas, Boleto/Pix, Meu imóvel, Documentos, Notificações, Perfil, trocar senha e excluir conta. Inclui push e atualização em tempo real. Tipos ok, `expo-doctor` 20/20, bundle Android gerado.
- Painel: login, Carteira (CSV), Compradores (importar do Asaas, vincular parcelamento, documentos, convite, bloqueio), Imóveis (com fotos), Comunicados e Configurações (equipe). Tipos, lint e build ok.

**Ambiente de desenvolvimento no ar (2026-10-27):** migrations e seed aplicados, 12 functions publicadas com os secrets do sandbox, cadastro aberto desligado no Auth, webhook do Asaas sandbox (`15332dc3-cdc7-4433-9a21-96f6e9a8b030`) apontando para `asaas-webhook`.

Teste ponta a ponta feito no servidor real, com o comprador de teste (CPF 529.982.247-25, contrato do Lote 12 · Quadra B ligado ao parcelamento sandbox `7d4a6916-…`):
- `asaas-sync` trouxe as 3 parcelas, e o resumo do contrato bateu.
- `auth-validar-codigo` recusou o código errado, aceitou o certo e criou o login.
- Login por senha funcionou. Pela RLS, o comprador vê só o que é dele e é barrado nas tabelas internas.
- `asaas-boleto` e `asaas-pix` responderam para a parcela vencida; sem login, `nao_autenticado`.
- `registrar_push_token` funcionou.
- Pagamento simulado (`receiveInCash`) → webhook `PAYMENT_RECEIVED` → parcela 2 paga e notificação "Pagamento recebido" criada.

App testado no emulador **Pixel_5** (Android 14) via Expo Go 58, contra este backend:
- Login com o comprador de teste.
- Início com dados reais.
- Parcelas com os 3 status.
- Pix com QR Code do sandbox.
- Abas Imóvel, Documentos e Perfil.

Para rodar:
1. `"%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe" -avd Pixel_5`
2. Em `apps/mobile`: `npx expo start --go --android` (o `--go` é necessário porque o `expo-dev-client` está instalado).

Painel testado em 2026-10-27 contra este backend, com o Chrome automatizado (Playwright), login `painel.teste@nexla.com.br` (admin de teste criado pela equipe):
- Todas as telas abriram sem erro de console nem resposta HTTP ≥ 400.
- Login de não-membro mostra "Sem acesso ao painel".
- A busca no Asaas pelo CPF reconhece o parcelamento já vinculado.
- Ações que gravam dados: envio de PDF, sincronizar, comunicado para 1 comprador (gera a notificação), foto do imóvel. Todas gravaram em banco, Storage e `audit_log`.

Senha provisória e importação em lote testadas em 2026-10-28 no servidor real e no emulador:
- A importação trouxe a cliente sandbox "Maria Teste Importação" (CPF 111.444.777-35, 12× R$ 890) com imóvel "Revisar". Rodar de novo não duplica.
- A senha provisória é gerada pelo painel. Com ela o login funciona, mas a RLS não mostra nada até a troca.
- A troca de senha exige os termos. Depois dela os dados aparecem, e a provisória antiga deixa de entrar.
- Senha vencida é recusada.
- No app (Pixel 5), a tela "Crie sua senha" aparece e em seguida o Início, com as 12 parcelas.

**Bateria de testes e revisão de código (2026-10-28):** `supabase/testes/` (3 scripts, 119 verificações contra o backend de desenvolvimento) e revisão independente do backend, do app e do painel.

Bugs reais encontrados e corrigidos:
- **Senha provisória:** com ela ainda não trocada dava para pegar boleto/Pix e **excluir a conta** (`exigirComprador` não olhava `deve_trocar_senha`). Também dava para "definir" a própria provisória como senha.
- **Código de acesso:** chamadas em paralelo furavam o limite de 5 tentativas. Agora a contagem é atômica antes de comparar, com limite de 10 por CPF/hora. A resposta não diferencia código vencido, esgotado ou CPF inexistente.
- **IP do limite:** o IP vinha de um header que o cliente pode forjar. Agora usa `cf-connecting-ip`, confirmado por sondagem: o último item do X-Forwarded-For é o proxy do Supabase, igual para todos.
- **Sincronização:**
  - passou a ser por parcelamento, o que resolve CPF com dois cadastros no Asaas;
  - não regride parcela paga por leitura antiga (`lidoEm`);
  - remove IDs duplicados;
  - atualiza `numero_parcelas`.
- **Contrato cancelado:** sumia só no sync seguinte, ainda gerava boleto e notificações e não podia ser religado. Ajustados RLS, índice parcial, webhook, `asaas-boleto`/`asaas-pix` e o botão "Reativar contrato" no painel.
- **Valores:** "Total pago" e "Recebido no mês" usavam o valor original e não o pago. No Asaas, `value` de cobrança paga com juros é o valor pago. "Recebido no mês" agora é a RPC `recebido_no_mes()`.
- **Escala:**
  - comunicado "para todos" e listas do painel cortavam em 1000 linhas;
  - limite de consultas ao Asaas por comprador (20/min);
  - eventos de webhook gravados e não processados são reprocessados pelo cron.
- **Permissões:** admin podia mudar `slug`/`asaas_ambiente`, agora com grant por coluna. Operador podia trocar a logo. A senha mínima do Auth era 6, agora 8.
- **App:**
  - erro de rede aparecia como "conta excluída";
  - os dados não recarregavam ao voltar do segundo plano;
  - o teclado cobria o botão "Entrar" no Android;
  - o cache não era limpo ao sair;
  - notificação reaberta ao entrar de novo;
  - contraste AA das etiquetas;
  - erros de carga apareciam como lista vazia.
- **Painel:**
  - Esc travava a importação;
  - comunicado duplicava ao tentar de novo;
  - a carteira contava como "App ativo" quem só tinha senha provisória;
  - metragem "360.5" virava 3605;
  - cadastro duplicado ao tentar de novo;
  - clique duplo em confirmações;
  - arquivo órfão quando o cadastro falhava;
  - membro removido não podia voltar à equipe.

Conhecido e deixado para depois (registrado para não esquecer):
- **Integridade multi-empresa:** faltam FKs compostas `(empresa_id, id)` entre contrato, comprador e imóvel. Só importa quando entrar a 2ª imobiliária.
- **Comprador PJ (CNPJ):** não entra no app. Confirmar com a cliente se existe esse caso.
- **Textos secundários de 14px** (etiquetas, horários, legendas) e rótulos das abas de 12px, abaixo dos 16px da seção 8. O corpo segue em 16px+, e as abas não aumentam com a fonte do sistema.
- **`trocar_senha` da equipe** fica em `user_metadata` (a própria pessoa poderia desligar). O risco é baixo, porque só afeta quem já é da equipe.
- **Build EAS:** cadastrar as variáveis `EXPO_PUBLIC_*` no EAS (`eas env:create`), porque o `.env` não sobe para o build.

**Segunda bateria (2026-10-28):** 16 testes unitários, parte 4 dos scripts (35 verificações), painel no Chrome automatizado (20) e o app no emulador.
- Servidor:
  - status do Asaas: o banco e o app classificam os 13 status iguais;
  - aviso de 3 dias e do dia criado, sem duplicar;
  - recebimento desfeito e refeito no Asaas volta pelo webhook sem repetir o push;
  - evento de webhook perdido reprocessado pelo cron;
  - documento de um comprador fechado para outro e para anônimo;
  - operador não troca a logo;
  - membro removido volta à equipe;
  - limite de boleto/Pix funcionando.
- Painel:
  - Esc não interrompe a importação, e importar de novo não duplica;
  - cancelar e reativar contrato;
  - metragem "360,5" e "1.250,75";
  - CSV com BOM, `;` e CPF formatado;
  - adicionar, remover e adicionar de novo a mesma pessoa;
  - salvar configurações.
- App: a central mostra os avisos, o toque abre Boleto/Pix da parcela e marca como lida, e senha atual errada é recusada.
- Bug corrigido: o link do WhatsApp (`linkWhatsapp`) ia sem o 55 quando o número estava cadastrado só com DDD, e o wa.me não abria a conversa.
- Observação: no Expo Go, o botão flutuante de desenvolvedor fica em cima do sino de notificações. Não existe no app das lojas.

Ainda não testado:
- o envio automático do código (falta a Evolution API, agora opcional);
- push num aparelho (falta o projeto EAS e uma development build);
- iOS.

---

## 11. O que precisamos da cliente / pendências

- [x] Chave de API do Asaas de **produção** — recebida em 2026-10-23, guardada em `supabase/functions/.env.production` (fora do git)
- [x] Chave de API do Asaas de **sandbox** — recebida em 2026-10-27, guardada em `supabase/functions/.env` (fora do git). Conta sandbox: "PLANEJAR ASSESSORIA URBANO E RURAL"
- [ ] **Chave Pix cadastrada na conta Asaas de produção** (sem ela o botão Pix do app não funciona)
- [x] Acesso ao projeto Supabase `boxxebvhyhtmgbqwfjji` — senha do banco e token de acesso (expira em 7 dias, criado em 2026-10-27) recebidos; ambiente configurado. Trocar a senha do banco depois, porque ela passou pela conversa.
- [x] Primeiro administrador do painel: `alisson@gmail.com` ("Alisson", papel `admin`), ligado em `usuarios_admin` em 2026-10-27. Novos membros entram pelo próprio painel (Configurações → Equipe).
- [x] Logo e cores — recebidas em 2026-10-23 (PNG). Falta: arquivo vetorial e nome do app nas lojas
- [ ] Planilha de empreendimentos, imóveis (endereço, lote/quadra, metragem, fotos) e compradores (CPF ↔ imóvel)
- [x] Número de WhatsApp de atendimento: (65) 9 9937-3761
- [ ] **Conta Google Play Console como organização** (US$ 25, uma vez). Conta pessoal nova exige teste fechado com 12 testadores por 14 dias antes de publicar, o que atrasa o cronograma.
- [ ] **Conta Apple Developer como organização** (US$ 99/ano). Precisa de CNPJ e número **D-U-N-S**, que pode levar alguns dias, então **pedir já na semana 1**.
- [ ] Textos de política de privacidade e termos (ou aprovar o modelo que fizermos)
- [x] Aprovar o protótipo das telas (`docs/prototipo/index.html`) — aprovado em 2026-10-26
- [ ] **Nome do app nas lojas** e **identificador** (`br.com.planejarassessoria.comprador` provisório em `apps/mobile/app.json`; não dá para trocar depois de publicar)
- [ ] Conta Expo/EAS da Nexla para o projeto (gera `extra.eas.projectId`, necessário para o push)
- [ ] Instância da Evolution API (opcional desde 2026-10-28: sem ela, a equipe manda a senha provisória pelo WhatsApp da imobiliária com um clique no painel)
- [ ] Remetente de e-mail (domínio verificado no Resend), se o código por e-mail for usado
- [ ] URLs públicas dos Termos de uso e da Política de privacidade (app e painel)
- [ ] Decidir: comprador pode alterar o vencimento de parcela vencida pelo app? (padrão: não)
- [ ] Decidir: dias de aviso de vencimento (padrão: 3 dias antes e no dia)
- [ ] Decidir: cobranças avulsas (fora do parcelamento, ex.: taxa de transferência) aparecem no app? (padrão: não — `empresas.mostrar_cobrancas_avulsas`)
- [ ] Confirmar condição comercial fechada: `[R$ 6.900 à vista | R$ 2.400 + 3x R$ 1.700]` + R$ 300/mês a partir da publicação

---

## 12. Visão de produto (Nexla)

Construir pensando em **reaproveitar para outras imobiliárias/loteadoras**:

- `empresa_id` em tudo e white-label por configuração (logo, cores, nome).
- Pelo menos a lógica do Asaas isolada em `supabase/functions/_shared/asaas.ts`, reutilizável pela **assistente de IA no WhatsApp** (proposta já apresentada à cliente, R$ 1.200 + R$ 300/mês). As mesmas funções de buscar cliente, boleto e Pix servem de *tools* para o agente no n8n.

---

## 13. Convenções e registro de decisões

- TypeScript estrito em tudo; tipos do banco gerados com `supabase gen types` (`pnpm db:types`).
- Migrations SQL versionadas; nunca alterar o banco de produção na mão.
- Commits pequenos e descritivos em português.
- Variáveis de ambiente documentadas em `.env.example` e `supabase/functions/.env.example` (sem valores reais).
- Toda decisão relevante tomada durante o desenvolvimento entra na lista abaixo com data.

### Decisões

- 2026-10-22 — Proposta aprovada: app nativo Android + iOS + painel web, integrado ao Asaas. Stack: Expo + Vite/React + Supabase.
- 2026-10-23 — Cliente: **Planejar Assessoria**, CRECI 4.447 MT. `empresas.slug = 'planejar'`. Pacotes do monorepo com escopo `@planejar/*`.
- 2026-10-23 — Fuso dos jobs: **`America/Cuiaba`** (cliente em MT; mesmo UTC−4 de Porto Velho, mas é o fuso correto da região). Configurável em `empresas.fuso_horario`.
- 2026-10-23 — Login do comprador no Supabase Auth com **e-mail sintético** `{cpf}@comprador.{slug}.local`, criado só pela Edge Function `auth-validar-codigo` (admin API, `email_confirm: true`). O app tem `EXPO_PUBLIC_EMPRESA_SLUG` fixo por build (white-label), então CPF + slug identificam o comprador sem ambiguidade entre empresas.
- 2026-10-23 — `cobrancas` ganhou `comprador_id` (obrigatório) e `contrato_id` passou a ser opcional, para comportar cobranças avulsas. Cobranças `DELETED` ficam com `removida = true` em vez de serem apagadas.
- 2026-10-23 — Chave do Asaas em env (`ASAAS_API_KEY`) enquanto houver uma única empresa. Ao entrar a 2ª imobiliária, mover para Supabase Vault por `empresa_id`.
- 2026-10-23 — Recebemos a chave de **produção** antes da de sandbox. Ela fica guardada e só é usada na semana 5; o desenvolvimento roda no sandbox, como manda a seção 6.
- 2026-10-23 — Protótipo da semana 1 feito em HTML navegável (`docs/prototipo/`), sem dependências, para a cliente abrir no celular. As telas Expo reais começam após a aprovação.
- 2026-10-26 — Protótipo aprovado. As perguntas 4–6 dele (dias de aviso, avulsas, vencimento) seguem com os padrões até a cliente responder: 3 dias antes e no dia; avulsas escondidas; app não altera vencimento.
- 2026-10-26 — Documentação do Asaas conferida: `installmentNumber` existe; o webhook traz `id` único (`evt_…`); `User-Agent` é obrigatório; 429 não traz `Retry-After` (usamos `RateLimit-Reset`); cota de 25 mil requisições/12 h. O webhook responde 2xx mesmo quando o processamento falha (erro fica em `asaas_webhook_eventos`), porque 15 falhas seguidas pausam a fila.
- 2026-10-26 — "Valor atualizado" de parcela vencida: o app mostra o `value` do Asaas e, se vier, o `interestValue` separado ("mais R$ X de juros e multa"); nunca soma nem calcula. Confirmar no sandbox (forçar vencimento) se `interestValue` vem antes do pagamento.
- 2026-10-26 — Sync por **comprador**: uma listagem `GET /payments?customer=` cobre parcelamentos e avulsas. Cobranças de parcelamentos não vinculados a contrato são ignoradas; as que somem da listagem viram `removida`. Nova coluna `compradores.ultima_sync_em`.
- 2026-10-26 — `auth-solicitar-codigo` responde sempre igual e o app não mostra o WhatsApp mascarado (diferente do protótipo), para não revelar se o CPF é cliente.
- 2026-10-26 — Código digitado num campo único (não 6 caixas), para o preenchimento automático de código do iOS/Android funcionar.
- 2026-10-26 — App: abas JS (`expo-router/js-tabs`), ícones `@react-native-vector-icons/ionicons` (o `@expo/vector-icons` está sendo descontinuado), fonte Saira via `useFonts`, sessão no SecureStore dividida em pedaços (limite ~2 KB em alguns iOS). Mapa: ilustração + botões que abrem Apple Maps (iOS) ou Google Maps, sem SDK de mapas.
- 2026-10-26 — Push: registro do aparelho pela função SQL `registrar_push_token` (o mesmo celular pode trocar de conta). Tempo real nas tabelas `cobrancas` e `notificacoes` (publicação `supabase_realtime`).
- 2026-10-26 — E-mail como alternativa do código via **Resend** (`RESEND_API_KEY`, `EMAIL_REMETENTE`); opcional por ambiente.
- 2026-10-26 — Tipos das tabelas escritos à mão em `packages/shared/src/tipos.ts` até existir o projeto Supabase; depois trocar por `pnpm db:types`.
- 2026-10-27 — Projeto Supabase de desenvolvimento: `https://boxxebvhyhtmgbqwfjji.supabase.co` (organização nexla@nexla.com.br, plano Free, região us-east-1; URL e anon key em `.env.local` e `apps/mobile/.env`, fora do git). As 3 migrations e o seed foram aplicados em 2026-10-27 com `supabase db push --db-url` pelo pooler (`aws-0-us-east-1.pooler.supabase.com:5432`, usuário `postgres.boxxebvhyhtmgbqwfjji`); `project_url` e `cron_secret` gravados no Vault. Para produção: plano pago (o Free pausa o projeto após 7 dias sem uso, o que derrubaria o cron e o webhook) e, de preferência, região São Paulo (`sa-east-1`).
- 2026-10-27 — Ajustes do teste no emulador Android:
  - `expo-notifications` é carregado sob demanda e nunca no Expo Go (`isRunningInExpoGo()`): só importar o módulo já derruba o app no Expo Go Android.
  - A tela Boleto/Pix (`cobranca/[id]`) abre como `formSheet` só no iOS. No Android vira `modal` com `slide_from_bottom`, porque a formSheet abriu invisível e travou os toques.
  - A sessão só é publicada depois que o perfil do comprador carrega, senão o guard abre o Início sem comprador.
  - Nas telas logadas, o fundo do sistema fica branco (`expo-system-ui`) para a barra de abas ir até a borda.
  - Rótulos das abas em 12px Saira Medium, para "Documentos" caber.
- 2026-10-28 — **Acesso por senha provisória gerada no painel** (pedido da cliente: padronizar e alimentar o app em lote com os clientes do Asaas).
  - A senha **não** pode ser derivada de nome + CPF: os dois vão impressos em todo boleto e comprovante, e quem pegasse um boleto entraria na conta.
  - A senha é aleatória (`XXXX-XXXX`, sem 0/O/1/I/L), vale 30 dias e é enviada pela equipe pelo WhatsApp da imobiliária (link `wa.me` com a mensagem pronta). Nunca fica gravada.
  - Enquanto `compradores.deve_trocar_senha = true`, `comprador_atual_id()` retorna nulo e a RLS não mostra nada. O app abre direto em "Crie sua senha" (`conta-definir-senha`).
  - O código automático por WhatsApp/e-mail continua implementado e passa a valer quando a Evolution/Resend forem configuradas: `auth-solicitar-codigo` devolve `automatico`. Sem envio automático, "Primeiro acesso / Esqueci a senha" no app orienta a pedir a senha à imobiliária pelo WhatsApp.
  - Importação em lote: `asaas-importar-clientes` e `imoveis.revisar`; o `asaas-sync` ganhou o modo `{ pendentes: true }`. Migration `20261028120000`.
- 2026-10-28 — Painel publicado na Vercel: **https://imobiliaria-alpha-one.vercel.app** (repositório `github.com/nexla-ia/imobiliaria`, Root Directory `apps/admin`, variáveis `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`). No Supabase Auth, `site_url` = esse endereço e redirects liberados para ele e para `http://localhost:5173/**` (link de "Esqueci minha senha" do painel).
- 2026-10-28 — Correções da bateria de testes e da revisão: migration `20261028140000_correcoes_da_revisao.sql` e `_shared/webhook.ts` (processamento comum ao webhook e ao reprocessamento do cron). Detalhes na seção 10.
- 2026-10-27 — Nos arquivos `.env`, a chave do Asaas fica **entre aspas simples** (`ASAAS_API_KEY='$aact_…'`): ela começa com `$`, e sem aspas o shell e o leitor de `.env` do Supabase CLI a expandem como variável (vira vazio e o Asaas responde 401). Os outros segredos das functions (`ASAAS_WEBHOOK_TOKEN`, `CRON_SECRET`, `CODIGO_PEPPER`) foram gerados aleatoriamente no `supabase/functions/.env`.
