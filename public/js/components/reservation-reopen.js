import { api } from "../api.js";
import { confirmDialog, refreshIcons, toast } from "./ui.js";

const visibleReservationStatuses = [
  ["pending", "Pendente"],
  ["confirmed", "Confirmada"],
  ["cancelled", "Cancelada"],
  ["no_show", "Não compareceu"],
  ["checked_in", "Hospedado"],
];

const legacyStatusAliases = {
  awaiting_checkin: "confirmed",
  completed: "checked_in",
};

const statusDescriptions = {
  pending: "Reserva criada, mas ainda não confirmada.",
  confirmed: "Reserva confirmada e aguardando o check-in.",
  cancelled: "Cancelamento realizado pela recepção.",
  no_show: "O hóspede não compareceu para o check-in.",
  checked_in: "O check-in foi realizado e a hospedagem foi iniciada.",
};

let lastReservationId = null;

function canonicalStatus(status) {
  return legacyStatusAliases[status] || status;
}

function labelForStatus(status) {
  return visibleReservationStatuses.find(([value]) => value === canonicalStatus(status))?.[1] || status;
}

function isReservationPage(root) {
  const eyebrow = root.querySelector?.(".page-header .eyebrow")?.textContent?.trim();
  return eyebrow === "Reservas" || Boolean(root.querySelector?.("#reservation-status")) || Boolean(root.querySelector?.(".hotel-calendar"));
}

function setStatusOptions(select, options, { includeAll = false } = {}) {
  if (!select) return;
  const current = canonicalStatus(select.value);
  const expected = [
    ...(includeAll ? [["", "Todas"]] : []),
    ...options,
  ];
  const currentSignature = [...select.options].map((option) => `${option.value}:${option.textContent}`).join("|");
  const expectedSignature = expected.map(([value, label]) => `${value}:${label}`).join("|");

  if (currentSignature !== expectedSignature) {
    select.innerHTML = expected.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  }

  if (expected.some(([value]) => value === current)) select.value = current;
  else if (includeAll) select.value = "";
}

function normalizeLegacyReservationBadges(root) {
  root.querySelectorAll?.(".status--awaiting_checkin").forEach((badge) => {
    badge.classList.remove("status--awaiting_checkin");
    badge.classList.add("status--confirmed");
    badge.textContent = "Confirmada";
  });
  root.querySelectorAll?.(".status--completed").forEach((badge) => {
    badge.classList.remove("status--completed");
    badge.classList.add("status--checked_in");
    badge.textContent = "Hospedado";
  });
}

function normalizeReservationInterface(root = document) {
  if (isReservationPage(root)) {
    root.querySelectorAll?.('[data-tab="completed"]').forEach((element) => element.remove());
    const filter = root.querySelector?.("#reservation-status");
    if (filter) setStatusOptions(filter, visibleReservationStatuses, { includeAll: true });
    normalizeLegacyReservationBadges(root);
  }

  root.querySelectorAll?.('#wizard-content select[name="status"]').forEach((select) => {
    const current = canonicalStatus(select.value);
    if (current === "checked_in") {
      setStatusOptions(select, [["checked_in", "Hospedado"]]);
      return;
    }
    setStatusOptions(select, [
      ["pending", "Pendente"],
      ["confirmed", "Confirmada"],
    ]);
  });
}

function reservationPayload(reservation, status) {
  return {
    guestId: reservation.guest_id,
    roomId: reservation.room_id,
    checkIn: reservation.check_in_date,
    checkOut: reservation.check_out_date,
    adults: reservation.adults,
    children: reservation.children,
    status,
    dailyRate: reservation.daily_rate,
    discount: reservation.discount,
    surcharge: reservation.surcharge,
    source: reservation.source,
    notes: reservation.notes,
  };
}

async function saveRegularStatus(reservation, status) {
  return api.put(`/api/reservations/${reservation.id}`, reservationPayload(reservation, status));
}

function closeReservationDrawer(backdrop) {
  backdrop.querySelector("[data-close]")?.click();
}

function refreshReservations() {
  window.dispatchEvent(new CustomEvent("app:navigate", {
    detail: { route: "reservas" },
  }));
}

async function changeReservationStatus(reservation, nextStatus, backdrop) {
  const currentStatus = canonicalStatus(reservation.status);
  const requestedStatus = canonicalStatus(nextStatus);

  if (currentStatus === "checked_in") {
    toast("Depois do check-in, as alterações operacionais devem ser feitas na Hospedagem correspondente.", {
      title: "Reserva já hospedada",
      type: "info",
    });
    return;
  }

  if (requestedStatus === currentStatus && reservation.status === requestedStatus) {
    toast(`A reserva já está como ${labelForStatus(requestedStatus)}.`, { title: "Situação mantida", type: "info" });
    return;
  }

  if (["pending", "confirmed"].includes(requestedStatus)) {
    await saveRegularStatus(reservation, requestedStatus);
    closeReservationDrawer(backdrop);
    toast(`Situação alterada para ${labelForStatus(requestedStatus)}.`);
    refreshReservations();
    return;
  }

  if (requestedStatus === "cancelled") {
    if (currentStatus === "no_show") {
      toast("Reabra primeiro a reserva como Confirmada ou Pendente e depois faça o cancelamento.", {
        title: "Reabertura necessária",
        type: "info",
      });
      return;
    }
    const confirmed = await confirmDialog({
      title: "Cancelar reserva",
      message: `Alterar ${reservation.code} para Cancelada? A ação ficará registrada no histórico.`,
      confirmLabel: "Cancelar reserva",
      danger: true,
    });
    if (!confirmed) return;
    await api.post(`/api/reservations/${reservation.id}/cancel`, { reason: "Cancelada pela recepção" });
    closeReservationDrawer(backdrop);
    toast("Reserva cancelada.");
    refreshReservations();
    return;
  }

  if (requestedStatus === "no_show") {
    if (currentStatus === "cancelled") {
      toast("Reabra primeiro a reserva como Confirmada ou Pendente e depois marque como Não compareceu.", {
        title: "Reabertura necessária",
        type: "info",
      });
      return;
    }
    const confirmed = await confirmDialog({
      title: "Registrar não comparecimento",
      message: `Confirmar que o hóspede da reserva ${reservation.code} não compareceu para o check-in?`,
      confirmLabel: "Não compareceu",
      danger: true,
    });
    if (!confirmed) return;
    await api.post(`/api/reservations/${reservation.id}/no-show`);
    closeReservationDrawer(backdrop);
    toast("Reserva marcada como Não compareceu.");
    refreshReservations();
    return;
  }

  if (requestedStatus === "checked_in") {
    if (currentStatus !== "confirmed") {
      toast("Para realizar o check-in, primeiro deixe a reserva como Confirmada.", {
        title: "Confirmação necessária",
        type: "danger",
      });
      return;
    }
    if (!reservation.room_id) {
      toast("Defina um quarto antes de realizar o check-in.", { title: "Quarto necessário", type: "danger" });
      return;
    }
    const confirmed = await confirmDialog({
      title: "Realizar check-in",
      message: `Confirmar o check-in da reserva ${reservation.code}? A situação passará para Hospedado.`,
      confirmLabel: "Fazer check-in",
    });
    if (!confirmed) return;
    const stay = await api.post(`/api/reservations/${reservation.id}/check-in`);
    closeReservationDrawer(backdrop);
    toast("Check-in realizado. Reserva marcada como Hospedado.");
    window.dispatchEvent(new CustomEvent("app:navigate", {
      detail: { route: "hospedagens", params: { open: stay.id } },
    }));
  }
}

function normalizeDrawerStatusLabel(body, status) {
  const statusItem = [...body.querySelectorAll(".detail-item")]
    .find((item) => item.querySelector("span")?.textContent?.trim() === "Situação");
  const value = statusItem?.querySelector("strong");
  if (value) value.textContent = labelForStatus(status);
}

async function enhanceReservationDrawer(backdrop, reservationId) {
  const drawer = backdrop?.querySelector?.(".drawer");
  if (!drawer || drawer.dataset.reservationStatusEnhanced === "true") return;
  const eyebrow = drawer.querySelector(".drawer__header .eyebrow")?.textContent?.trim();
  if (eyebrow !== "Detalhes da reserva" || !reservationId) return;

  drawer.dataset.reservationStatusEnhanced = "true";
  const body = drawer.querySelector(".drawer__body");
  if (!body) return;

  try {
    const reservation = await api.get(`/api/reservations/${reservationId}`);
    const currentStatus = canonicalStatus(reservation.status);
    normalizeDrawerStatusLabel(body, reservation.status);

    const panel = document.createElement("section");
    panel.className = "card";
    panel.dataset.reservationStatusPanel = "true";
    panel.style.margin = "16px 0";
    panel.innerHTML = `<div class="card__body"><div class="field"><label for="reservation-direct-status-${reservation.id}">Situação da reserva</label><select id="reservation-direct-status-${reservation.id}" data-reservation-direct-status>${visibleReservationStatuses.map(([value, label]) => `<option value="${value}"${value === currentStatus ? " selected" : ""}>${label}</option>`).join("")}</select><p class="muted" data-status-description>${statusDescriptions[currentStatus] || ""}</p></div><button class="button button--secondary" data-save-reservation-status>Alterar situação</button></div>`;

    const identity = body.querySelector(".identity-cell");
    if (identity) identity.insertAdjacentElement("afterend", panel);
    else body.prepend(panel);

    const select = panel.querySelector("[data-reservation-direct-status]");
    const description = panel.querySelector("[data-status-description]");
    const save = panel.querySelector("[data-save-reservation-status]");

    select.addEventListener("change", () => {
      description.textContent = statusDescriptions[select.value] || "";
    });
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        await changeReservationStatus(reservation, select.value, backdrop);
      } catch (error) {
        save.disabled = false;
        toast(error.message, { title: "Situação não alterada", type: "danger" });
      }
    });

    drawer.querySelector("[data-cancel-reservation]")?.remove();
    drawer.querySelector("[data-no-show]")?.remove();
    refreshIcons(panel);
  } catch (error) {
    drawer.dataset.reservationStatusEnhanced = "false";
    toast(error.message, { title: "Situação indisponível", type: "danger" });
  }
}

function installReservationInterfaceObserver() {
  const mainRoot = document.getElementById("main-view");
  const overlayRoot = document.getElementById("overlay-root");

  if (mainRoot) {
    normalizeReservationInterface(mainRoot);
    const mainObserver = new window.MutationObserver(() => normalizeReservationInterface(mainRoot));
    mainObserver.observe(mainRoot, { childList: true, subtree: true });
  }

  if (overlayRoot) {
    normalizeReservationInterface(overlayRoot);
    const overlayObserver = new window.MutationObserver(() => {
      normalizeReservationInterface(overlayRoot);
      const backdrop = overlayRoot.lastElementChild;
      if (backdrop?.classList?.contains("drawer-backdrop")) {
        enhanceReservationDrawer(backdrop, lastReservationId);
      }
    });
    overlayObserver.observe(overlayRoot, { childList: true, subtree: true });
  }
}

function checkedInReservationTarget(target) {
  const item = target?.closest?.("[data-open]");
  if (!item) return null;
  const checkedIn = item.dataset.status === "checked_in" || Boolean(item.querySelector?.(".status--checked_in"));
  return checkedIn ? item : null;
}

async function findLinkedStay(reservation) {
  for (const tab of ["active", "completed"]) {
    const stays = await api.get("/api/stays", { tab, q: reservation.code });
    const stay = stays.find((item) => Number(item.reservation_id) === Number(reservation.id))
      || stays.find((item) => item.reservation_code === reservation.code);
    if (stay) return { stay, tab };
  }
  return null;
}

async function openLinkedStay(reservationId) {
  const reservation = await api.get(`/api/reservations/${reservationId}`);
  const linked = await findLinkedStay(reservation);
  if (!linked) {
    toast("A reserva está marcada como hospedada, mas a hospedagem correspondente não foi localizada.", {
      title: "Hospedagem não encontrada",
      type: "danger",
    });
    return;
  }

  window.dispatchEvent(new CustomEvent("app:navigate", {
    detail: { route: "hospedagens", params: { tab: linked.tab, open: linked.stay.id } },
  }));
}

function interceptReservationActivation(event) {
  const item = event.target?.closest?.("[data-open]");
  if (!item) return;
  lastReservationId = item.dataset.open;

  const checkedIn = checkedInReservationTarget(event.target);
  if (!checkedIn) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  if (item.dataset.openingStay === "true") return;
  item.dataset.openingStay = "true";
  openLinkedStay(item.dataset.open)
    .catch((error) => toast(error.message, { title: "Hospedagem não disponível", type: "danger" }))
    .finally(() => { delete item.dataset.openingStay; });
}

function interceptReservationKey(event) {
  if (!["Enter", " "].includes(event.key)) return;
  interceptReservationActivation(event);
}

export function installReservationReopen() {
  installReservationInterfaceObserver();
  window.addEventListener("app:navigate", (event) => {
    if (event.detail?.route === "reservas" && event.detail?.params?.open) {
      lastReservationId = String(event.detail.params.open);
    }
  });
  document.addEventListener("click", interceptReservationActivation, true);
  document.addEventListener("keydown", interceptReservationKey, true);
}
