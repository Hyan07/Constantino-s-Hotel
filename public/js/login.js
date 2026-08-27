import { api, ApiError } from "./api.js";
import { installSixDigitPasswordPolicy } from "./password-policy.js?v=20260827-1";

const loginForm = document.getElementById("login-form");
const forgotForm = document.getElementById("forgot-form");
const resetForm = document.getElementById("reset-form");
const loginError = document.getElementById("login-error");
const cpfInput = document.getElementById("cpf");
const passwordInput = document.getElementById("password");
const submit = document.getElementById("login-submit");
const forgotButton = document.getElementById("forgot-button");
let passwordRecoveryEnabled = true;

function icons() { window.lucide?.createIcons({ attrs: { "stroke-width": 1.8 } }); }

function show(form) {
  [loginForm, forgotForm, resetForm].forEach((item) => { item.hidden = item !== form; });
  form.querySelector("input")?.focus();
}

function feedback(element, message, danger = false) {
  element.hidden = false;
  element.textContent = message;
  element.classList.toggle("form-alert--danger", danger);
}

cpfInput.addEventListener("input", () => {
  const digits = cpfInput.value.replace(/\D/g, "").slice(0, 11);
  cpfInput.value = digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
});

document.getElementById("toggle-password").addEventListener("click", (event) => {
  const visible = passwordInput.type === "text";
  passwordInput.type = visible ? "password" : "text";
  event.currentTarget.setAttribute("aria-label", visible ? "Mostrar senha" : "Ocultar senha");
  event.currentTarget.innerHTML = `<i data-lucide="${visible ? "eye" : "eye-off"}"></i>`;
  icons();
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  const cpf = cpfInput.value.replace(/\D/g, "");
  document.getElementById("cpf-error").textContent = cpf.length === 11 ? "" : "Informe os 11 números do CPF.";
  document.getElementById("password-error").textContent = passwordInput.value ? "" : "Informe sua senha.";
  if (cpf.length !== 11 || !passwordInput.value) return;
  submit.disabled = true;
  submit.querySelector("span").textContent = "Entrando...";
  try {
    await api.post("/api/auth/login", { cpf, password: passwordInput.value });
    window.location.assign("/");
  } catch (error) {
    feedback(loginError, error instanceof ApiError ? error.message : "Não foi possível entrar.", true);
  } finally {
    submit.disabled = false;
    submit.querySelector("span").textContent = "Entrar";
  }
});

forgotButton.addEventListener("click", () => {
  if (!passwordRecoveryEnabled) {
    feedback(loginError, "A recuperação por e-mail ainda não está configurada. Solicite a um administrador a redefinição da senha.", true);
    return;
  }
  show(forgotForm);
});
document.querySelectorAll("[data-back-login]").forEach((button) => button.addEventListener("click", () => show(loginForm)));

forgotForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const feedbackElement = document.getElementById("forgot-feedback");
  const button = forgotForm.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const result = await api.post("/api/auth/forgot-password", { identity: document.getElementById("identity").value });
    feedback(feedbackElement, result.message);
  } catch (error) {
    const unavailable = ["SMTP_NOT_CONFIGURED", "PASSWORD_RECOVERY_UNAVAILABLE"].includes(error.code);
    feedback(feedbackElement, unavailable
      ? "A recuperação por e-mail está temporariamente indisponível. Solicite a um administrador a redefinição da senha."
      : error.message, true);
  } finally { button.disabled = false; }
});

resetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const feedbackElement = document.getElementById("reset-feedback");
  const password = document.getElementById("new-password").value;
  const confirmation = document.getElementById("confirm-password").value;
  if (password !== confirmation) return feedback(feedbackElement, "As senhas não coincidem.", true);
  try {
    const token = new URLSearchParams(window.location.search).get("reset");
    const result = await api.post("/api/auth/reset-password", { token, password });
    feedback(feedbackElement, result.message);
    setTimeout(() => { window.history.replaceState({}, "", "/login.html"); show(loginForm); }, 1200);
  } catch (error) { feedback(feedbackElement, error.message, true); }
});

async function initialize() {
  icons();
  const params = new URLSearchParams(window.location.search);
  if (params.get("reset")) show(resetForm);
  if (params.get("expired")) feedback(loginError, "Sua sessão expirou. Entre novamente.", true);
  if (params.get("passwordChanged")) feedback(loginError, "Senha alterada. Entre novamente com a nova senha.");
  try {
    const data = await api.get("/api/auth/environment");
    document.getElementById("environment-badge").hidden = data.environment === "production";
    passwordRecoveryEnabled = data.passwordRecoveryEnabled !== false;
    if (!passwordRecoveryEnabled) {
      forgotButton.title = "Recuperação por e-mail ainda não configurada";
    }
  } catch { /* O formulário continua disponível mesmo se o indicador falhar. */ }
}

installSixDigitPasswordPolicy();
initialize();
