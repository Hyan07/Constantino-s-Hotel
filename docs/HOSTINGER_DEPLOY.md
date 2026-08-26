# Deploy GitHub → Hostinger

Este guia foi preparado para o Web App Node.js gerenciado da Hostinger, com Express e MySQL. O painel pode alterar pequenos rótulos; consulte também a [documentação oficial de Node.js](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/).

## Pré-requisitos

- plano Hostinger com Web Apps Node.js;
- repositório GitHub contendo `main` e `develop`;
- domínio de produção e subdomínio DEV;
- dois bancos MySQL e dois usuários independentes;
- Node.js 22 selecionado nos dois apps.

## Isolamento obrigatório

| Item | DEV | Produção |
|---|---|---|
| Branch | `develop` | `main` |
| URL | `https://dev.seudominio.com.br` | `https://seudominio.com.br` |
| `APP_ENV` | `staging` | `production` |
| Banco | `..._hotel_dev` | `..._hotel_prod` |
| Usuário MySQL | exclusivo DEV | exclusivo produção |
| `SESSION_SECRET` | exclusiva DEV | exclusiva produção |
| Dados | fictícios | reais |
| Cookie | `constantinos_dev_session` | `constantinos_session` |

Nunca aponte DEV para o banco de produção e nunca copie hóspedes reais para DEV.

## 1. Criar os bancos

No hPanel, em **Websites → Dashboard → Databases/Management**, crie banco e usuário para produção; repita com nomes e senha diferentes para DEV. Guarde host, porta, banco, usuário e senha no gerenciador de senhas. A Hostinger descreve o fluxo atual em [Criar banco MySQL](https://www.hostinger.com/support/1583542-how-to-create-a-new-mysql-database-in-hostinger/) e [Conectar MySQL ao Node.js](https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/).

## 2. Aplicação de produção

1. hPanel → **Websites → Add Website → Deploy Web App**.
2. Escolha **Import Git Repository** e autorize somente o repositório necessário.
3. Selecione o repositório e a branch `main`.
4. Framework: Express ou `Other` se a detecção não encontrar Express.
5. Node.js: **22.x**.
6. Instalação: `npm ci` (ou a opção automática do painel).
7. Build: nenhum build de frontend é necessário.
8. Start command: `npm start`.
9. Entry file, se solicitado: `src/server.js`.
10. Não configure output directory; o Express serve `public/`.
11. Conecte o domínio de produção e ative HTTPS.

Defina variáveis no painel, nunca no GitHub. O bloco SMTP é opcional; sem ele,
a recuperação de senha por e-mail fica indisponível e o administrador ainda
pode redefinir o acesso do usuário:

```dotenv
APP_ENV=production
APP_URL=https://seudominio.com.br
APP_TIMEZONE=America/Sao_Paulo
TRUST_PROXY=1
DB_HOST=HOST_EXIBIDO_NO_HPanel
DB_PORT=3306
DB_NAME=BANCO_PRODUCAO
DB_USER=USUARIO_PRODUCAO
DB_PASSWORD=SENHA_PRODUCAO
DB_CONNECTION_LIMIT=10
SESSION_SECRET=SEGREDO_ALEATORIO_UNICO_COM_32_OU_MAIS_CARACTERES
SESSION_TTL_HOURS=12
SESSION_COOKIE_NAME=constantinos_session
SMTP_HOST=SEU_SMTP
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=USUARIO_SMTP
SMTP_PASSWORD=SENHA_SMTP
SMTP_FROM=Constantino's Hotel <nao-responda@seudominio.com.br>
INITIAL_ADMIN_NAME=Administrador
INITIAL_ADMIN_CPF=CPF_VALIDO
INITIAL_ADMIN_EMAIL=EMAIL_ADMIN
INITIAL_ADMIN_PASSWORD=SENHA_INICIAL_FORTE
```

Use a `PORT` fornecida/injetada pelo Web App. Se o painel exigir valor explícito, use o valor indicado por ele; o servidor lê `process.env.PORT`. A Hostinger permite importar ou cadastrar variáveis no deploy e não as grava no repositório: [variáveis de ambiente](https://www.hostinger.com/support/how-to-add-environment-variables-during-node-js-application-deployment/).

Clique em Deploy. `npm start` aplica migrations pendentes por meio de `prestart` e inicia o Express; na primeira inicialização, o administrador é criado. Teste login e `/health`. Depois confirme que há um usuário administrador no banco, remova `INITIAL_ADMIN_*` do painel e redeploy. O bootstrap nunca recria administrador quando já existem usuários.

## 3. Aplicação DEV

Repita a criação de Web App como uma segunda aplicação:

1. conecte o mesmo repositório;
2. selecione `develop`;
3. conecte o subdomínio DEV;
4. selecione Node.js 22 e `npm start`;
5. use `APP_ENV=staging` e a URL DEV;
6. use exclusivamente banco/usuário/segredo DEV;
7. defina administrador DEV diferente;
8. jamais execute seed com dados reais; se houver acesso a comando, use apenas dados fictícios.

Staging envia `X-Robots-Tag: noindex, nofollow, noarchive` e `/robots.txt` bloqueia indexação.

## 4. Validação depois do deploy

- `/health` responde `200` e `{"status":"ok"}`;
- login funciona com o administrador correto do ambiente;
- cabeçalho DEV identifica ambiente não produtivo;
- criar hóspede fictício, reserva e verificar calendário;
- confirmar conflito de quarto;
- executar check-in, consumo, pagamento, check-out e limpeza;
- usuário Recepção não acessa Administração;
- reiniciar/redeploy e confirmar persistência;
- verificar que cookies DEV e produção possuem nomes diferentes;
- revisar logs sem senhas ou CPF completo.

## 5. Deploy contínuo e logs

Push/merge na branch conectada aciona o deploy correspondente. Alterações de variáveis exigem **Settings and redeploy**. Para falhas, abra **Dashboard → Deployments** e inspecione build/runtime logs: [logs de runtime](https://www.hostinger.com/support/how-to-use-node-js-runtime-logs-at-hostinger/) e [falhas de build](https://www.hostinger.com/support/how-to-troubleshoot-a-failed-node-js-deployment-using-build-logs/).

## 6. Backups e rollback

Antes de merge `develop → main` com migration:

1. hPanel → Backups → criar backup manual;
2. confirmar que o backup do banco terminou;
3. manter exportação adicional conforme a política do hotel;
4. só então liberar produção.

Guia oficial: [criar backup](https://www.hostinger.com/support/2298928-how-to-create-backups-at-hostinger/) e [baixar backup](https://www.hostinger.com/support/5981435-how-to-download-backups-at-hostinger/).

Para rollback de código, faça `git revert` via PR em `main`; a Hostinger redeploya o commit revertido. Não reverta schema apagando colunas automaticamente. Restauração do banco é último recurso e deve partir de backup testado.
