import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { config, validateDatabaseConfig } from "../config/app-config.js";

const migrationsDir = path.resolve(process.cwd(), "src/database/migrations");
const connectionCharset = "utf8mb4_unicode_ci";

async function migrationConnection() {
  validateDatabaseConfig();
  return mysql.createConnection({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
    charset: connectionCharset,
    multipleStatements: true,
    dateStrings: true,
  });
}

async function ensureMigrationTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      migration VARCHAR(255) NOT NULL UNIQUE,
      checksum CHAR(64) NOT NULL,
      executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function files() {
  return (await fs.readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
}

async function checksum(contents) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(contents).digest("hex");
}

export async function migrationStatus() {
  const connection = await migrationConnection();
  try {
    await ensureMigrationTable(connection);
    const [executedRows] = await connection.query("SELECT migration, checksum, executed_at FROM schema_migrations");
    const executed = new Map(executedRows.map((row) => [row.migration, row]));
    const result = [];
    for (const file of await files()) {
      const contents = await fs.readFile(path.join(migrationsDir, file), "utf8");
      const fileChecksum = await checksum(contents);
      const existing = executed.get(file);
      result.push({
        migration: file,
        status: existing ? (existing.checksum === fileChecksum ? "executed" : "changed") : "pending",
        executedAt: existing?.executed_at || null,
      });
    }
    return result;
  } finally {
    await connection.end();
  }
}

export async function runMigrations({ log = console.log } = {}) {
  const connection = await migrationConnection();
  const applied = [];
  try {
    await ensureMigrationTable(connection);
    const [executedRows] = await connection.query("SELECT migration, checksum FROM schema_migrations");
    const executed = new Map(executedRows.map((row) => [row.migration, row.checksum]));
    for (const file of await files()) {
      const contents = await fs.readFile(path.join(migrationsDir, file), "utf8");
      const fileChecksum = await checksum(contents);
      if (executed.has(file)) {
        if (executed.get(file) !== fileChecksum) {
          throw new Error(`A migration ${file} foi alterada depois de executada. Crie uma nova migration.`);
        }
        continue;
      }
      log(`Executando migration ${file}...`);
      await connection.query(contents);
      await connection.execute(
        "INSERT INTO schema_migrations (migration, checksum) VALUES (?, ?)",
        [file, fileChecksum],
      );
      applied.push(file);
    }
    return applied;
  } finally {
    await connection.end();
  }
}
