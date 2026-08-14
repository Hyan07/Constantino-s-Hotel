import { AppError } from "../utils/app-error.js";
import { logger } from "../utils/logger.js";
import { config } from "../config/app-config.js";

export function notFound(req, res) {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ success: false, error: { code: "ROUTE_NOT_FOUND", message: "Recurso não encontrado." } });
  }
  return res.status(404).send("Página não encontrada.");
}

export function errorHandler(error, req, res, _next) {
  let normalized = error;
  if (error?.code === "ER_DUP_ENTRY") normalized = new AppError("DUPLICATE_RECORD", "Já existe um registro com estes dados.", 409);
  if (error?.code === "ER_NO_REFERENCED_ROW_2") normalized = new AppError("RELATED_RECORD_NOT_FOUND", "Um dos registros relacionados não existe.", 409);
  if (error?.type === "entity.parse.failed") normalized = new AppError("INVALID_JSON", "O conteúdo enviado não é válido.", 400);
  const expected = normalized instanceof AppError;
  const status = expected ? normalized.status : 500;
  if (!expected || status >= 500) {
    logger.error("Erro durante a requisição", {
      code: normalized.code,
      message: normalized.message,
      method: req.method,
      path: req.path,
      requestId: req.requestId,
      ...(config.env === "development" ? { stack: normalized.stack } : {}),
    });
  }
  const body = {
    success: false,
    error: {
      code: expected ? normalized.code : "INTERNAL_ERROR",
      message: expected ? normalized.message : "Não foi possível concluir a operação. Tente novamente.",
      ...(expected && normalized.details ? { details: normalized.details } : {}),
      requestId: req.requestId,
    },
  };
  return res.status(status).json(body);
}
