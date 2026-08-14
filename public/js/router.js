import { setState } from "./state.js";
import { errorPanel, pageLoading, refreshIcons, setMain } from "./components/ui.js";
import { setActiveNavigation } from "./components/shell.js";
import { dashboardView } from "./views/dashboard.js";
import { reservationsView } from "./views/reservations.js";
import { staysView } from "./views/stays.js";
import { roomsView } from "./views/rooms.js";
import { guestsView } from "./views/guests.js";
import { adminView } from "./views/admin.js";

const routes = {
  dashboard: dashboardView,
  reservas: reservationsView,
  hospedagens: staysView,
  quartos: roomsView,
  hospedes: guestsView,
  administracao: adminView,
};

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, "") || "dashboard";
  const [route, query = ""] = raw.split("?");
  return { route: routes[route] ? route : "dashboard", params: Object.fromEntries(new URLSearchParams(query)) };
}

async function renderRoute() {
  const { route, params } = parseHash();
  setState({ currentRoute: route });
  setActiveNavigation(route);
  setMain(pageLoading());
  try {
    await routes[route].render(params);
  } catch (error) {
    setMain(`<div class="page-shell">${errorPanel(error)}</div>`);
    document.querySelector("[data-retry]")?.addEventListener("click", renderRoute);
    refreshIcons();
  }
}

export function startRouter() {
  window.addEventListener("hashchange", renderRoute);
  window.addEventListener("app:navigate", (event) => {
    const query = new URLSearchParams(event.detail.params || {}).toString();
    window.location.hash = `#/${event.detail.route}${query ? `?${query}` : ""}`;
  });
  renderRoute();
}
