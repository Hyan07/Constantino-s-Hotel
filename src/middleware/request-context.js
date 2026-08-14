import { randomUUID } from "node:crypto";
import { logger } from "../utils/logger.js";

const validRequestId = /^[A-Za-z0-9._:-]{1,100}$/;

export function requestContext(req, res, next) {
  const receivedRequestId = req.get("x-request-id");
  req.requestId = receivedRequestId && validRequestId.test(receivedRequestId) ? receivedRequestId : randomUUID();
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
