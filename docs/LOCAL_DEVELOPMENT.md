# Desenvolvimento local no Windows

## Resultado esperado

Há somente um servidor: o Express. Ele entrega a interface e a API em `http://localhost:3000`. Não abra outro terminal para frontend e não use Live Server.

## 1. Pré-requisitos

- Windows 10 ou 11;
- Node.js 22 LTS ou 24;
- MySQL Server 8 em execução;
- PowerShell ou Prompt de Comando.

Confirme:

```powershell
node --version
npm --version
mysql --version
```

Se `mysql` não estiver no PATH, isso não impede a aplicação; confirme o serviço em `Win + R` → `services.msc` → serviço iniciado com nome semelhante a `MySQL80`.

## 2. Instalação

No diretório do projeto:

```powershell
npm install
copy .env.example .env
notepad .env
```

Preencha no mínimo:

```dotenv
APP_ENV=development
PORT=3000
APP_URL=http://localhost:3000

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=constantinos_hotel_local
DB_USER=root
DB_PASSWORD=SENHA_DEFINIDA_NO_MYSQL_INSTALLER

SESSION_SECRET=uma_frase_aleatoria_local_com_mais_de_32_caracteres

INITIAL_ADMIN_NAME=Administrador Local
INITIAL_ADMIN_CPF=SEU_CPF_VALIDO
INITIAL_ADMIN_EMAIL=seu-email@example.com
INITIAL_ADMIN_PASSWORD=UmaSenha!Forte2026
```

Senha vazia do MySQL é aceita somente se seu MySQL local realmente estiver configurado assim. Não use aspas em torno dos valores. Se um valor contiver `#`, use aspas duplas.

## 3. Configuração única

```powershell
npm run setup:local
```

O comando, nesta ordem:

1. valida cada variável obrigatória;
2. testa `DB_HOST`, `DB_PORT`, `DB_USER` e `DB_PASSWORD`;
3. cria `DB_NAME` se o usuário possuir permissão;
4. aplica migrations;
5. cria o administrador quando ainda não há usuários;
6. informa a próxima ação.

Pode ser executado novamente com segurança. Migrations já aplicadas e administrador existente são preservados.

## 4. Uso diário

```powershell
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Encerre com `Ctrl+C`. Na próxima vez, basta repetir `npm run dev`.

## Dados fictícios opcionais

```powershell
npm run seed:dev
```

O seed cria categorias, 24 quartos e cadastros fictícios. Ele é bloqueado fora de `APP_ENV=development`.

## Erros explicados

| Mensagem | Causa e correção |
|---|---|
| `DB_NAME não foi informado` | preencha exatamente `DB_NAME` no `.env` |
| `SESSION_SECRET deve possuir...` | defina ao menos 32 caracteres em `SESSION_SECRET` |
| `MySQL não respondeu em DB_HOST...` | inicie o serviço MySQL e confirme host/porta |
| `MySQL recusou DB_USER...` | corrija `DB_USER` e `DB_PASSWORD` |
| `não tem permissão para criar ou usar o banco` | use um usuário com `CREATE` ou crie o banco manualmente |
| `INITIAL_ADMIN_CPF não contém um CPF válido` | informe CPF real e válido, somente no seu `.env` local |
| `INITIAL_ADMIN_PASSWORD...` | use 12+ caracteres com os quatro grupos exigidos |
| `PORT=3000 já está em uso` | encerre o outro processo ou altere `PORT` e `APP_URL` juntos |
| `migration ... foi alterada` | restaure a migration aplicada e crie uma nova migration |

Para descobrir um processo na porta 3000:

```powershell
netstat -ano | findstr :3000
tasklist /FI "PID eq NUMERO_ENCONTRADO"
```

Não finalize um processo que você não reconhece. Outra alternativa é usar `PORT=3001` e `APP_URL=http://localhost:3001`.

## MySQL com usuário dedicado (opcional)

Para não usar `root`, execute no MySQL como administrador e escolha uma senha própria:

```sql
CREATE DATABASE constantinos_hotel_local CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'constantinos_local'@'localhost' IDENTIFIED BY 'SENHA_FORTE_AQUI';
GRANT ALL PRIVILEGES ON constantinos_hotel_local.* TO 'constantinos_local'@'localhost';
FLUSH PRIVILEGES;
```

Depois ajuste `DB_USER` e `DB_PASSWORD` no `.env`.
