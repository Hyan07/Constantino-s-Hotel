import { createHash, randomBytes } from "node:crypto";
import { config } from "../config/app-config.js";

export function createToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token) {
  return createHash("sha256").update(`${token}:${config.session.secret}`).digest("hex");
}
