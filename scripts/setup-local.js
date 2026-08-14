import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { config, validateApplicationConfig } from "../src/config/app-config.js";
import { runMigrations } from "../src/database/migration-runner.js";
import { bootstrapInitialAdmin } from "../src/database/bootstrap-admin.js";
import { closePool } from "../src/database/pool.js";
import { explainStartupError } from "../src/utils/startup-error.js";

const envPath = path.resolve(process.cwd(), ".env");
const examplePath = path.resolve(process.cwd(), ".env.example");

let currentStep = "validação do arquivo .env";

async function setup() {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < 22 || nodeMajor > 24) {
    throw new Error(`A versão atual do Node.js é ${process.versions.node}. Instale Node.js 22 LTS ou 24 e execute novamente.`);
  }
  if (!fs.existsSync(envPath)) {
    fs.copyFileSync(examplePath, envPath);
    throw new Error(
      "O arquivo .env não existia e foi criado a partir de .env.example. Abra o .env, revise DB_HOST/DB_PORT/DB_USER, informe DB_PASSWORD (se houver), SESSION_SECRET e todas as variáveis INITIAL_ADMIN_*; depois execute npm run setup:local novamente.",
    );
  }
  validateApplicationConfig();

  currentStep = "1/4 · conexão com o MySQL";
  console.log("1/4 Validando conexão com o MySQL...");
  const rootConnection = await mysql.createConnection({
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    charset: "utf8mb4",
  });
  try {
    await rootConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.database.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await rootConnection.end();
  }

  currentStep = "2/4 · criação do banco e migrations";
  console.log(`2/4 Banco ${config.database.name} pronto. Executando migrations...`);
  await runMigrations({ log: (message) => console.log(`    ${message}`) });

  currentStep = "3/4 · bootstrap do administrador inicial";
  console.log("3/4 Configurando o primeiro administrador...");
  const admin = await bootstrapInitialAdmin({ requireVariables: true });
  console.log(admin.created ? "    Administrador criado." : "    Administrador já existente; nenhuma alteração feita.");

  currentStep = "4/4 · conclusão";
  console.log("4/4 Validando a configuração concluída...");
  console.log("\nConfiguração local concluída com sucesso.");
  console.log(`Agora execute: npm run dev`);
  console.log(`Abra no navegador: ${config.appUrl}`);
}

try {
  await setup();
} catch (error) {
  console.error(`\nCONFIGURAÇÃO LOCAL NÃO CONCLUÍDA\nEtapa que falhou: ${currentStep}.\n${explainStartupError(error)}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
