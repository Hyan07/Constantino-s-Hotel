import "./env.js";
import { AppError } from "../utils/app-error.js";

const integer = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new AppError("CONFIG_INVALID", `A variável ${name} deve ser um número inteiro.`, 500);
  }
  return value;
};

const boolean = (name, fallback = false) => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (["true", "1", "yes", "sim"].includes(raw.toLowerCase())) return true;
  if (["false", "0", "no", "nao", "não"].includes(raw.toLowerCase())) return false;
  throw new AppError("CONFIG_INVALID", `A variável ${name} deve ser true ou false.`, 500);
};

export const config = Object.freeze({
  env: process.env.APP_ENV || "development",
  port: integer("PORT", 3000),
  appUrl: process.env.APP_URL || "http://localhost:3000",
  timezone: process.env.APP_TIMEZONE || "America/Sao_Paulo",
  trustProxy: integer("TRUST_PROXY", 0),
  database: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: integer("DB_PORT", 3306),
    name: process.env.DB_NAME || "",
    user: process.env.DB_USER || "",
    password: process.env.DB_PASSWORD || "",
    connectionLimit: integer("DB_CONNECTION_LIMIT", 10),
  },
  session: {
    secret: process.env.SESSION_SECRET || "",
    ttlHours: integer("SESSION_TTL_HOURS", 12),
    cookieName: process.env.SESSION_COOKIE_NAME || (
      (process.env.APP_ENV || "development") === "production"
        ? "constantinos_session"
        : "constantinos_dev_session"
    ),
  },
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: integer("SMTP_PORT", 587),
    secure: boolean("SMTP_SECURE", false),
    user: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASSWORD || "",
    from: process.env.SMTP_FROM || "",
  },
  initialAdmin: {
    name: process.env.INITIAL_ADMIN_NAME || "",
    cpf: process.env.INITIAL_ADMIN_CPF || "",
    email: process.env.INITIAL_ADMIN_EMAIL || "",
    password: process.env.INITIAL_ADMIN_PASSWORD || "",
  },
});

export function validateDatabaseConfig({ allowEmptyPassword = true } = {}) {
  const errors = [];
  if (!config.database.host) errors.push("DB_HOST não foi informado.");
  if (!config.database.name) errors.push("DB_NAME não foi informado.");
  if (!config.database.user) errors.push("DB_USER não foi informado.");
  if (!allowEmptyPassword && !config.database.password) errors.push("DB_PASSWORD não foi informado.");
  if (!/^[a-zA-Z0-9_]+$/.test(config.database.name || "")) {
    errors.push("DB_NAME deve conter somente letras, números e sublinhado.");
  }
  if (config.database.port < 1 || config.database.port > 65535) errors.push("DB_PORT deve estar entre 1 e 65535.");
  if (config.database.connectionLimit < 1 || config.database.connectionLimit > 100) errors.push("DB_CONNECTION_LIMIT deve estar entre 1 e 100.");
  if (errors.length) {
    throw new AppError("CONFIG_DATABASE_INVALID", errors.join(" "), 500, { errors });
  }
}

export function validateApplicationConfig() {
  validateDatabaseConfig();
  const errors = [];
  if (!["development", "staging", "production", "test"].includes(config.env)) {
    errors.push("APP_ENV deve ser development, staging, production ou test.");
  }
  if (config.session.secret.length < 32) {
    errors.push("SESSION_SECRET deve possuir pelo menos 32 caracteres.");
  }
  if (config.port < 1 || config.port > 65535) errors.push("PORT deve estar entre 1 e 65535.");
  if (config.session.ttlHours < 1 || config.session.ttlHours > 168) errors.push("SESSION_TTL_HOURS deve estar entre 1 e 168.");
  if (config.trustProxy < 0 || config.trustProxy > 10) errors.push("TRUST_PROXY deve estar entre 0 e 10.");
  if (!/^[A-Za-z0-9_-]+$/.test(config.session.cookieName)) {
    errors.push("SESSION_COOKIE_NAME deve conter somente letras, números, hífen ou sublinhado.");
  }
  try {
    const parsedUrl = new URL(config.appUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol) || !parsedUrl.hostname) throw new Error();
  } catch {
    errors.push("APP_URL deve ser uma URL completa iniciada por http:// ou https://.");
  }
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: config.timezone }).format();
  } catch {
    errors.push("APP_TIMEZONE não contém um fuso horário válido.");
  }
  if (config.smtp.port < 1 || config.smtp.port > 65535) errors.push("SMTP_PORT deve estar entre 1 e 65535.");
  if ((config.smtp.host || config.smtp.user || config.smtp.password) && !config.smtp.from) {
    errors.push("SMTP_FROM é obrigatório quando o SMTP está configurado.");
  }
  if (config.env === "production" && !config.appUrl.startsWith("https://")) {
    errors.push("APP_URL deve usar HTTPS em produção.");
  }
  if (errors.length) {
    throw new AppError("CONFIG_INVALID", errors.join(" "), 500, { errors });
  }
}
