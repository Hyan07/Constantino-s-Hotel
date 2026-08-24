import { api } from "./api.js";
import { renderShell } from "./components/shell.js";
import { installConfigurationPanels } from "./components/configuration-panels.js";
import { installPrintActionFix } from "./components/print-action-fix.js";
import { installReservationReopen } from "./components/reservation-reopen.js?v=20260817-3";
import { installReservationSourceEnhancer } from "./components/reservation-source-enhancer.js";
import { installReservationWizardEnhancer } from "./components/reservation-wizard-enhancer.js?v=20260817-1";
import { installStayPrintEnhancer } from "./components/stay-print-enhancer.js";
import { setState } from "./state.js";
import { startRouter } from "./router.js";
import { escapeHtml } from "./utils/format.js";

function installReservationWizardNavigationLabels() {
  const root = document.getElementById("overlay-root");
  if (!root || root.dataset.reservationWizardNavigationLabels === "true") return;
  root.dataset.reservationWizardNavigationLabels = "true";

  const updateLabels = () => {
    root.querySelectorAll("[data-wizard-back]").forEach((button) => {
      if (button.textContent.trim() !== "Etapa anterior") button.textContent = "Etapa anterior";
      button.setAttribute("aria-label", "Voltar para a etapa anterior do formulário");
      button.setAttribute("title", "Voltar para a etapa anterior");
    });

    root.querySelectorAll("[data-wizard-next]").forEach((button) => {
      if (button.textContent.trim() === "Continuar") button.textContent = "Próxima etapa";
      if (button.textContent.trim() === "Próxima etapa") {
        button.setAttribute("aria-label", "Avançar para a próxima etapa do formulário");
        button.setAttribute("title", "Avançar para a próxima etapa");
      }
    });
  };

  updateLabels();
  const observer = new window.MutationObserver(updateLabels);
  observer.observe(root, { childList: true, subtree: true, characterData: true });
}

async function boot() {
  try {
    const session = await api.get("/api/auth/session");
    setState(session);
    renderShell();
    installConfigurationPanels();
    installPrintActionFix();
    installReservationReopen();
    installReservationSourceEnhancer();
    installReservationWizardEnhancer();
    installReservationWizardNavigationLabels();
    installStayPrintEnhancer();
    startRouter();
  } catch (error) {
    if (error.status === 401) return;
    const app = document.getElementById("app");
    app.className = "app-loading";
    app.innerHTML = `<div class="empty-state"><div><h2>Não foi possível iniciar</h2><p>${escapeHtml(error.message)}</p><button class="button button--secondary" data-reload>Recarregar</button></div></div>`;
    app.querySelector("[data-reload]").addEventListener("click", () => window.location.reload());
  }
}

boot();