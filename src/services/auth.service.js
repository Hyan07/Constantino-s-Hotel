import { addMinutes, addHours, isAfter } from "../utils/time.js";
import { AppError } from "../utils/app-error.js";
import { isValidCpf, maskCpf, normalizeCpf } from "../utils/cpf.js";
import { hashPassword, verifyPassword } from "../security/password.js";
import { createToken, hashToken } from "../security/tokens.js";
import { authRepository } from "../repositories/auth.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { withTransaction } from "../database/pool.js";
import { config } from "../config/app-config.js";
import { sendPasswordResetEmail } from "./email.service.js";

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  cpf: maskCpf(user.cpf),
  email: user.email,
  roles: user.roles,
  permissions: user.permissions,
  lastLoginAt: user.lastLoginAt,
});

export const authService = {
  async login({ cpf, password, ipAddress, userAgent }) {
    const normalizedCpf = normalizeCpf(cpf);
    if (!isValidCpf(normalizedCpf) || !password) {
      throw new AppError("INVALID_CREDENTIALS", "CPF ou senha inválidos.", 401);
    }
    const user = await authRepository.findUserByCpf(normalizedCpf);
    if (!user || !user.active) {
      await auditRepository.log({ entityType: "authentication", action: "login_failed", ipAddress });
      throw new AppError("INVALID_CREDENTIALS", "CPF ou senha inválidos.", 401);
    }
    if (user.lockedUntil && isAfter(user.lockedUntil, new Date())) {
      throw new AppError("LOGIN_TEMPORARILY_LOCKED", "Muitas tentativas. Aguarde alguns minutos e tente novamente.", 429);
    }
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const lockedUntil = attempts >= 5 ? addMinutes(new Date(), 15) : null;
      await authRepository.recordFailedLogin(user.id, attempts >= 5 ? 0 : attempts, lockedUntil);
      await auditRepository.log({ userId: user.id, entityType: "authentication", entityId: user.id, action: "login_failed", ipAddress });
      throw new AppError("INVALID_CREDENTIALS", "CPF ou senha inválidos.", 401);
    }

    await authRepository.recordSuccessfulLogin(user.id);
    const token = createToken();
    const csrfToken = createToken();
    const expiresAt = addHours(new Date(), config.session.ttlHours);
    await authRepository.createSession({
      userId: user.id,
      tokenHash: hashToken(token),
      csrfTokenHash: hashToken(csrfToken),
      expiresAt,
      ipAddress,
      userAgent,
    });
    await auditRepository.log({ userId: user.id, entityType: "authentication", entityId: user.id, action: "login_success", ipAddress });
    return { token, csrfToken, expiresAt, user: publicUser({ ...user, lastLoginAt: new Date().toISOString() }) };
  },

  async requestPasswordReset({ identity }) {
    if (!config.smtp.host || !config.smtp.from) {
      throw new AppError(
        "PASSWORD_RECOVERY_UNAVAILABLE",
        "A recuperação de senha está temporariamente indisponível. Procure um administrador.",
        503,
      );
    }
    const normalized = normalizeCpf(identity);
    const lookup = normalized.length === 11 ? normalized : String(identity || "").trim().toLowerCase();
    const user = await authRepository.findUserByIdentity(lookup);
    if (!user || !user.active || !user.email) return;
    const token = createToken();
    await authRepository.createPasswordResetToken({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: addMinutes(new Date(), 30),
    });
    const resetUrl = `${config.appUrl}/login.html?reset=${encodeURIComponent(token)}`;
    await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
    await auditRepository.log({ userId: user.id, entityType: "authentication", entityId: user.id, action: "password_reset_requested" });
  },

  async resetPassword({ token, password }) {
    const passwordHash = await hashPassword(password);
    await withTransaction(async (connection) => {
      const record = await authRepository.findPasswordResetToken(hashToken(token), connection);
      if (!record || !record.active) throw new AppError("INVALID_RESET_TOKEN", "Este link é inválido ou expirou.", 400);
      await authRepository.updatePassword(record.user_id, passwordHash, connection);
      await authRepository.markResetTokenUsed(record.id, connection);
      await authRepository.revokeUserSessions(record.user_id, connection);
      await auditRepository.log({
        userId: record.user_id,
        entityType: "authentication",
        entityId: record.user_id,
        action: "password_reset_completed",
      }, connection);
    });
  },

  async changePassword({ userId, currentPassword, newPassword }) {
    const user = await authRepository.findUserById(userId);
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new AppError("INVALID_CURRENT_PASSWORD", "A senha atual está incorreta.", 400);
    }
    const passwordHash = await hashPassword(newPassword);
    await withTransaction(async (connection) => {
      await authRepository.updatePassword(userId, passwordHash, connection);
      await authRepository.revokeUserSessions(userId, connection);
      await auditRepository.log({ userId, entityType: "user", entityId: userId, action: "password_changed" }, connection);
    });
  },

  publicUser,
};
