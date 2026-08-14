import { config } from "../config/app-config.js";

const sensitiveKeyPattern = /password|secret|token|cookie|authorization|cpf|email|phone|identity|address|postal|street/i;

function redact(value) {
  if (!value || typeof value !== "object") return value;
  const clone = Array.isArray(value) ? [...value] : { ...value };
  for (const key of Object.keys(clone)) {
    if (sensitiveKeyPattern.test(key)) clone[key] = "[REMOVIDO]";
    else if (clone[key] && typeof clone[key] === "object") clone[key] = redact(clone[key]);
  }
  return clone;
}

function emit(level, message, meta = undefined) {
  const safeMeta = meta ? redact(meta) : undefined;
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(safeMeta ? { meta: safeMeta } : {}),
  };
  if (config.env === "production" || config.env === "staging") {
    console.log(JSON.stringify(payload));
    return;
  }
  const suffix = safeMeta ? ` ${JSON.stringify(safeMeta)}` : "";
  console[level === "error" ? "error" : "log"](`[${payload.timestamp}] ${level.toUpperCase()} ${message}${suffix}`);
}

export const logger = {
  info: (message, meta) => emit("info", message, meta),
  warn: (message, meta) => emit("warn", message, meta),
  error: (message, meta) => emit("error", message, meta),
  debug: (message, meta) => {
    if (["development", "test"].includes(config.env)) emit("debug", message, meta);
  },
};
