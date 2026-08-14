import { api } from "../api.js";
import { hasPermission } from "../state.js";
import { confirmDialog, emptyState, refreshIcons, setMain, showDrawer, showModal, toast } from "../components/ui.js";
import { addDays, currency, dateTime, debounce, escapeHtml, initials, isoDate, longDate, shortDate, statusLabel } from "../utils/format.js";

const current = { view: "list", tab: "all", page: 1, pageSize: 20, q: "", status: "", from: "", to: "", roomId: "", categoryId: "", withoutRoom: false, days: 15 };
const collapsedCategories = new Set();

const tabs = [
  ["all", "Todas"], ["today", "Hoje"], ["upcoming", "Próximas"], ["checked_in", "Hospedados"], ["completed", "Finalizadas"], ["cancelled", "Canceladas"],
];

function daysBetween(start, end) {
  return Math.round((new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`)) / 86_400_000);
}

function inputDate(value) { return String(value || "").slice(0, 10); }

function reservationTable(items) {
  if (!items.length) return emptyState("Nenhuma reserva encontrada", "Ajuste os filtros ou crie uma nova reserva.", "calendar-x");
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Reserva</th><th>Hóspede</th><th>Período</th><th>Quarto</th><th>Situação</th><th>Saldo</th></tr></thead><tbody>${items.map((item) => `<tr data-clickable data-open="${item.id}" tabindex="0">
    <td><span class="cell-title">${escapeHtml(item.code)}</span><span class="cell-subtitle">${dateTime(item.created_at)}</span></td>
    <td><div class="identity-cell"><span class="avatar">${initials(item.guest_name)}</span><span><span class="cell-title">${escapeHtml(item.guest_name)}</span><span class="cell-subtitle">${escapeHtml(item.guest_cpf || item.guest_phone || "Sem documento")}</span></span></div></td>
    <td><span class="cell-title">${shortDate(item.check_in_date)} → ${shortDate(item.check_out_date)}</span><span class="cell-subtitle">${item.nights} diária(s) · ${item.adults + item.children} hóspede(s)</span></td>
    <td><span class="cell-title">${item.room_number ? `Quarto ${escapeHtml(item.room_number)}` : "A definir"}</span><span class="cell-subtitle">${escapeHtml(item.category_name || "Sem categoria")}</span></td>
    <td><span class="badge status--${item.status}">${statusLabel(item.status)}</span></td>
    <td><span class="cell-title">${currency(item.balance)}</span><span class="cell-subtitle">Total ${currency(item.total_amount)}</span></td>
  </tr>`).join("")}</tbody></table></div>`;
}

function reservationCards(items) {
  if (!items.length) return emptyState("Nenhuma reserva encontrada", "Ajuste os filtros ou crie uma nova reserva.", "calendar-x");
  return `<div class="reservation-cards">${items.map((item) => `<article class="reservation-card" data-open="${item.id}" tabindex="0">
    <div class="reservation-card__top"><div><h3>${escapeHtml(item.guest_name)}</h3><p class="reservation-card__code">${escapeHtml(item.code)}</p></div><span class="badge status--${item.status}">${statusLabel(item.status)}</span></div>
    <div class="reservation-card__meta"><div><span>Período</span><strong>${shortDate(item.check_in_date)} → ${shortDate(item.check_out_date)}</strong></div><div><span>Quarto</span><strong>${item.room_number ? escapeHtml(item.room_number) : "A definir"}</strong></div><div><span>Valor</span><strong>${currency(item.total_amount)}</strong></div><div><span>Saldo</span><strong>${currency(item.balance)}</strong></div></div>
  </article>`).join("")}</div>`;
}

function filterMarkup(rooms) {
  const categories = [...new Map(rooms.map((room) => [room.category_id, { id: room.category_id, name: room.category_name }])).values()];
  return `<div class="card filter-panel">
    <div class="field"><label for="reservation-search">Pesquisar</label><input id="reservation-search" value="${escapeHtml(current.q)}" placeholder="Código, hóspede, CPF ou quarto"></div>
    <div class="field"><label for="reservation-status">Situação</label><select id="reservation-status"><option value="">Todas</option>${["pending", "confirmed", "awaiting_checkin", "checked_in", "completed", "cancelled"].map((status) => `<option value="${status}"${current.status === status ? " selected" : ""}>${statusLabel(status)}</option>`).join("")}</select></div>
    <div class="field"><label for="reservation-from">Entrada a partir de</label><input id="reservation-from" type="date" value="${current.from}"></div>
    <div class="field"><label for="reservation-to">Entrada até</label><input id="reservation-to" type="date" value="${current.to}"></div>
    <div class="field"><label for="reservation-room">Quarto</label><select id="reservation-room"><option value="">Todos</option>${rooms.map((room) => `<option value="${room.id}"${String(room.id) === current.roomId ? " selected" : ""}>${escapeHtml(room.number)}</option>`).join("")}</select></div>
    <div class="field"><label for="reservation-category">Categoria</label><select id="reservation-category"><option value="">Todas</option>${categories.map((category) => `<option value="${category.id}"${String(category.id) === current.categoryId ? " selected" : ""}>${escapeHtml(category.name)}</option>`).join("")}</select></div>
    <div class="field"><label for="reservation-without-room">Atribuição</label><select id="reservation-without-room"><option value="false">Todas</option><option value="true"${current.withoutRoom ? " selected" : ""}>Somente sem quarto</option></select></div>
    <div class="field"><label for="reservation-page-size">Por página</label><select id="reservation-page-size">${[20, 50, 100].map((size) => `<option value="${size}"${size === current.pageSize ? " selected" : ""}>${size}</option>`).join("")}</select></div>
    <div class="field"><label>&nbsp;</label><button class="button button--secondary" data-clear-filters><i data-lucide="filter-x"></i>Limpar</button></div>
  </div>`;
}

function pageHeader() {
  return `<div class="page-header"><div><p class="eyebrow">Reservas</p><h1>Agenda de hospedagens</h1><p>Consulte, organize e acompanhe todas as reservas do hotel.</p></div>${hasPermission("reservations.write") ? `<button class="button button--primary" data-new><i data-lucide="plus"></i>Nova reserva</button>` : ""}</div>`;
}

async function renderList() {
  const [result, rooms] = await Promise.all([
    api.get("/api/reservations", { tab: current.tab, page: current.page, pageSize: current.pageSize, q: current.q, status: current.status, from: current.from, to: current.to, roomId: current.roomId, categoryId: current.categoryId, withoutRoom: current.withoutRoom }),
    api.get("/api/rooms"),
  ]);
  setMain(`<div class="page-shell">${pageHeader()}
    <div class="toolbar"><div class="tabs">${tabs.map(([value, label]) => `<button class="tab${current.tab === value ? " is-active" : ""}" data-tab="${value}">${label}</button>`).join("")}</div><span class="header-spacer"></span><div class="segmented"><button class="${current.view === "list" ? "is-active" : ""}" data-view="list"><i data-lucide="list"></i>Lista</button><button class="${current.view === "cards" ? "is-active" : ""}" data-view="cards"><i data-lucide="layout-grid"></i>Cards</button><button data-view="calendar"><i data-lucide="calendar-range"></i>Calendário</button></div></div>
    ${filterMarkup(rooms)}
    <section class="card${current.view === "list" ? " card--flush" : ""}">${current.view === "list" ? reservationTable(result.items) : `<div class="card__body">${reservationCards(result.items)}</div>`}
      <div class="pagination"><span class="muted">${result.pagination.total} registro(s) · página ${result.pagination.page} de ${result.pagination.totalPages}</span><div class="pagination__controls"><button class="button button--secondary" data-page="${current.page - 1}"${current.page <= 1 ? " disabled" : ""}>Anterior</button><button class="button button--secondary" data-page="${current.page + 1}"${current.page >= result.pagination.totalPages ? " disabled" : ""}>Próxima</button></div></div>
    </section>
  </div>`);
  bindCommon();
  document.querySelectorAll("[data-tab]").forEach((element) => element.addEventListener("click", () => { current.tab = element.dataset.tab; current.page = 1; renderList(); }));
  document.querySelectorAll("[data-view]").forEach((element) => element.addEventListener("click", () => { current.view = element.dataset.view; current.page = 1; reservationsView.render(); }));
  document.querySelectorAll("[data-page]").forEach((element) => element.addEventListener("click", () => { current.page = Number(element.dataset.page); renderList(); }));
  document.querySelectorAll("[data-open]").forEach((element) => {
    element.addEventListener("click", () => openReservation(element.dataset.open));
    element.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); openReservation(element.dataset.open); } });
  });
  const refresh = debounce(() => { current.q = document.querySelector("#reservation-search").value; current.page = 1; renderList(); }, 350);
  document.querySelector("#reservation-search").addEventListener("input", refresh);
  for (const [selector, key] of [["#reservation-status", "status"], ["#reservation-from", "from"], ["#reservation-to", "to"], ["#reservation-room", "roomId"], ["#reservation-category", "categoryId"]]) {
    document.querySelector(selector).addEventListener("change", (event) => { current[key] = event.target.value; current.page = 1; renderList(); });
  }
  document.querySelector("#reservation-without-room").addEventListener("change", (event) => { current.withoutRoom = event.target.value === "true"; current.page = 1; renderList(); });
  document.querySelector("#reservation-page-size").addEventListener("change", (event) => { current.pageSize = Number(event.target.value); current.page = 1; renderList(); });
  document.querySelector("[data-clear-filters]").addEventListener("click", () => { Object.assign(current, { q: "", status: "", from: "", to: "", roomId: "", categoryId: "", withoutRoom: false, page: 1 }); renderList(); });
}

function dates(from, count) {
  return Array.from({ length: count }, (_, index) => addDays(from, index));
}

async function renderCalendar() {
  const from = current.from || isoDate();
  const calendar = await api.get("/api/reservations/calendar", { from, days: current.days });
  const calendarDays = dates(calendar.from, daysBetween(calendar.from, calendar.to));
  const groups = new Map();
  for (const room of calendar.rooms) {
    if (!groups.has(room.category_name)) groups.set(room.category_name, []);
    groups.get(room.category_name).push(room);
  }
  const today = isoDate();
  const gridRows = [];
  for (const [category, rooms] of groups) {
    const collapsed = collapsedCategories.has(category);
    gridRows.push(`<button class="calendar-category" data-category="${encodeURIComponent(category)}"><i data-lucide="${collapsed ? "chevron-right" : "chevron-down"}"></i>${escapeHtml(category)} <span>· ${rooms.length} quarto(s)</span></button>`);
    if (collapsed) continue;
    for (const room of rooms) {
      gridRows.push(`<div class="calendar-room"><span><strong>Quarto ${escapeHtml(room.number)}</strong><span>${escapeHtml(category)}</span></span><span>${room.capacity} pax</span></div>`);
      for (const date of calendarDays) {
        const reservation = calendar.reservations.find((item) => item.room_id === room.id && (item.check_in_date > calendar.from ? item.check_in_date : calendar.from) === date);
        const widthDays = reservation ? Math.min(daysBetween(date, reservation.check_out_date), daysBetween(date, calendar.to)) : 0;
        const movable = reservation && hasPermission("reservations.write") && ["pending", "confirmed", "awaiting_checkin"].includes(reservation.status);
        const tooltip = reservation ? `${reservation.guest_name} · ${reservation.code}\n${longDate(reservation.check_in_date)} → ${longDate(reservation.check_out_date)}\nQuarto ${reservation.room_number} · ${reservation.adults + reservation.children} hóspede(s) · ${statusLabel(reservation.status)}` : "";
        gridRows.push(`<div class="calendar-cell${date === today ? " is-today" : ""}" data-room="${room.id}" data-date="${date}">${reservation ? `<button class="reservation-bar" data-open="${reservation.id}" data-status="${reservation.status}" draggable="${movable}" title="${escapeHtml(tooltip)}" style="width:calc(${Math.max(1, widthDays)} * var(--day-width) - 8px)"><strong>${escapeHtml(reservation.guest_name)}</strong><span>${statusLabel(reservation.status)}</span></button>` : ""}</div>`);
      }
    }
  }
  const unassigned = calendar.reservations.filter((item) => !item.room_id);
  setMain(`<div class="page-shell">${pageHeader()}<div class="toolbar"><div class="segmented"><button data-view="list"><i data-lucide="list"></i>Lista</button><button data-view="cards"><i data-lucide="layout-grid"></i>Cards</button><button class="is-active"><i data-lucide="calendar-range"></i>Calendário</button></div><span class="header-spacer"></span><div class="segmented" aria-label="Escala do calendário">${[[7, "7 dias"], [15, "15 dias"], [31, "Mês"]].map(([days, label]) => `<button data-days="${days}" class="${current.days === days ? "is-active" : ""}">${label}</button>`).join("")}</div></div>
    <section class="card calendar-shell"><div class="calendar-toolbar"><div class="calendar-nav"><button class="icon-button" data-shift="-${current.days}" aria-label="Período anterior"><i data-lucide="chevron-left"></i></button><button class="button button--secondary" data-today>Hoje</button><button class="icon-button" data-shift="${current.days}" aria-label="Próximo período"><i data-lucide="chevron-right"></i></button><strong>${longDate(calendar.from)} — ${longDate(addDays(calendar.to, -1))}</strong></div><span class="muted">Selecione datas vazias ou arraste uma reserva para reorganizar</span></div>
      <div class="hotel-calendar"><div class="calendar-grid" style="--days:${calendarDays.length}"><div class="calendar-corner">Quarto</div>${calendarDays.map((date) => `<div class="calendar-date${date === today ? " is-today" : ""}"><strong>${shortDate(date)}</strong><span>${calendar.occupancy[date] || 0}% ocupação</span></div>`).join("")}${gridRows.join("")}</div></div>
      ${unassigned.length ? `<div class="unassigned-section"><strong>Reservas sem quarto</strong><div class="unassigned-list">${unassigned.map((item) => `<button class="unassigned-item" data-open="${item.id}"><strong>${escapeHtml(item.guest_name)}</strong><span>${escapeHtml(item.code)} · ${shortDate(item.check_in_date)}</span></button>`).join("")}</div></div>` : ""}
    </section>
  </div>`);
  bindCommon();
  document.querySelectorAll("[data-view]").forEach((element) => element.addEventListener("click", () => { current.view = element.dataset.view; reservationsView.render(); }));
  document.querySelectorAll("[data-open]").forEach((element) => element.addEventListener("click", (event) => { event.stopPropagation(); openReservation(element.dataset.open); }));
  document.querySelectorAll("[data-days]").forEach((element) => element.addEventListener("click", () => { current.days = Number(element.dataset.days); renderCalendar(); }));
  document.querySelectorAll("[data-category]").forEach((element) => element.addEventListener("click", () => { const category = decodeURIComponent(element.dataset.category); if (collapsedCategories.has(category)) collapsedCategories.delete(category); else collapsedCategories.add(category); renderCalendar(); }));
  document.querySelector("[data-today]").addEventListener("click", () => { current.from = isoDate(); renderCalendar(); });
  document.querySelectorAll("[data-shift]").forEach((element) => element.addEventListener("click", () => { current.from = addDays(calendar.from, Number(element.dataset.shift)); renderCalendar(); }));
  let selection = null;
  document.querySelectorAll(".calendar-cell").forEach((element) => {
    element.addEventListener("click", () => {
      if (element.querySelector(".reservation-bar")) return;
      const roomId = Number(element.dataset.room);
      const date = element.dataset.date;
      if (!selection || selection.roomId !== roomId) {
        selection = { roomId, date };
        document.querySelectorAll(".calendar-cell").forEach((cell) => cell.classList.remove("is-selected"));
        element.classList.add("is-selected");
        return;
      }
      const room = calendar.rooms.find((item) => item.id === roomId);
      const checkIn = selection.date < date ? selection.date : date;
      const lastDate = selection.date > date ? selection.date : date;
      newReservationWizard({ checkIn, checkOut: addDays(lastDate, 1), roomId, room_number: room.number, category_name: room.category_name, dailyRate: room.base_rate });
      selection = null;
    });
    element.addEventListener("dragover", (event) => event.preventDefault());
    element.addEventListener("drop", async (event) => {
      event.preventDefault();
      const reservationId = event.dataTransfer.getData("text/reservation-id");
      if (!reservationId) return;
      try {
        const reservation = await api.get(`/api/reservations/${reservationId}`);
        const room = calendar.rooms.find((item) => item.id === Number(element.dataset.room));
        const checkIn = element.dataset.date;
        const checkOut = addDays(checkIn, Number(reservation.nights));
        const confirmed = await confirmDialog({ title: "Reorganizar reserva", message: `Mover ${reservation.code} para o quarto ${room.number}, de ${longDate(checkIn)} a ${longDate(checkOut)}?`, confirmLabel: "Confirmar alteração" });
        if (!confirmed) return;
        await api.put(`/api/reservations/${reservation.id}`, { guestId: reservation.guest_id, roomId: room.id, checkIn, checkOut, adults: reservation.adults, children: reservation.children, status: reservation.status, dailyRate: reservation.daily_rate, discount: reservation.discount, surcharge: reservation.surcharge, source: reservation.source, notes: reservation.notes });
        toast("Reserva reorganizada no calendário.");
        renderCalendar();
      } catch (error) {
        const conflict = error.details?.conflictingReservation?.code;
        toast(`${error.message}${conflict ? ` Reserva conflitante: ${conflict}.` : ""}`, { title: "Alteração não salva", type: "danger" });
      }
    });
  });
  document.querySelectorAll('.reservation-bar[draggable="true"]').forEach((bar) => bar.addEventListener("dragstart", (event) => event.dataTransfer.setData("text/reservation-id", bar.dataset.open)));
}

function bindCommon() {
  document.querySelector("[data-new]")?.addEventListener("click", () => newReservationWizard());
}

function detailItem(label, value) { return `<div class="detail-item"><span>${label}</span><strong>${escapeHtml(value ?? "—")}</strong></div>`; }

async function reservationPaymentModal(item, afterSave) {
  const settings = await api.get("/api/settings");
  showModal({
    title: `Pagamento · ${item.code}`,
    content: `<form id="reservation-payment" class="form-grid"><div class="field"><label>Valor *</label><input name="amount" type="number" min="0.01" max="${item.balance}" step="0.01" value="${Math.max(0, item.balance)}" required></div><div class="field"><label>Forma de pagamento *</label><select name="paymentMethod" required>${settings.paymentMethods.map((method) => `<option>${escapeHtml(method)}</option>`).join("")}</select></div><div class="field span-2"><label>Observação</label><textarea name="notes" maxlength="500"></textarea></div><p class="form-alert span-2">Saldo atual: ${currency(item.balance)}. Pagamentos parciais são permitidos.</p><p class="form-alert form-alert--danger span-2" data-error hidden></p></form>`,
    footer: `<button class="button button--ghost" data-close>Cancelar</button><button class="button button--primary" data-save>Registrar pagamento</button>`,
    onMount(element, close) {
      element.querySelector("[data-save]").addEventListener("click", async () => {
        const form = element.querySelector("#reservation-payment");
        if (!form.reportValidity()) return;
        try {
          await api.post("/api/payments", { ...Object.fromEntries(new FormData(form)), reservationId: item.id });
          close();
          toast("Pagamento registrado na reserva.");
          afterSave();
        } catch (error) {
          const panel = element.querySelector("[data-error]");
          panel.textContent = error.message;
          panel.hidden = false;
        }
      });
    },
  });
}

async function openReservation(id) {
  const item = await api.get(`/api/reservations/${id}`);
  const editable = ["pending", "confirmed", "awaiting_checkin"].includes(item.status) && hasPermission("reservations.write");
  const canCheckIn = ["confirmed", "awaiting_checkin"].includes(item.status) && item.room_id && hasPermission("stays.write");
  const drawer = showDrawer({
    title: item.code,
    eyebrow: "Detalhes da reserva",
    content: `<div class="identity-cell"><span class="avatar">${initials(item.guest_name)}</span><div><h3>${escapeHtml(item.guest_name)}</h3><p class="muted">${escapeHtml(item.guest_cpf || "CPF não informado")} · ${escapeHtml(item.guest_phone || "telefone não informado")}</p></div></div>
      <h3 class="section-title">Estadia</h3><div class="detail-grid">${detailItem("Situação", statusLabel(item.status))}${detailItem("Quarto", item.room_number ? `Quarto ${item.room_number} · ${item.category_name}` : "A definir")}${detailItem("Entrada", longDate(item.check_in_date))}${detailItem("Saída", longDate(item.check_out_date))}${detailItem("Hóspedes", `${item.adults} adulto(s) · ${item.children} criança(s)`)}${detailItem("Origem", item.source || "Direta")}</div>
      <h3 class="section-title">Valores</h3><div class="detail-grid">${detailItem("Diária", currency(item.daily_rate))}${detailItem("Desconto", currency(item.discount))}${detailItem("Total", currency(item.total_amount))}${detailItem("Saldo", currency(item.balance))}</div>
      <h3 class="section-title">Pagamentos</h3>${item.payments.length ? `<div class="timeline-list">${item.payments.map((payment) => `<div class="timeline-item"><strong>${currency(payment.amount)} · ${escapeHtml(payment.payment_method)}</strong><span>${dateTime(payment.paid_at)} · ${escapeHtml(payment.user_name)}</span></div>`).join("")}</div>` : `<p class="muted">Nenhum pagamento registrado.</p>`}
      ${item.notes ? `<h3 class="section-title">Observações</h3><p>${escapeHtml(item.notes)}</p>` : ""}
      <h3 class="section-title">Histórico</h3><div class="timeline-list">${item.history.map((entry) => `<div class="timeline-item"><strong>${escapeHtml(entry.description)}</strong><span>${dateTime(entry.created_at)} · ${escapeHtml(entry.user_name)}</span></div>`).join("")}</div>`,
    footer: `${editable ? `<button class="button button--ghost" data-cancel-reservation>Cancelar reserva</button><button class="button button--ghost" data-no-show>Não compareceu</button><button class="button button--secondary" data-edit>Editar / alterar quarto</button>` : ""}${hasPermission("payments.write") && item.balance > 0 && !["cancelled", "no_show"].includes(item.status) ? `<button class="button button--secondary" data-payment>Registrar pagamento</button>` : ""}${canCheckIn ? `<button class="button button--primary" data-checkin>Fazer check-in</button>` : ""}`,
    onMount(element, close) {
      element.querySelector("[data-edit]")?.addEventListener("click", () => { close(); newReservationWizard(item); });
      element.querySelector("[data-payment]")?.addEventListener("click", async () => {
        try { await reservationPaymentModal(item, () => { close(); openReservation(id); }); } catch (error) { toast(error.message, { title: "Formas de pagamento indisponíveis", type: "danger" }); }
      });
      element.querySelector("[data-cancel-reservation]")?.addEventListener("click", async () => {
        const confirmed = await confirmDialog({ title: "Cancelar reserva", message: `Deseja cancelar ${item.code}? A ação ficará registrada no histórico.`, confirmLabel: "Cancelar reserva", danger: true });
        if (!confirmed) return;
        try { await api.post(`/api/reservations/${item.id}/cancel`, { reason: "Cancelada pela recepção" }); close(); toast("Reserva cancelada."); reservationsView.render(); } catch (error) { toast(error.message, { title: "Não foi possível cancelar", type: "danger" }); }
      });
      element.querySelector("[data-no-show]")?.addEventListener("click", async () => {
        const confirmed = await confirmDialog({ title: "Registrar não comparecimento", message: `Confirmar que o hóspede da reserva ${item.code} não compareceu?`, confirmLabel: "Marcar não compareceu", danger: true });
        if (!confirmed) return;
        try { await api.post(`/api/reservations/${item.id}/no-show`); close(); toast("Não comparecimento registrado."); reservationsView.render(); } catch (error) { toast(error.message, { title: "Situação não alterada", type: "danger" }); }
      });
      element.querySelector("[data-checkin]")?.addEventListener("click", async () => {
        try { const stay = await api.post(`/api/reservations/${item.id}/check-in`); close(); toast("Check-in realizado com sucesso."); window.dispatchEvent(new CustomEvent("app:navigate", { detail: { route: "hospedagens", params: { open: stay.id } } })); } catch (error) { toast(error.message, { title: "Check-in não realizado", type: "danger" }); }
      });
    },
  });
  return drawer;
}

function wizardProgress(step) {
  return `<div class="wizard-progress">${["Hóspede", "Período", "Quarto", "Valores", "Revisão"].map((label, index) => `<div class="wizard-step${step === index + 1 ? " is-active" : ""}">${index + 1}. ${label}</div>`).join("")}</div>`;
}

function newReservationWizard(initial = {}) {
  const editId = initial.id || null;
  const data = {
    guestId: initial.guest_id || initial.guestId || null,
    guestName: initial.guest_name || "",
    guestCpf: initial.guest_cpf || "",
    checkIn: inputDate(initial.check_in_date || initial.checkIn) || isoDate(),
    checkOut: inputDate(initial.check_out_date || initial.checkOut) || addDays(isoDate(), 1),
    adults: Number(initial.adults || 1), children: Number(initial.children || 0), status: initial.status || "confirmed",
    roomId: initial.room_id || initial.roomId || null, roomNumber: initial.room_number || "", categoryName: initial.category_name || "",
    dailyRate: Number(initial.daily_rate ?? initial.dailyRate ?? 0), discount: Number(initial.discount || 0), surcharge: Number(initial.surcharge || 0), source: initial.source || "Direta", notes: initial.notes || "",
  };
  const statusOptions = !editId
    ? ["confirmed", "pending"]
    : initial.status === "pending"
      ? ["pending", "confirmed"]
      : initial.status === "confirmed"
        ? ["confirmed", "awaiting_checkin"]
        : [initial.status];
  let step = data.guestId ? 2 : 1;
  let roomOptions = [];
  const modal = showModal({ title: editId ? `Editar ${initial.code}` : "Nova reserva", eyebrow: "Assistente em 5 etapas", wide: true, content: `<div id="wizard-content"></div>`, footer: `<button class="button button--ghost" data-wizard-back>Voltar</button><button class="button button--primary" data-wizard-next>Continuar</button>`, onMount(element, close) {
    const content = element.querySelector("#wizard-content");
    const back = element.querySelector("[data-wizard-back]");
    const next = element.querySelector("[data-wizard-next]");

    function render() {
      back.disabled = step === 1;
      next.textContent = step === 5 ? (editId ? "Salvar alterações" : "Criar reserva") : "Continuar";
      if (step === 1) content.innerHTML = `${wizardProgress(step)}<div class="field"><label for="guest-search">Localizar hóspede</label><input id="guest-search" placeholder="Nome, CPF, telefone ou e-mail" autocomplete="off"></div><div id="guest-results" class="guest-results"></div><button class="link-button" data-toggle-guest>+ Cadastrar novo hóspede</button><form id="quick-guest" class="form-grid" hidden><div class="field span-2"><label>Nome completo *</label><input name="name" required minlength="3"></div><div class="field"><label>CPF</label><input name="cpf"></div><div class="field"><label>Telefone</label><input name="phone"></div><div class="field span-2"><label>E-mail</label><input name="email" type="email"></div><div class="span-2"><button class="button button--secondary" type="submit">Salvar e selecionar</button></div></form>`;
      if (step === 2) content.innerHTML = `${wizardProgress(step)}<div class="form-grid form-grid--3"><div class="field"><label>Entrada *</label><input name="checkIn" type="date" value="${data.checkIn}" required></div><div class="field"><label>Saída *</label><input name="checkOut" type="date" value="${data.checkOut}" required></div><div class="field"><label>Situação</label><select name="status">${statusOptions.map((status) => `<option value="${status}"${data.status === status ? " selected" : ""}>${statusLabel(status)}</option>`).join("")}</select></div><div class="field"><label>Adultos *</label><input name="adults" type="number" min="1" max="30" value="${data.adults}" required></div><div class="field"><label>Crianças</label><input name="children" type="number" min="0" max="30" value="${data.children}"></div><div class="field"><label>Origem</label><input name="source" value="${escapeHtml(data.source)}"></div></div>`;
      if (step === 3) content.innerHTML = `${wizardProgress(step)}<p class="muted">Quartos disponíveis de ${longDate(data.checkIn)} a ${longDate(data.checkOut)} para ${data.adults + data.children} hóspede(s).</p><div class="available-rooms">${roomOptions.map((room) => `<button class="available-room${Number(data.roomId) === room.id ? " is-selected" : ""}" data-room="${room.id}"><span><strong>Quarto ${escapeHtml(room.number)}</strong><span>${escapeHtml(room.category_name)} · ${room.capacity} pax · ${escapeHtml(room.beds || "")}</span></span><strong>${currency(room.base_rate)}</strong></button>`).join("")}</div><button class="link-button" data-no-room>Deixar quarto a definir</button>${!roomOptions.length ? `<p class="form-alert form-alert--danger">Nenhum quarto disponível para os critérios informados. Volte e ajuste o período ou a quantidade de hóspedes.</p>` : ""}`;
      if (step === 4) content.innerHTML = `${wizardProgress(step)}<div class="form-grid"><div class="field"><label>Diária *</label><input name="dailyRate" type="number" min="0" step="0.01" value="${data.dailyRate}" required></div><div class="field"><label>Desconto</label><input name="discount" type="number" min="0" step="0.01" value="${data.discount}"></div><div class="field"><label>Acréscimo</label><input name="surcharge" type="number" min="0" step="0.01" value="${data.surcharge}"></div><div class="field"><label>Prévia do total</label><input value="${currency(Math.max(0, data.dailyRate * daysBetween(data.checkIn, data.checkOut) - data.discount + data.surcharge))}" disabled></div><div class="field span-2"><label>Observações</label><textarea name="notes" maxlength="5000">${escapeHtml(data.notes)}</textarea></div></div>`;
      if (step === 5) {
        const nights = daysBetween(data.checkIn, data.checkOut);
        const total = Math.max(0, data.dailyRate * nights - data.discount + data.surcharge);
        content.innerHTML = `${wizardProgress(step)}<div class="review-panel"><div class="review-box"><h3>Dados da reserva</h3><div class="review-line"><span>Hóspede</span><strong>${escapeHtml(data.guestName)}</strong></div><div class="review-line"><span>Período</span><strong>${longDate(data.checkIn)} → ${longDate(data.checkOut)}</strong></div><div class="review-line"><span>Acomodação</span><strong>${data.roomId ? `Quarto ${escapeHtml(data.roomNumber)} · ${escapeHtml(data.categoryName)}` : "A definir"}</strong></div><div class="review-line"><span>Ocupação</span><strong>${data.adults} adulto(s) · ${data.children} criança(s)</strong></div><div class="review-line"><span>Situação</span><strong>${statusLabel(data.status)}</strong></div></div><div class="review-box"><h3>Resumo financeiro</h3><div class="review-line"><span>${nights} diária(s)</span><strong>${currency(data.dailyRate * nights)}</strong></div><div class="review-line"><span>Desconto</span><strong>− ${currency(data.discount)}</strong></div><div class="review-line"><span>Acréscimo</span><strong>+ ${currency(data.surcharge)}</strong></div><div class="review-line review-total"><span>Total</span><strong>${currency(total)}</strong></div></div></div>`;
      }
      refreshIcons(content);
      bindStep();
    }

    function collect() {
      if (step === 1) return true;
      const fields = content.querySelectorAll("input[name], select[name], textarea[name]");
      if (fields.length && !content.querySelector("form")?.reportValidity?.()) {
        for (const field of fields) if (!field.reportValidity()) return false;
      }
      for (const field of fields) data[field.name] = ["adults", "children", "dailyRate", "discount", "surcharge"].includes(field.name) ? Number(field.value || 0) : field.value;
      if (step === 2 && (daysBetween(data.checkIn, data.checkOut) < 1 || data.adults < 1)) { toast("A saída deve ser posterior à entrada e deve haver ao menos um adulto.", { title: "Revise o período", type: "danger" }); return false; }
      return true;
    }

    async function bindStep() {
      if (step === 1) {
        const input = content.querySelector("#guest-search");
        const results = content.querySelector("#guest-results");
        const search = debounce(async () => {
          const response = await api.get("/api/guests", { q: input.value, pageSize: 12 });
          results.innerHTML = response.items.map((guest) => `<button class="guest-result${data.guestId === guest.id ? " is-selected" : ""}" data-guest="${guest.id}" data-name="${escapeHtml(guest.name)}" data-cpf="${escapeHtml(guest.cpf || "")}"><span><strong>${escapeHtml(guest.name)}</strong><span class="cell-subtitle">${escapeHtml(guest.cpf || guest.phone || "Sem documento")}</span></span><i data-lucide="chevron-right"></i></button>`).join("");
          refreshIcons(results);
        }, 250);
        input.addEventListener("input", search); search();
        results.addEventListener("click", (event) => { const button = event.target.closest("[data-guest]"); if (!button) return; data.guestId = Number(button.dataset.guest); data.guestName = button.dataset.name; data.guestCpf = button.dataset.cpf; results.querySelectorAll(".guest-result").forEach((item) => item.classList.toggle("is-selected", item === button)); });
        content.querySelector("[data-toggle-guest]").addEventListener("click", () => { content.querySelector("#quick-guest").hidden = false; });
        content.querySelector("#quick-guest").addEventListener("submit", async (event) => { event.preventDefault(); try { const guest = await api.post("/api/guests", Object.fromEntries(new FormData(event.currentTarget))); data.guestId = guest.id; data.guestName = guest.name; data.guestCpf = guest.cpf; toast("Hóspede cadastrado e selecionado."); step = 2; render(); } catch (error) { toast(error.message, { title: "Cadastro não concluído", type: "danger" }); } });
      }
      if (step === 3) {
        content.querySelectorAll("[data-room]").forEach((button) => button.addEventListener("click", () => { const room = roomOptions.find((item) => item.id === Number(button.dataset.room)); Object.assign(data, { roomId: room.id, roomNumber: room.number, categoryName: room.category_name, dailyRate: Number(room.base_rate) }); render(); }));
        content.querySelector("[data-no-room]").addEventListener("click", () => { Object.assign(data, { roomId: null, roomNumber: "", categoryName: "" }); render(); });
      }
    }

    back.addEventListener("click", () => { if (collect()) { step -= 1; render(); } });
    next.addEventListener("click", async () => {
      if (!collect()) return;
      if (step === 1 && !data.guestId) { toast("Selecione ou cadastre um hóspede.", { title: "Hóspede obrigatório", type: "danger" }); return; }
      if (step === 2) {
        try {
          roomOptions = await api.get("/api/reservations/available", { checkIn: data.checkIn, checkOut: data.checkOut, people: data.adults + data.children, excludeReservationId: editId });
          const selected = roomOptions.find((room) => room.id === Number(data.roomId));
          if (selected) Object.assign(data, { roomNumber: selected.number, categoryName: selected.category_name, dailyRate: Number(selected.base_rate) });
        } catch (error) { toast(error.message, { title: "Disponibilidade não consultada", type: "danger" }); return; }
      }
      if (step === 3 && !data.roomId && !data.dailyRate) { data.dailyRate = 0; }
      if (step < 5) { step += 1; render(); return; }
      next.disabled = true;
      try {
        const payload = { guestId: data.guestId, roomId: data.roomId, checkIn: data.checkIn, checkOut: data.checkOut, adults: data.adults, children: data.children, status: data.status, dailyRate: data.dailyRate, discount: data.discount, surcharge: data.surcharge, source: data.source, notes: data.notes };
        const saved = editId ? await api.put(`/api/reservations/${editId}`, payload) : await api.post("/api/reservations", payload);
        close(); toast(editId ? "Reserva atualizada." : `Reserva ${saved.code} criada.`); current.view = "list"; reservationsView.render();
      } catch (error) { next.disabled = false; toast(error.message, { title: "Reserva não salva", type: "danger" }); }
    });
    render();
  }});
  return modal;
}

window.addEventListener("app:new-reservation", (event) => {
  const guest = event.detail?.guest;
  const initial = event.detail?.initial || {};
  newReservationWizard(guest ? { ...initial, guest_id: guest.id, guest_name: guest.name, guest_cpf: guest.cpf } : initial);
});

export const reservationsView = {
  async render(params = {}) {
    if (params.view) current.view = params.view;
    if (params.tab) current.tab = params.tab;
    await (current.view === "calendar" ? renderCalendar() : renderList());
    if (params.open) openReservation(params.open);
  },
};
