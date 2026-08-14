import { config } from "../config/app-config.js";
import { AppError } from "../utils/app-error.js";

export function enforceSameOrigin(req, _res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (!origin) return next();
  try {
    const expected = new URL(config.appUrl);
    const received = new URL(origin);
    if (expected.origin !== received.origin) {
      return next(new AppError("ORIGIN_NOT_ALLOWED", "Origem da requisição não permitida.", 403));
    }
  } catch {
    return next(new AppError("ORIGIN_NOT_ALLOWED", "Origem da requisição não permitida.", 403));
  }
  return next();
}
