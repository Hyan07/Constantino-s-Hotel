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
};

function canonicalStatus(status) {
  return legacyStatusAliases[status] || status;
}

function isReservationPage(root) {
  const eyebrow = root.querySelector?.(".page-header .eyebrow")?.textContent?.trim();
  return eyebrow === "Reservas"
    || Boolean(root.querySelector?.("#reservation-status"))
    || Boolean(root.querySelector?.(".hotel-calendar"));
}

function setStatusOptions(select, options, { includeAll = false } = {}) {
  if (!select) return;
  const current = canonicalStatus(select.value);
  const expected = [
    ...(includeAll ? [["", "Todas"]] : []),
    ...options,
  ];
  const currentSignature = [...select.options]
    .map((option) => `${option.value}:${option.textContent}`)
    .join("|");
  const expectedSignature = expected
    .map(([value, label]) => `${value}:${label}`)
    .join("|");

  if (currentSignature !== expectedSignature) {
    select.innerHTML = expected
      .map(([value, label]) => `<option value="${value}">${label}</option>`)
      .join("");
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

    if (current === "completed") {
      setStatusOptions(select, [["completed", "Finalizada"]]);
      return;
    }

    setStatusOptions(select, [
      ["pending", "Pendente"],
      ["confirmed", "Confirmada"],
    ]);
  });

  // O drawer de detalhes deve ser somente informativo. A situação continua
  // visível na grade "Estadia", mas não deve existir um card superior paralelo
  // para edição. As ações operacionais permanecem no rodapé do drawer.
  root.querySelectorAll?.("[data-reservation-status-panel]").forEach((panel) => panel.remove());
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
    const overlayObserver = new window.MutationObserver(() => normalizeReservationInterface(overlayRoot));
    overlayObserver.observe(overlayRoot, { childList: true, subtree: true });
  }
}

function checkedInReservationTarget(target) {
  const item = target?.closest?.("[data-open]");
  if (!item) return null;
  const checkedIn = item.dataset.status === "checked_in"
    || Boolean(item.querySelector?.(".status--checked_in"));
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
  document.addEventListener("click", interceptReservationActivation, true);
  document.addEventListener("keydown", interceptReservationKey, true);
}
