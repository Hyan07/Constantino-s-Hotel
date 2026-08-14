import { randomUUID } from "node:crypto";
import { logger } from "../utils/logger.js";

export function requestContext(req, res, next) {
  req.requestId = req.get("x-request-id") || randomUUID();
  res.setHeader("x-request-id", req.requestId);
  const started = Date.now();
  res.on("finish", () => {
    logger.debug("Requisição concluída", {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - started,
    });
  });
  next();
}
