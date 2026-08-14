import { api } from "../api.js";
import { setMain } from "../components/ui.js";
import { currency, escapeHtml, initials, shortDate, statusLabel } from "../utils/format.js";

function go(route, params = {}) {
  window.dispatchEvent(new CustomEvent("app:navigate", { detail: { route, params } }));
}

function movementItem(item, type) {
  const isArrival = type === "arrival";
  const subtitle = isArrival
    ? `${item.room_number ? `Quarto ${item.room_number}` : "Sem quarto"} · ${statusLabel(item.status)}`
    : `Quarto ${item.room_number} · saldo ${currency(item.balance)}`;
  return `<button class="movement-item" data-${isArrival ? "reservation" : "stay"}="${item.id}">
    <span class="avatar">${initials(item.guest_name)}</span>
    <span class="movement-item__content"><strong>${escapeHtml(item.guest_name)}</strong><span>${escapeHtml(subtitle)}</span></span>
    <i data-lucide="chevron-right"></i>
  </button>`;
}

export const dashboardView = {
  async render() {
    const data = await api.get("/api/dashboard");
    const maxRhythm = Math.max(1, ...data.rhythm.map((item) => item.occupancy));
    setMain(`<div class="page-shell">
      <div class="page-header"><div><p class="eyebrow">Visão operacional</p><h1>Hoje no hotel</h1><p>Acompanhe ocupação, movimentos e pendências em um só lugar.</p></div><button class="button button--secondary" data-calendar><i data-lucide="calendar-range"></i>Ver calendário</button></div>
      <div class="dashboard-grid">
        <section class="card occupancy-card"><div class="card__header"><h2>Ocupação atual</h2><span class="badge badge--info">Agora</span></div><div class="card__body">
          <div class="donut" style="--value:${data.occupancy.percentage}"><div class="donut__label"><strong>${data.occupancy.percentage}%</strong><span>${data.occupancy.occupied} de ${data.occupancy.total} quartos</span></div></div>
          <div class="occupancy-stats"><div class="occupancy-stat"><span>Ocupados</span><strong>${data.occupancy.occupied}</strong></div><div class="occupancy-stat"><span>Disponíveis</span><strong>${data.occupancy.available}</strong></div><div class="occupancy-stat"><span>Indisponíveis</span><strong>${data.occupancy.unavailable}</strong></div></div>
        </div></section>
        <section class="card card--flush movement-card"><div class="card__header"><h2>Movimentos de hoje</h2><button class="link-button" data-stays>Ver hospedagens</button></div><div class="movement-columns">
          <div class="movement-column"><div class="movement-heading"><h3>Chegadas</h3><span class="badge badge--info">${data.arrivals.length}</span></div><div class="movement-list">${data.arrivals.length ? data.arrivals.map((item) => movementItem(item, "arrival")).join("") : `<p class="muted">Nenhuma chegada hoje.</p>`}</div></div>
          <div class="movement-column"><div class="movement-heading"><h3>Saídas</h3><span class="badge badge--warning">${data.departures.length}</span></div><div class="movement-list">${data.departures.length ? data.departures.map((item) => movementItem(item, "departure")).join("") : `<p class="muted">Nenhuma saída hoje.</p>`}</div></div>
        </div></section>
        <section class="card pending-card"><div class="card__header"><h2>Pendências</h2><span class="badge badge--warning">${data.pending.length}</span></div><div class="card__body pending-list">${data.pending.length ? data.pending.map((item) => `<button class="pending-item" data-type="${item.type}" data-id="${item.id}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.description)}</span></button>`).join("") : `<p class="muted">Tudo em ordem por aqui.</p>`}</div></section>
        <section class="card rhythm-card"><div class="card__header"><div><h2>Ritmo dos próximos 7 dias</h2><p class="muted">Projeção de ocupação por reservas ativas</p></div></div><div class="card__body"><div class="rhythm">${data.rhythm.map((item) => `<div class="rhythm-day"><div class="rhythm-bar-track"><div class="rhythm-bar" style="height:${Math.max(4, (item.occupancy / maxRhythm) * 100)}%"></div></div><strong>${item.occupancy}%</strong><span>${shortDate(item.date)}</span></div>`).join("")}</div></div></section>
      </div>
    </div>`);
    document.querySelector("[data-calendar]").addEventListener("click", () => go("reservas", { view: "calendar" }));
    document.querySelector("[data-stays]").addEventListener("click", () => go("hospedagens"));
    document.querySelectorAll("[data-reservation]").forEach((element) => element.addEventListener("click", () => go("reservas", { open: element.dataset.reservation })));
    document.querySelectorAll("[data-stay]").forEach((element) => element.addEventListener("click", () => go("hospedagens", { open: element.dataset.stay })));
    document.querySelectorAll(".pending-item").forEach((element) => element.addEventListener("click", () => go(element.dataset.type === "room" ? "quartos" : "reservas", { open: element.dataset.id })));
  },
};
