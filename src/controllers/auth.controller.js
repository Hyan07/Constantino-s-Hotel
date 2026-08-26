import { config } from "../config/app-config.js";
import { authRepository } from "../repositories/auth.repository.js";
import { authService } from "../services/auth.service.js";
import { csrfCookieName, cookieOptions } from "../middleware/authentication.js";
import { ok } from "../utils/http.js";

export const authController = {
  async environment(_req, res) {
    return ok(res, {
      environment: config.env,
      passwordRecoveryEnabled: Boolean(config.smtp.host && config.smtp.from),
    });
  },

  async login(req, res) {
    const result = await authService.login({
      cpf: req.body.cpf,
      password: req.body.password,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });
    res.cookie(config.session.cookieName, result.token, cookieOptions({ expiresAt: result.expiresAt }));
    res.cookie(csrfCookieName, result.csrfToken, cookieOptions({ httpOnly: false, expiresAt: result.expiresAt }));
    return ok(res, { user: result.user, environment: config.env });
  },

  async session(req, res) {
    return ok(res, { user: authService.publicUser(req.user), environment: config.env });
  },

  async logout(req, res) {
    await authRepository.revokeSession(req.session.session_id);
    res.clearCookie(config.session.cookieName, cookieOptions());
    res.clearCookie(csrfCookieName, cookieOptions({ httpOnly: false }));
    return ok(res, { loggedOut: true });
  },

  async forgotPassword(req, res) {
    await authService.requestPasswordReset({ identity: req.body.identity });
    return ok(res, { message: "Se o cadastro existir e possuir e-mail, enviaremos as instruções." });
  },

  async resetPassword(req, res) {
    await authService.resetPassword({ token: req.body.token, password: req.body.password });
    return ok(res, { message: "Senha redefinida. Você já pode entrar." });
  },

  async changePassword(req, res) {
    await authService.changePassword({
      userId: req.user.id,
      currentPassword: req.body.currentPassword,
      newPassword: req.body.newPassword,
    });
    res.clearCookie(config.session.cookieName, cookieOptions());
    res.clearCookie(csrfCookieName, cookieOptions({ httpOnly: false }));
    return ok(res, { message: "Senha alterada. Entre novamente." });
  },
};
