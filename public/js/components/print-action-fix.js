function enhancePrintModal(form) {
  if (!form || form.dataset.printActionReady === "true") return;
  form.dataset.printActionReady = "true";

  const modal = form.closest(".modal");
  const footerButton = modal?.querySelector("[data-print-now]");
  if (!footerButton) return;

  footerButton.textContent = "Imprimir agora";
  footerButton.setAttribute("aria-label", "Imprimir agora");

  const actions = document.createElement("div");
  actions.className = "toolbar";
  actions.style.margin = "16px 0 0";
  actions.style.justifyContent = "flex-end";
  actions.innerHTML = '<button type="button" class="button button--primary" data-print-inline>Imprimir agora</button>';
  form.append(actions);

  actions.querySelector("[data-print-inline]").addEventListener("click", () => footerButton.click());
}

export function installPrintActionFix() {
  const root = document.getElementById("overlay-root");
  if (!root) return;

  const enhance = () => {
    root.querySelectorAll("#stay-print-options").forEach((form) => enhancePrintModal(form));
  };

  enhance();
  const observer = new window.MutationObserver(enhance);
  observer.observe(root, { childList: true, subtree: true });
}
