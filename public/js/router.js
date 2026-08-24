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

let rendering = false;
let queuedRender = null;
let realtimeTimer = null;
let refreshAfterOverlay = false;

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, "") || "dashboard";
  const [route, query = ""] = raw.split("?");
  return { route: routes[route] ? route : "dashboard", params: Object.fromEntries(new URLSearchParams(query)) };
}

async function renderRoute({ showLoading = true, realtime = false } = {}) {
  if (rendering) {
    queuedRender = {
      showLoading: false,
      realtime: realtime || Boolean(queuedRender?.realtime),
    };
    return;
  }

  rendering = true;
  const { route, params: rawParams } = parseHash();
  const params = { ...rawParams };

  // Uma sincronizacao silenciosa nunca deve reabrir automaticamente uma
  // gaveta de detalhes que esteja representada por ?open= na URL.
  if (realtime) delete params.open;

  setState({ currentRoute: route });
  setActiveNavigation(route);
  if (showLoading) setMain(pageLoading());

  try {
    await routes[route].render(params);
  } catch (error) {
    setMain(`<div class="page-shell">${errorPanel(error)}</div>`);
    document.querySelector("[data-retry]")?.addEventListener("click", () => renderRoute());
    refreshIcons();
  } finally {
    rendering = false;
    if (queuedRender) {
      const nextRender = queuedRender;
      queuedRender = null;
      renderRoute(nextRender);
    }
  }
}

function scheduleRealtimeRefresh() {
  const overlayRoot = document.getElementById("overlay-root");
  if (overlayRoot?.children.length) refreshAfterOverlay = true;

  clearTimeout(realtimeTimer);
  realtimeTimer = window.setTimeout(() => {
    realtimeTimer = null;
    renderRoute({ showLoading: false, realtime: true });
  }, 220);
}

function watchOverlays() {
  const overlayRoot = document.getElementById("overlay-root");
  if (!overlayRoot) return;

  const observer = new window.MutationObserver(() => {
    if (overlayRoot.children.length || !refreshAfterOverlay) return;
    refreshAfterOverlay = false;
    renderRoute({ showLoading: false, realtime: true });
  });
  observer.observe(overlayRoot, { childList: true });
}

export function startRouter() {
  window.addEventListener("hashchange", () => renderRoute());
  window.addEventListener("app:navigate", (event) => {
    const query = new URLSearchParams(event.detail.params || {}).toString();
    window.location.hash = `#/${event.detail.route}${query ? `?${query}` : ""}`;
  });
  window.addEventListener("app:data-changed", scheduleRealtimeRefresh);
  watchOverlays();
  renderRoute();
}
