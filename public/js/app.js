import { api } from "./api.js";
import { renderShell } from "./components/shell.js";
import { installConfigurationPanels } from "./components/configuration-panels.js";
import { installReservationSourceEnhancer } from "./components/reservation-source-enhancer.js";
import { installStayPrintEnhancer } from "./components/stay-print-enhancer.js";
import { setState } from "./state.js";
import { startRouter } from "./router.js";
import { escapeHtml } from "./utils/format.js";

async function boot() {
  try {
    const session = await api.get("/api/auth/session");
    setState(session);
    renderShell();
    installConfigurationPanels();
    installReservationSourceEnhancer();
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
