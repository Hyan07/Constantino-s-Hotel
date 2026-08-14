import { AppError } from "./app-error.js";
import { config } from "../config/app-config.js";

export function assertDateRange(checkIn, checkOut) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn || "") || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut || "")) {
    throw new AppError("INVALID_DATES", "Informe as datas de entrada e saída no formato correto.");
  }
  const start = new Date(`${checkIn}T12:00:00Z`);
  const end = new Date(`${checkOut}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new AppError("INVALID_DATES", "A saída deve ser posterior à entrada.");
  }
  return Math.round((end - start) / 86_400_000);
}

export function toSqlDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addDays(sqlDate, days) {
  const date = new Date(`${sqlDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
