import { migrationStatus } from "../src/database/migration-runner.js";
import { explainStartupError } from "../src/utils/startup-error.js";

try {
  const status = await migrationStatus();
  console.table(status);
  if (status.some((item) => item.status === "changed")) process.exitCode = 1;
} catch (error) {
  console.error(`Não foi possível consultar as migrations: ${explainStartupError(error)}`);
  process.exitCode = 1;
}
