import { seedDevelopment } from "../src/database/seeds/development.js";
import { closePool } from "../src/database/pool.js";
import { explainStartupError } from "../src/utils/startup-error.js";

try {
  await seedDevelopment();
  console.log("Dados fictícios de desenvolvimento inseridos com sucesso.");
} catch (error) {
  console.error(`Falha no seed de dados fictícios: ${explainStartupError(error)}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
