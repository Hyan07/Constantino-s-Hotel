import { runMigrations } from "../src/database/migration-runner.js";
import { closePool } from "../src/database/pool.js";
import { explainStartupError } from "../src/utils/startup-error.js";

try {
  const applied = await runMigrations();
  console.log(applied.length ? `Migrations aplicadas: ${applied.join(", ")}` : "Banco já está atualizado.");
} catch (error) {
  console.error(`Falha na etapa de migrations: ${explainStartupError(error)}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
