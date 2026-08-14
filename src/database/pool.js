import mysql from "mysql2/promise";
import { config, validateDatabaseConfig } from "../config/app-config.js";

let pool;

export function getPool() {
  if (!pool) {
    validateDatabaseConfig();
    pool = mysql.createPool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      password: config.database.password,
      waitForConnections: true,
      connectionLimit: config.database.connectionLimit,
      queueLimit: 0,
      decimalNumbers: true,
      dateStrings: true,
      charset: "utf8mb4",
      enableKeepAlive: true,
    });
  }
  return pool;
}

export async function testConnection() {
  const connection = await getPool().getConnection();
  try {
    await connection.query("SELECT 1 AS ok");
    return true;
  } finally {
    connection.release();
  }
}

export async function withTransaction(work, { isolation = "READ COMMITTED" } = {}) {
  const connection = await getPool().getConnection();
  try {
    await connection.query(`SET TRANSACTION ISOLATION LEVEL ${isolation}`);
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function closePool() {
  if (pool) await pool.end();
  pool = undefined;
}
