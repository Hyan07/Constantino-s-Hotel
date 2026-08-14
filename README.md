# Constantino's Hotel Management System

Sistema web completo para a operação do Constantino's Hotel: reservas, calendário hoteleiro, hóspedes, check-in, hospedagens, consumos, pagamentos, check-out, limpeza, manutenção, quartos, usuários, permissões e auditoria.

## Execução local em dois comandos

Depois de instalar **Node.js 22 LTS** e **MySQL 8**, não é necessário iniciar frontend e backend separadamente. O Express serve a interface e a API no mesmo processo e endereço.

```powershell
npm install
copy .env.example .env
```

Edite apenas o `.env` e então execute:

```powershell
npm run setup:local
npm run dev
```

Acesse **http://localhost:3000**. O `setup:local` valida as variáveis, testa o MySQL, cria o banco quando permitido, executa migrations e cria o primeiro administrador. Depois da configuração inicial, somente `npm run dev` é necessário.

Instruções minuciosas para Windows e solução de erros: [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md).

## Stack

- Frontend: HTML5, CSS modular, JavaScript ES Modules e Lucide Icons.
- Aplicação: Node.js 22+, Express 5, uma única origem HTTP.
- Persistência: MySQL 8 com `mysql2/promise`, transações e migrations SQL.
- Autenticação: CPF + senha, sessão opaca persistida no MySQL e proteção CSRF.
- E-mail: SMTP com Nodemailer para recuperação de senha.
- Qualidade: ESLint, Node Test Runner, E2E e GitHub Actions.

## Arquitetura

```text
Navegador
  └── http://localhost:3000
        └── Express
              ├── arquivos em public/
              ├── API /api/*
              └── camadas controller → service → repository → MySQL
```

As regras de negócio ficam em `services`; SQL fica em `repositories`; controllers apenas traduzem HTTP. Operações críticas — disponibilidade, reserva, check-in, pagamentos, check-out, limpeza e manutenção — validam estado no servidor. Reserva e check-in usam transações e bloqueio do quarto.

Estrutura principal:

```text
public/                 interface servida pelo Express
src/config/             ambiente e validação
src/database/           pool, migrations, seed e bootstrap
src/routes/             rotas Express
src/controllers/        adaptação HTTP
src/services/           regras e transações
src/repositories/       consultas MySQL parametrizadas
src/middleware/         sessão, CSRF, origem, erros e logs
src/security/           senha e tokens
scripts/                setup local e operações
tests/                  unitários, integração e E2E
docs/                   operação, deploy e Git
.github/workflows/      CI
```

## Variáveis de ambiente

Use `.env.example` como modelo. Nunca versione `.env`.

| Grupo | Variáveis |
|---|---|
| Aplicação | `APP_ENV`, `PORT`, `APP_URL`, `APP_TIMEZONE`, `TRUST_PROXY` |
| MySQL | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_CONNECTION_LIMIT` |
| Sessão | `SESSION_SECRET`, `SESSION_TTL_HOURS`, `SESSION_COOKIE_NAME` |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` |
| Bootstrap | `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_CPF`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` |

`SESSION_SECRET` deve ter no mínimo 32 caracteres. A senha inicial deve ter no mínimo 12 caracteres e combinar maiúscula, minúscula, número e símbolo. CPF e e-mail do administrador são validados.

## Banco, migrations e seed

```powershell
npm run migrate
npm run migrate:status
npm run seed:dev
```

- Migrations são incrementais e registradas em `schema_migrations` com checksum.
- Nunca altere uma migration já aplicada; crie uma nova.
- `seed:dev` só aceita `APP_ENV=development` e cria dados completamente fictícios.
- Produção não recebe seed e nenhum script destrói tabelas ou dados.
- `npm start` executa migrations pendentes antes de iniciar, útil no deploy gerenciado.

## Funcionalidades

- login por CPF, bloqueio após tentativas, sessão renovável, logout e recuperação por SMTP;
- dashboard com ocupação, chegadas, saídas, pendências e ritmo de 7 dias;
- reservas em lista, cards e calendário de 15 dias;
- assistente de reserva em cinco etapas, reserva sem quarto e controle de conflitos;
- check-in, extensão, consumos, pagamentos parciais e check-out condicionado ao saldo;
- mapa de quartos por andar, limpeza e manutenção com histórico;
- hóspedes com cadastro, contato, endereço e histórico;
- administração de usuários, perfis, categorias, quartos e dados do hotel;
- trilha de auditoria e busca global;
- estados vazios, carregamento, feedbacks, drawers, modais e layout responsivo.

## Scripts

| Comando | Finalidade |
|---|---|
| `npm run setup:local` | valida `.env`, MySQL, migrations e administrador |
| `npm run dev` | aplica migrations pendentes e inicia todo o sistema com recarga automática |
| `npm start` | executa migrations e inicia em modo de hospedagem |
| `npm run migrate` | aplica migrations pendentes |
| `npm run migrate:status` | lista migrations e checksums |
| `npm run seed:dev` | insere dados fictícios no ambiente local |
| `npm run lint` | valida JavaScript |
| `npm test` | testes unitários e de integração |
| `npm run test:e2e` | fluxo E2E; exige `RUN_E2E=true` e MySQL preparado |
| `npm run check` | confere a estrutura obrigatória antes do ZIP |

## Testes

O E2E automatiza: login → hóspede → quarto → reserva → calendário → check-in → consumo → pagamento → check-out → limpeza → quarto disponível. A CI sobe um MySQL efêmero, aplica migrations e executa lint e todos os testes sem credenciais reais.

Veja [docs/TESTING.md](docs/TESTING.md).

## Segurança e privacidade

- senha com `scrypt`, salt exclusivo e comparação segura;
- tokens aleatórios armazenados somente como hash;
- cookies `HttpOnly`, `SameSite=Strict` e `Secure` em produção;
- proteção CSRF e validação de mesma origem;
- rate limit e bloqueio temporário de login;
- consultas parametrizadas, validação no servidor e respostas padronizadas;
- Helmet/CSP, sem `x-powered-by`, noindex em local/staging;
- CPF mascarado em listagens e ausência de dados sensíveis em logs;
- permissões verificadas em todas as rotas restritas;
- registros operacionais preservados; desativação substitui exclusão destrutiva.

## GitHub, staging e produção

Fluxo oficial:

```text
feature/* → PR develop → Hostinger DEV → validação → PR develop→main → Hostinger produção
```

Não faça push direto em `main`. DEV e produção devem ter banco, usuário MySQL, `SESSION_SECRET`, `APP_URL`, cookie e dados separados.

- [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md)
- [docs/HOSTINGER_DEPLOY.md](docs/HOSTINGER_DEPLOY.md)
- [docs/OPERATIONS.md](docs/OPERATIONS.md)
- [docs/API.md](docs/API.md)
- [docs/VALIDATION_REPORT.md](docs/VALIDATION_REPORT.md)

## Health check

`GET /health` retorna `200 {"status":"ok"}` quando o processo e o MySQL respondem, ou `503` quando o banco está indisponível.

## Licença e dados

Projeto privado do Constantino's Hotel. Os dados do seed e dos testes são fictícios. Não copie hóspedes reais de produção para DEV.
