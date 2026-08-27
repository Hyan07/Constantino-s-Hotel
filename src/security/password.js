import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { AppError } from "../utils/app-error.js";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export function validatePasswordStrength(password) {
  const value = String(password || "");
  if (!/^\d{6}$/.test(value)) {
    throw new AppError("WEAK_PASSWORD", "A senha deve conter exatamente 6 dígitos.");
  }
}

export async function hashPassword(password) {
  validatePasswordStrength(password);
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, KEY_LENGTH, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt}$${Buffer.from(derived).toString("hex")}`;
}

export async function verifyPassword(password, encoded) {
  try {
    const [algorithm, n, r, p, salt, hash] = String(encoded || "").split("$");
    if (algorithm !== "scrypt" || !salt || !hash) return false;
    const derived = await scrypt(password, salt, Buffer.from(hash, "hex").length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(derived));
  } catch {
    return false;
  }
}
