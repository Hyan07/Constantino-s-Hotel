import { timingSafeEqual } from "node:crypto";
import { config } from "../config/app-config.js";
import { authRepository } from "../repositories/auth.repository.js";
import { hashToken } from "../security/tokens.js";
import { AppError } from "../utils/app-error.js";
import { addHours } from "../utils/time.js";

export const csrfCookieName = `${config.session.cookieName}_csrf`;

export function cookieOptions({ httpOnly = true, expiresAt = undefined } = {}) {
  return {
    httpOnly,
    secure: ["production", "staging"].includes(config.env),
    sameSite: "strict",
    path: "/",
    ...(expiresAt ? { expires: new Date(expiresAt) } : {}),
  };
}

export async function authenticate(req, _res, next) {
  try {
    const token = req.cookies?.[config.session.cookieName];
    if (!token) throw new AppError("AUTHENTICATION_REQUIRED", "Sua sessão expirou. Entre novamente.", 401);
    const session = await authRepository.findSessionByTokenHash(hashToken(token));
    if (!session) throw new AppError("AUTHENTICATION_REQUIRED", "Sua sessão expirou. Entre novamente.", 401);
    const user = await authRepository.findUserById(session.user_id);
    if (!user || !user.active) throw new AppError("AUTHENTICATION_REQUIRED", "Sua sessão expirou. Entre novamente.", 401);
    req.session = session;
    req.user = user;
    const expires = new Date(session.expires_at).getTime();
    if (expires - Date.now() < (config.session.ttlHours * 3_600_000) / 2) {
      await authRepository.touchSession(session.session_id, addHours(new Date(), config.session.ttlHours));
    } else if (Date.now() - new Date(session.last_seen_at).getTime() > 5 * 60_000) {
      await authRepository.touchSession(session.session_id);
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePermission(permission) {
  return (req, _res, next) => {
    if (!req.user?.permissions?.includes(permission)) {
      return next(new AppError("FORBIDDEN", "Você não possui permissão para esta ação.", 403));
    }
    return next();
  };
}

export function verifyCsrf(req, _res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const cookieToken = req.cookies?.[csrfCookieName];
  const headerToken = req.get("x-csrf-token");
  if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length) {
    return next(new AppError("INVALID_CSRF_TOKEN", "A página expirou. Atualize e tente novamente.", 403));
  }
  const equal = timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));
  if (!equal || hashToken(headerToken) !== req.session.csrf_token_hash) {
    return next(new AppError("INVALID_CSRF_TOKEN", "A página expirou. Atualize e tente novamente.", 403));
  }
  return next();
}
