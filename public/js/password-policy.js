const NEW_PASSWORD_SELECTOR = [
  '#admin-form input[name="password"]',
  'input[autocomplete="new-password"]',
].join(", ");

const POLICY_TEXT = "A senha deve conter exatamente 6 dígitos.";

function installVisibilityToggle(input) {
  if (!input.closest("#admin-form") || input.dataset.passwordToggleInstalled === "true") return;
  input.dataset.passwordToggleInstalled = "true";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "link-button";
  button.textContent = "Mostrar senha";
  button.setAttribute("aria-label", "Mostrar senha");
  button.setAttribute("title", "Mostrar senha");

  button.addEventListener("click", () => {
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    const label = showing ? "Mostrar senha" : "Ocultar senha";
    button.textContent = label;
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
  });

  input.insertAdjacentElement("afterend", button);
}

function enforceSixDigitPassword(input) {
  if (input.dataset.sixDigitPassword === "true") return;
  input.dataset.sixDigitPassword = "true";
  input.minLength = 6;
  input.maxLength = 6;
  input.pattern = "[0-9]{6}";
  input.inputMode = "numeric";
  input.setAttribute("title", POLICY_TEXT);

  input.addEventListener("input", () => {
    const digits = input.value.replace(/\D/g, "").slice(0, 6);
    if (input.value !== digits) input.value = digits;
  });

  installVisibilityToggle(input);
}

function updatePolicyText(root) {
  root.querySelectorAll?.("p").forEach((paragraph) => {
    const text = paragraph.textContent || "";
    if (text.includes("12 caracteres") && (text.includes("maiúscula") || text.includes("minúscula") || text.includes("símbolo"))) {
      paragraph.textContent = POLICY_TEXT;
    }
  });
}

function applyPolicy(root = document) {
  if (root instanceof Element && root.matches(NEW_PASSWORD_SELECTOR)) enforceSixDigitPassword(root);
  root.querySelectorAll?.(NEW_PASSWORD_SELECTOR).forEach(enforceSixDigitPassword);
  updatePolicyText(root);
}

export function installSixDigitPasswordPolicy() {
  if (document.documentElement.dataset.sixDigitPasswordPolicy === "true") return;
  document.documentElement.dataset.sixDigitPasswordPolicy = "true";

  const start = () => {
    applyPolicy(document);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) applyPolicy(node);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}
