import { api } from "../api.js";
import { toast } from "./ui.js";

function reopenableReservationTarget(target) {
  const item = target?.closest?.("[data-open]");
  if (!item) return null;
  const status = item.dataset.status
    || (item.querySelector?.(".status--cancelled") ? "cancelled" : "")
    || (item.querySelector?.(".status--no_show") ? "no_show" : "");
  return ["cancelled", "no_show"].includes(status) ? item : null;
}

async function openReopenWizard(reservationId) {
  const reservation = await api.get(`/api/reservations/${reservationId}`);
  window.dispatchEvent(new CustomEvent("app:new-reservation", {
    detail: { initial: reservation },
  }));
  toast("Altere a situação para Pendente, Confirmada ou Aguardando check-in para reabrir a reserva.", {
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

function interceptReopenableReservationKey(event) {
  if (!["Enter", " "].includes(event.key)) return;
  interceptReopenableReservation(event);
}

export function installReservationReopen() {
  document.addEventListener("click", interceptReopenableReservation, true);
  document.addEventListener("keydown", interceptReopenableReservationKey, true);
}
