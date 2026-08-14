import { config } from "../config/app-config.js";

function redact(value) {
  if (!value || typeof value !== "object") return value;
  const clone = Array.isArray(value) ? [...value] : { ...value };
  for (const key of Object.keys(clone)) {
    if (/password|secret|token|cookie|authorization/i.test(key)) clone[key] = "[REMOVIDO]";
    else if (clone[key] && typeof clone[key] === "object") clone[key] = redact(clone[key]);
  }
  return clone;
}

function emit(level, message, meta = undefined) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta: redact(meta) } : {}),
  };
  if (config.env === "production" || config.env === "staging") {
    console.log(JSON.stringify(payload));
    return;
  }
  const suffix = meta ? ` ${JSON.stringify(redact(meta))}` : "";
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
