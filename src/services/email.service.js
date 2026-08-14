import nodemailer from "nodemailer";
import { config } from "../config/app-config.js";
import { AppError } from "../utils/app-error.js";

let transporter;

function getTransporter() {
  if (!config.smtp.host || !config.smtp.from) {
    throw new AppError(
      "PASSWORD_RECOVERY_UNAVAILABLE",
      "A recuperação de senha está temporariamente indisponível. Procure um administrador.",
      503,
    );
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
    });
  }
  return transporter;
}

export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  await getTransporter().sendMail({
    from: config.smtp.from,
    to,
    subject: "Redefinição de senha — Constantino's Hotel",
    text: `Olá, ${name}. Use este link para redefinir sua senha: ${resetUrl}. O link expira em 30 minutos e só pode ser usado uma vez.`,
    html: `<p>Olá, ${name}.</p><p>Recebemos uma solicitação para redefinir sua senha.</p><p><a href="${resetUrl}">Redefinir minha senha</a></p><p>O link expira em 30 minutos e só pode ser usado uma vez.</p>`,
  });
}
