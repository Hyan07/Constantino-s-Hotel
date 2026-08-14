import { api } from "../api.js";
import { hasPermission } from "../state.js";
import { confirmDialog, emptyState, setMain, showDrawer, showModal, toast } from "../components/ui.js";
import { dateTime, debounce, escapeHtml, initials, statusLabel } from "../utils/format.js";

const state = { tab: "map", status: "", q: "" };

function actionModal({ title, fields, saveLabel, action }) {
  showModal({ title, content: `<form id="room-action" class="form-grid">${fields}<p class="form-alert form-alert--danger span-2" data-error hidden></p></form>`, footer: `<button class="button button--ghost" data-close>Cancelar</button><button class="button button--primary" data-save>${saveLabel}</button>`, onMount(element, close) {
    element.querySelector("[data-save]").addEventListener("click", async () => {
      const form = element.querySelector("#room-action");
      if (!form.reportValidity()) return;
      try { await action(Object.fromEntries(new FormData(form))); close(); toast("Situação do quarto atualizada."); roomsView.render(); } catch (error) { const panel = element.querySelector("[data-error]"); panel.textContent = error.message; panel.hidden = false; }
    });
  } });
}

function actionsFor(room) {
  if (!["rooms.write", "cleaning.write", "maintenance.write", "reservations.write", "stays.read"].some((permission) => hasPermission(permission))) return "";
  const actions = [];
  if (!(["maintenance", "blocked"].includes(room.status)) && hasPermission("reservations.write")) actions.push(`<button class="button button--secondary" data-reserve>Nova reserva</button>`);
  if (room.current_stay_id && hasPermission("stays.read")) actions.push(`<button class="button button--secondary" data-stay>Ver hospedagem</button>`);
  if (room.status === "available" && hasPermission("rooms.write")) actions.push(`<button class="button button--secondary" data-block>Bloquear</button>`);
  if (room.status === "blocked" && hasPermission("rooms.write")) actions.push(`<button class="button button--secondary" data-unblock>Liberar bloqueio</button>`);
  if (room.status === "awaiting_cleaning" && hasPermission("cleaning.write")) actions.push(`<button class="button button--primary" data-start-cleaning>Iniciar limpeza</button>`);
  if (room.status === "cleaning" && hasPermission("cleaning.write")) actions.push(`<button class="button button--primary" data-complete-cleaning>Concluir limpeza</button>`);
  if (room.status === "available" && hasPermission("maintenance.write")) actions.push(`<button class="button button--secondary" data-maintenance>Abrir manutenção</button>`);
  if (room.status === "maintenance" && hasPermission("maintenance.write")) actions.push(`<button class="button button--primary" data-complete-maintenance>Concluir manutenção</button>`);
  return actions.join("");
}

async function openRoom(id) {
  const room = await api.get(`/api/rooms/${id}`);
  showDrawer({
    title: `Quarto ${room.number}`,
    eyebrow: room.category_name,
    content: `<div class="detail-grid"><div class="detail-item"><span>Situação</span><strong><span class="badge status--${room.status}">${statusLabel(room.status)}</span></strong></div><div class="detail-item"><span>Andar</span><strong>${room.floor}º andar</strong></div><div class="detail-item"><span>Capacidade</span><strong>${room.capacity} hóspede(s)</strong></div><div class="detail-item"><span>Camas</span><strong>${escapeHtml(room.beds || "Não informado")}</strong></div></div>
      ${room.current_guest_name ? `<h3 class="section-title">Hóspede atual</h3><div class="identity-cell"><span class="avatar">${initials(room.current_guest_name)}</span><div><strong>${escapeHtml(room.current_guest_name)}</strong><p class="muted">Hospedagem ativa</p></div></div>` : ""}
      ${room.next_reservation_code ? `<h3 class="section-title">Próxima reserva</h3><p><strong>${escapeHtml(room.next_reservation_code)}</strong> · ${escapeHtml(room.next_check_in)} a ${escapeHtml(room.next_check_out)}</p>` : ""}
      <h3 class="section-title">Operação</h3><div class="detail-grid"><div class="detail-item"><span>Último check-out</span><strong>${dateTime(room.last_check_out_at)}</strong></div><div class="detail-item"><span>Limpeza atual</span><strong>${room.cleaning_status ? statusLabel(room.cleaning_status) : "Sem tarefa ativa"}</strong></div></div>
      ${room.maintenance_description ? `<h3 class="section-title">Manutenção aberta</h3><p>${escapeHtml(room.maintenance_description)}</p>` : ""}
      <h3 class="section-title">Histórico operacional</h3>${room.history.length ? `<div class="timeline-list">${room.history.map((item) => `<div class="timeline-item"><strong>${item.type === "cleaning" ? "Limpeza" : "Manutenção"} · ${statusLabel(item.status)}</strong><span>${dateTime(item.event_at)}${item.responsible ? ` · ${escapeHtml(item.responsible)}` : ""}</span></div>`).join("")}</div>` : `<p class="muted">Ainda não há movimentações registradas.</p>`}`,
    footer: actionsFor(room),
    onMount(element, close) {
      const refresh = () => { close(); roomsView.render(); };
      element.querySelector("[data-reserve]")?.addEventListener("click", () => { close(); window.dispatchEvent(new CustomEvent("app:new-reservation", { detail: { initial: { roomId: room.id, room_number: room.number, category_name: room.category_name, dailyRate: room.base_rate } } })); });
      element.querySelector("[data-stay]")?.addEventListener("click", () => { close(); window.dispatchEvent(new CustomEvent("app:navigate", { detail: { route: "hospedagens", params: { open: room.current_stay_id } } })); });
      element.querySelector("[data-block]")?.addEventListener("click", () => actionModal({ title: `Bloquear quarto ${room.number}`, fields: `<div class="field span-2"><label>Motivo *</label><textarea name="reason" required minlength="3"></textarea></div>`, saveLabel: "Bloquear", action: async (data) => { await api.post(`/api/rooms/${id}/block`, data); refresh(); } }));
      element.querySelector("[data-unblock]")?.addEventListener("click", async () => { if (await confirmDialog({ title: "Liberar quarto", message: `Remover o bloqueio do quarto ${room.number}?`, confirmLabel: "Liberar" })) { try { await api.post(`/api/rooms/${id}/unblock`); refresh(); toast("Quarto liberado."); } catch (error) { toast(error.message, { title: "Quarto não liberado", type: "danger" }); } } });
      element.querySelector("[data-start-cleaning]")?.addEventListener("click", () => actionModal({ title: `Iniciar limpeza · quarto ${room.number}`, fields: `<div class="field span-2"><label>Funcionário responsável</label><input name="employeeName" maxlength="160"></div><div class="field span-2"><label>Observações</label><textarea name="notes"></textarea></div>`, saveLabel: "Iniciar limpeza", action: async (data) => { await api.post(`/api/rooms/${id}/cleaning/start`, data); refresh(); } }));
      element.querySelector("[data-complete-cleaning]")?.addEventListener("click", () => actionModal({ title: `Concluir limpeza · quarto ${room.number}`, fields: `<div class="field span-2"><label>Observações finais</label><textarea name="notes"></textarea></div>`, saveLabel: "Marcar disponível", action: async (data) => { await api.post(`/api/rooms/${id}/cleaning/complete`, data); refresh(); } }));
      element.querySelector("[data-maintenance]")?.addEventListener("click", () => actionModal({ title: `Abrir manutenção · quarto ${room.number}`, fields: `<div class="field"><label>Tipo *</label><input name="type" required placeholder="Elétrica, hidráulica..."></div><div class="field"><label>Prioridade</label><select name="priority"><option value="normal">Normal</option><option value="low">Baixa</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></div><div class="field span-2"><label>Descrição *</label><textarea name="description" required minlength="5"></textarea></div><div class="field"><label>Responsável</label><input name="responsible"></div><div class="field"><label>Previsão</label><input name="expectedAt" type="datetime-local"></div>`, saveLabel: "Abrir manutenção", action: async (data) => { await api.post(`/api/rooms/${id}/maintenance`, data); refresh(); } }));
      element.querySelector("[data-complete-maintenance]")?.addEventListener("click", () => actionModal({ title: `Concluir manutenção · quarto ${room.number}`, fields: `<div class="field span-2"><label>Observações finais</label><textarea name="notes"></textarea></div>`, saveLabel: "Concluir e liberar", action: async (data) => { await api.post(`/api/rooms/${id}/maintenance/complete`, data); refresh(); } }));
    },
  });
}

async function renderMap() {
  const rooms = await api.get("/api/rooms", { status: state.status, q: state.q });
  const floors = [...new Set(rooms.map((room) => room.floor))];
  const content = floors.length ? floors.map((floor) => { const floorRooms = rooms.filter((room) => room.floor === floor); return `<section class="room-floor"><div class="floor-heading"><h2>${floor}º andar</h2><span>${floorRooms.length} quarto(s)</span></div><div class="room-grid">${floorRooms.map((room) => `<button class="room-card" data-status="${room.status}" data-open="${room.id}"><div class="room-card__top"><strong class="room-card__number">${escapeHtml(room.number)}</strong><span class="badge status--${room.status}">${statusLabel(room.status)}</span></div><strong class="room-card__category">${escapeHtml(room.category_name)}</strong><span class="room-card__beds">${room.capacity} pax · ${escapeHtml(room.beds || "camas não informadas")}</span>${room.current_guest_name ? `<span class="room-card__guest"><i data-lucide="user-round"></i>${escapeHtml(room.current_guest_name)}</span>` : room.next_reservation_code ? `<span class="room-card__guest"><i data-lucide="calendar"></i>${escapeHtml(room.next_reservation_code)} · ${escapeHtml(room.next_check_in)}</span>` : ""}</button>`).join("")}</div></section>`; }).join("") : emptyState("Nenhum quarto encontrado", "Ajuste a pesquisa ou o filtro de situação.", "door-closed");
  setMain(`<div class="page-shell"><div class="page-header"><div><p class="eyebrow">Acomodações</p><h1>Mapa de quartos</h1><p>Visão operacional por andar, com limpeza e manutenção integradas.</p></div></div>${tabs()}<div class="toolbar"><input class="input" id="room-search" placeholder="Número ou categoria" value="${escapeHtml(state.q)}"><select class="input" id="room-status"><option value="">Todas as situações</option>${["available", "reserved", "occupied", "awaiting_cleaning", "cleaning", "maintenance", "blocked"].map((status) => `<option value="${status}"${state.status === status ? " selected" : ""}>${statusLabel(status)}</option>`).join("")}</select></div><div class="card status-legend">${[["available", "Disponível", "#3f755b"], ["occupied", "Ocupado", "#356a91"], ["reserved", "Reservado", "#a47735"], ["cleaning", "Limpeza", "#6d91af"], ["maintenance", "Manutenção/bloqueio", "#a94e4e"]].map(([, label, color]) => `<span class="legend-item" style="--legend-color:${color}">${label}</span>`).join("")}</div>${content}</div>`);
  bindTabs();
  document.querySelectorAll("[data-open]").forEach((room) => room.addEventListener("click", () => openRoom(room.dataset.open)));
  document.querySelector("#room-search").addEventListener("input", debounce((event) => { state.q = event.target.value; renderMap(); }, 350));
  document.querySelector("#room-status").addEventListener("change", (event) => { state.status = event.target.value; renderMap(); });
}

function tabs() { return `<div class="tabs toolbar"><button class="tab${state.tab === "map" ? " is-active" : ""}" data-tab="map">Mapa</button><button class="tab${state.tab === "cleaning" ? " is-active" : ""}" data-tab="cleaning">Limpeza</button><button class="tab${state.tab === "maintenance" ? " is-active" : ""}" data-tab="maintenance">Manutenção</button></div>`; }
function bindTabs() { document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => { state.tab = button.dataset.tab; roomsView.render(); })); }

async function renderTasks(type) {
  const isCleaning = type === "cleaning";
  const items = await api.get(`/api/${isCleaning ? "cleanings" : "maintenance"}`);
  setMain(`<div class="page-shell"><div class="page-header"><div><p class="eyebrow">Acomodações</p><h1>${isCleaning ? "Fila de limpeza" : "Manutenções"}</h1><p>${isCleaning ? "Acompanhe quartos pendentes, em execução e concluídos." : "Controle ocorrências, prioridades e responsáveis."}</p></div></div>${tabs()}<section class="card card--flush">${items.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Quarto</th><th>${isCleaning ? "Responsável" : "Descrição"}</th><th>Situação</th><th>${isCleaning ? "Início" : "Prioridade"}</th></tr></thead><tbody>${items.map((item) => `<tr data-clickable data-open="${item.room_id}"><td><span class="cell-title">Quarto ${escapeHtml(item.room_number)}</span><span class="cell-subtitle">${escapeHtml(item.category_name)}</span></td><td>${escapeHtml(isCleaning ? item.employee_name || "A definir" : item.description)}</td><td><span class="badge status--${item.status}">${statusLabel(item.status)}</span></td><td>${isCleaning ? dateTime(item.started_at) : escapeHtml(item.priority)}</td></tr>`).join("")}</tbody></table></div>` : emptyState(isCleaning ? "Nenhuma limpeza registrada" : "Nenhuma manutenção registrada", "As novas tarefas aparecerão aqui.", isCleaning ? "sparkles" : "wrench")}</section></div>`);
  bindTabs();
  document.querySelectorAll("[data-open]").forEach((row) => row.addEventListener("click", () => openRoom(row.dataset.open)));
}

export const roomsView = {
  async render(params = {}) {
    if (params.open) state.tab = "map";
    await (state.tab === "map" ? renderMap() : renderTasks(state.tab));
    if (params.open) openRoom(params.open);
  },
};
