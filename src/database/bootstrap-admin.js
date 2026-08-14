import { config } from "../config/app-config.js";
import { getPool, withTransaction } from "./pool.js";
import { hashPassword } from "../security/password.js";
import { isValidCpf, normalizeCpf } from "../utils/cpf.js";

export async function bootstrapInitialAdmin({ requireVariables = false } = {}) {
  const [[countRow]] = await getPool().query("SELECT COUNT(*) AS total FROM users");
  if (Number(countRow.total) > 0) return { created: false, reason: "users_exist" };

  const admin = config.initialAdmin;
  const missing = Object.entries(admin)
    .filter(([, value]) => !value)
    .map(([key]) => `INITIAL_ADMIN_${key.replace(/([A-Z])/g, "_$1").toUpperCase()}`);
  if (missing.length) {
    if (!requireVariables) return { created: false, reason: "variables_missing", missing };
    throw new Error(`Preencha no .env: ${missing.join(", ")}.`);
  }
  const cpf = normalizeCpf(admin.cpf);
  if (!isValidCpf(cpf)) throw new Error("INITIAL_ADMIN_CPF não contém um CPF válido.");
  if (!/^\S+@\S+\.\S+$/.test(admin.email)) throw new Error("INITIAL_ADMIN_EMAIL não contém um e-mail válido.");
  const passwordHash = await hashPassword(admin.password);

  const userId = await withTransaction(async (connection) => {
    const [result] = await connection.execute(
      `INSERT INTO users (name, cpf, email, password_hash) VALUES (?, ?, ?, ?)`,
      [admin.name.trim(), cpf, admin.email.trim().toLowerCase(), passwordHash],
    );
    const [[role]] = await connection.execute("SELECT id FROM roles WHERE slug = 'administrator' LIMIT 1");
    if (!role) throw new Error("O perfil Administrador não foi encontrado. Execute as migrations.");
    await connection.execute("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [result.insertId, role.id]);
    await connection.execute(
      `INSERT INTO audit_logs (user_id, entity_type, entity_id, action, changes)
       VALUES (?, 'user', ?, 'initial_admin_created', JSON_OBJECT('name', ?))`,
      [result.insertId, String(result.insertId), admin.name.trim()],
    );
    return result.insertId;
  });
  return { created: true, userId };
}
