# Bateria de testes do sistema

## Testes unitários (sem servidor)

Formatação (moeda, CPF, telefone, datas, link do WhatsApp), regra de status, leitura das cobranças do Asaas, comparação segura e o cliente do Asaas (paginação, retry, cota) com `fetch` simulado. Não precisam de rede nem de senha:

```bash
npx deno@2.9.6 test -A --config supabase/functions/deno.json supabase/testes/unitarios.test.ts
```

## Testes de ponta a ponta

Testes de ponta a ponta contra o projeto Supabase de **desenvolvimento** (Asaas sandbox). Não rodar contra produção: os testes criam e apagam dados, removem e restauram parcelas no sandbox e excluem e reativam a conta da compradora de teste.

Pré-requisitos (dados de teste descritos no CLAUDE.md, seção 10):
- `supabase/functions/.env` (sandbox) e `apps/mobile/.env` preenchidos;
- compradores de teste: Comprador Teste Nexla (CPF 529.982.247-25) e Maria Teste Importação (CPF 111.444.777-35), com senha já definida;
- um admin de teste do painel (e-mail e senha em `ADMIN_EMAIL` e `SENHA_ADMIN`);
- `psql` no PATH (partes 3 e 4).

```bash
cd supabase/testes
export SENHA_A='senha do Comprador Teste' SENHA_B='senha da Maria'
export ADMIN_EMAIL='e-mail do admin de teste' SENHA_ADMIN='senha dele'
export PGPASSWORD='senha do banco' PG='host=aws-0-us-east-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.<ref> sslmode=require'
npx deno@2.9.6 run -A 1-acesso-e-isolamento.ts
npx deno@2.9.6 run -A 2-senha-operador-webhook.ts
npx deno@2.9.6 run -A 3-contrato-codigo-valores.ts
npx deno@2.9.6 run -A 4-vencimentos-pagamentos-arquivos.ts
```

A parte 4 muda por alguns segundos o vencimento de uma parcela da Maria no cache (o sync devolve o valor do Asaas no fim), desfaz e refaz o recebimento em dinheiro da parcela 2 do Comprador Teste no sandbox e cria/remove um operador de teste.

Nenhuma senha fica nos scripts: tudo vem das variáveis acima.

O limite de 10 validações de código por CPF por hora faz a parte 3 falhar se rodar duas vezes na mesma hora. Para repetir, limpe antes: `delete from rate_limits where chave like 'validar:%'`.
