import { getPool } from "../database/pool.js";

function safeChanges(changes) {
  if (!changes) return null;
  const copy = JSON.parse(JSON.stringify(changes));
  for (const key of Object.keys(copy)) {
    if (/password|token|secret|cookie/i.test(key)) delete copy[key];
  }
  return JSON.stringify(copy);
}

export const auditRepository = {
  async log({ userId = null, entityType, entityId = null, action, changes = null, ipAddress = null }, connection = getPool()) {
    await connection.execute(
      `INSERT INTO audit_logs (user_id, entity_type, entity_id, action, changes, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, entityType, entityId === null ? null : String(entityId), action, safeChanges(changes), ipAddress],
    );
  },
};
