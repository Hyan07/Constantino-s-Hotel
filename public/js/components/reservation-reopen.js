import { api } from "../api.js";
import { toast } from "./ui.js";

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

function canonicalStatus(status) {
  return legacyStatusAliases[status] || status;
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

function normalizeReservationInterface(root = document) {
  root.querySelectorAll?.('[data-tab="completed"]').forEach((element) => element.remove());

  const filter = root.querySelector?.("#reservation-status");
  if (filter) setStatusOptions(filter, visibleReservationStatuses, { includeAll: true });

  root.querySelectorAll?.('#wizard-content select[name="status"]').forEach((select) => {
    const current = canonicalStatus(select.value);
    if (["cancelled", "no_show"].includes(current)) {
      const currentLabel = visibleReservationStatuses.find(([value]) => value === current)?.[1] || current;
      setStatusOptions(select, [
        [current, currentLabel],
        ["pending", "Pendente"],
        ["confirmed", "Confirmada"],
      ]);
      return;
    }
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

function installReservationInterfaceObserver() {
  const roots = [document.getElementById("main-view"), document.getElementById("overlay-root")].filter(Boolean);
  roots.forEach((root) => {
    normalizeReservationInterface(root);
    const observer = new window.MutationObserver(() => normalizeReservationInterface(root));
    observer.observe(root, { childList: true, subtree: true });
  });
}

function reopenableReservationTarget(target) {
  const item = target?.closest?.("[data-open]");
  if (!item) return null;
  const status = item.dataset.status
    || (item.querySelector?.(".status--cancelled") ? "cancelled" : "")
    || (item.querySelector?.(".status--no_show") ? "no_show" : "");
  return ["cancelled", "no_show"].includes(status) ? item : null;
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

async function openReopenWizard(reservationId) {
  const reservation = await api.get(`/api/reservations/${reservationId}`);
  window.dispatchEvent(new CustomEvent("app:new-reservation", {
    detail: { initial: reservation },
  }));
  toast("Altere a situação para Pendente ou Confirmada para reabrir a reserva.", {
    title: "Reserva pode ser reaberta",
    type: "info",
  });
}

function interceptReopenableReservation(event) {
  const item = reopenableReservationTarget(event.target);
  if (!item) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  if (item.dataset.openingReopen === "true") return;
  item.dataset.openingReopen = "true";
  openReopenWizard(item.dataset.open)
    .catch((error) => toast(error.message, { title: "Reserva não disponível", type: "danger" }))
    .finally(() => { delete item.dataset.openingReopen; });
}

function interceptCheckedInReservation(event) {
  const item = checkedInReservationTarget(event.target);
  if (!item) return;
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
  if (checkedInReservationTarget(event.target)) {
    interceptCheckedInReservation(event);
    return;
  }
  interceptReopenableReservation(event);
}

export function installReservationReopen() {
  installReservationInterfaceObserver();
  document.addEventListener("click", interceptReopenableReservation, true);
  document.addEventListener("click", interceptCheckedInReservation, true);
  document.addEventListener("keydown", interceptReservationKey, true);
}
