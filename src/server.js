import { createApp } from "./app.js";
import { config, validateApplicationConfig } from "./config/app-config.js";
import { testConnection, closePool } from "./database/pool.js";
import { runMigrations } from "./database/migration-runner.js";
import { bootstrapInitialAdmin } from "./database/bootstrap-admin.js";
import { logger } from "./utils/logger.js";
import { explainStartupError } from "./utils/startup-error.js";

let server;

async function startApplication() {
  validateApplicationConfig();
  await testConnection();

  const appliedMigrations = await runMigrations({
    log: (message) => logger.info(message),
  });
  if (appliedMigrations.length) {
    logger.info("Migrations aplicadas durante a inicialização.", { migrations: appliedMigrations });
  }

  const bootstrap = await bootstrapInitialAdmin({ requireVariables: true });
  if (bootstrap.created) logger.info("Administrador inicial criado com sucesso.");
  const app = createApp();
  server = app.listen(config.port, () => {
    logger.info(`Constantino's Hotel iniciado em ${config.appUrl}`, { environment: config.env, port: config.port });
  });
  return server;
}

async function shutdown(signal) {
  logger.info(`Encerrando aplicação (${signal})...`);
  if (server) await new Promise((resolve) => server.close(resolve));
  await closePool();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

startApplication().catch(async (error) => {
  logger.error(`Não foi possível iniciar o sistema. ${explainStartupError(error)}`, { code: error.code, message: error.message, stack: error.stack });
  await closePool();
  process.exitCode = 1;
});
