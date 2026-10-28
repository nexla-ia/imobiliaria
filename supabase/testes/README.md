# Bateria de testes do sistema

Testes de ponta a ponta contra o projeto Supabase de **desenvolvimento** (Asaas sandbox). Não rodar contra produção: os testes criam e apagam dados, removem e restauram parcelas no sandbox e excluem e reativam a conta da compradora de teste.

Pré-requisitos (dados de teste descritos no CLAUDE.md, seção 10):
- `supabase/functions/.env` (sandbox) e `apps/mobile/.env` preenchidos;
- compradores de teste: Comprador Teste Nexla (CPF 529.982.247-25) e Maria Teste Importação (CPF 111.444.777-35), com senha já definida;
- um admin de teste do painel (e-mail e senha em `ADMIN_EMAIL` e `SENHA_ADMIN`);
- `psql` no PATH (parte 3).

```bash
cd supabase/testes
export SENHA_A='senha do Comprador Teste' SENHA_B='senha da Maria'
export ADMIN_EMAIL='e-mail do admin de teste' SENHA_ADMIN='senha dele'
export PGPASSWORD='senha do banco' PG='host=aws-0-us-east-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.<ref> sslmode=require'
npx deno@2.9.6 run -A 1-acesso-e-isolamento.ts
npx deno@2.9.6 run -A 2-senha-operador-webhook.ts
npx deno@2.9.6 run -A 3-contrato-codigo-valores.ts
```

Nenhuma senha fica nos scripts: tudo vem das variáveis acima.

O limite de 10 validações de código por CPF por hora faz a parte 3 falhar se rodar duas vezes na mesma hora. Para repetir, limpe antes: `delete from rate_limits where chave like 'validar:%'`.
