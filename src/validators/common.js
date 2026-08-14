import { AppError } from "../utils/app-error.js";

export function requiredString(value, field, { min = 1, max = 255 } = {}) {
  const text = String(value || "").trim();
  if (text.length < min) throw new AppError("VALIDATION_ERROR", `${field} é obrigatório.`);
  if (text.length > max) throw new AppError("VALIDATION_ERROR", `${field} deve possuir no máximo ${max} caracteres.`);
  return text;
}

export function optionalString(value, field, { max = 255 } = {}) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const text = String(value).trim();
  if (text.length > max) throw new AppError("VALIDATION_ERROR", `${field} deve possuir no máximo ${max} caracteres.`);
  return text;
}

export function positiveId(value, field = "Registro") {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new AppError("VALIDATION_ERROR", `${field} inválido.`);
  return id;
}

export function nonNegativeMoney(value, field) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw new AppError("VALIDATION_ERROR", `${field} deve ser um valor positivo.`);
  return Math.round(number * 100) / 100;
}

export function positiveNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new AppError("VALIDATION_ERROR", `${field} deve ser maior que zero.`);
  return number;
}

export function booleanValue(value, fallback = true) {
  if (value === undefined) return fallback;
  return value === true || value === 1 || value === "1" || value === "true";
}
