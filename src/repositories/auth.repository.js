import { getPool } from "../database/pool.js";

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    cpf: row.cpf,
    email: row.email,
    passwordHash: row.password_hash,
    active: Boolean(row.active),
    failedLoginAttempts: Number(row.failed_login_attempts || 0),
    lockedUntil: row.locked_until,
    lastLoginAt: row.last_login_at,
    roles: row.roles ? row.roles.split(",").filter(Boolean) : [],
    permissions: row.permissions ? row.permissions.split(",").filter(Boolean) : [],
  };
}

const userSelect = `
  SELECT u.*,
    GROUP_CONCAT(DISTINCT r.slug ORDER BY r.slug SEPARATOR ',') AS roles,
    GROUP_CONCAT(DISTINCT p.slug ORDER BY p.slug SEPARATOR ',') AS permissions
  FROM users u
  LEFT JOIN user_roles ur ON ur.user_id = u.id
  LEFT JOIN roles r ON r.id = ur.role_id AND r.active = TRUE
  LEFT JOIN role_permissions rp ON rp.role_id = r.id
  LEFT JOIN permissions p ON p.id = rp.permission_id
`;

export const authRepository = {
  async findUserByCpf(cpf, connection = getPool()) {
    const [rows] = await connection.execute(`${userSelect} WHERE u.cpf = ? GROUP BY u.id LIMIT 1`, [cpf]);
    return mapUser(rows[0]);
  },

  async findUserByIdentity(identity, connection = getPool()) {
    const [rows] = await connection.execute(
      `${userSelect} WHERE u.cpf = ? OR LOWER(u.email) = LOWER(?) GROUP BY u.id LIMIT 1`,
      [identity, identity],
    );
    return mapUser(rows[0]);
  },

  async findUserById(id, connection = getPool()) {
    const [rows] = await connection.execute(`${userSelect} WHERE u.id = ? GROUP BY u.id LIMIT 1`, [id]);
    return mapUser(rows[0]);
  },

  async recordFailedLogin(userId, attempts, lockedUntil) {
    await getPool().execute(
      "UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?",
      [attempts, lockedUntil, userId],
    );
  },

  async recordSuccessfulLogin(userId) {
    await getPool().execute(
      "UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?",
      [userId],
    );
  },

  async createSession({ userId, tokenHash, csrfTokenHash, expiresAt, ipAddress, userAgent }) {
    const [result] = await getPool().execute(
      `INSERT INTO sessions (user_id, token_hash, csrf_token_hash, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, tokenHash, csrfTokenHash, expiresAt, ipAddress || null, String(userAgent || "").slice(0, 500) || null],
    );
    return result.insertId;
  },

  async findSessionByTokenHash(tokenHash) {
    const [rows] = await getPool().execute(
      `SELECT s.id AS session_id, s.user_id, s.csrf_token_hash, s.expires_at, s.last_seen_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > NOW() AND u.active = TRUE
       LIMIT 1`,
      [tokenHash],
    );
    return rows[0] || null;
  },

  async touchSession(sessionId, expiresAt = null) {
    if (expiresAt) {
      await getPool().execute("UPDATE sessions SET last_seen_at = NOW(), expires_at = ? WHERE id = ?", [expiresAt, sessionId]);
    } else {
      await getPool().execute("UPDATE sessions SET last_seen_at = NOW() WHERE id = ?", [sessionId]);
    }
  },

  async revokeSession(sessionId) {
    await getPool().execute("UPDATE sessions SET revoked_at = NOW() WHERE id = ?", [sessionId]);
  },

  async revokeUserSessions(userId, connection = getPool()) {
    await connection.execute("UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL", [userId]);
  },

  async createPasswordResetToken({ userId, tokenHash, expiresAt }) {
    await getPool().execute(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL",
      [userId],
    );
    await getPool().execute(
      "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
      [userId, tokenHash, expiresAt],
    );
  },

  async findPasswordResetToken(tokenHash, connection = getPool()) {
    const [rows] = await connection.execute(
      `SELECT prt.id, prt.user_id, u.active
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token_hash = ? AND prt.used_at IS NULL AND prt.expires_at > NOW()
       LIMIT 1 FOR UPDATE`,
      [tokenHash],
    );
    return rows[0] || null;
  },

  async updatePassword(userId, passwordHash, connection = getPool()) {
    await connection.execute(
      "UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?",
      [passwordHash, userId],
    );
  },

  async markResetTokenUsed(tokenId, connection = getPool()) {
    await connection.execute("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?", [tokenId]);
  },
};
