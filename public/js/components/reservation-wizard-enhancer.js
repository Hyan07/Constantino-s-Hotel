import { api } from "../api.js";
import { escapeHtml } from "../utils/format.js";
import { toast } from "./ui.js";

const modalState = new WeakMap();
const editableStatuses = [
  ["pending", "Pendente"],
  ["confirmed", "Confirmada"],
  ["awaiting_checkin", "Aguardando check-in"],
];
let lastProtectedCloseNotice = 0;

function reservationBackdropFrom(node) {
  const backdrop = node?.closest?.(".modal-backdrop");
  return backdrop?.querySelector("#wizard-content") ? backdrop : null;
}

function stateFor(backdrop) {
  if (!modalState.has(backdrop)) modalState.set(backdrop, {});
  return modalState.get(backdrop);
}

function money(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const start = new Date(`${checkIn}T12:00:00`);
  const end = new Date(`${checkOut}T12:00:00`);
  const nights = Math.round((end - start) / 86_400_000);
  return Number.isFinite(nights) && nights > 0 ? nights : 0;
}

function digitsOnly(value, limit) {
  return String(value || "").replace(/\D/g, "").slice(0, limit);
}

function formatCpf(value) {
  const digits = digitsOnly(value, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhone(value) {
  const digits = digitsOnly(value, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function enhanceQuickGuest(wizard) {
  const form = wizard.querySelector("#quick-guest");
  if (!form || form.dataset.enhancedQuickGuest === "true") return;
  form.dataset.enhancedQuickGuest = "true";

  form.elements.email?.closest(".field")?.remove();
  const cpf = form.elements.cpf;
  const phone = form.elements.phone;

  if (cpf) {
    cpf.inputMode = "numeric";
    cpf.maxLength = 14;
    cpf.placeholder = "000.000.000-00";
    cpf.addEventListener("input", () => { cpf.value = formatCpf(cpf.value); });
  }
  if (phone) {
    phone.inputMode = "tel";
    phone.maxLength = 15;
    phone.placeholder = "(00) 00000-0000";
    phone.addEventListener("input", () => { phone.value = formatPhone(phone.value); });
  }

  form.addEventListener("submit", () => {
    if (cpf) cpf.value = digitsOnly(cpf.value, 11);
    if (phone) phone.value = digitsOnly(phone.value, 11);
  }, true);
}

function selectedGuestText(selected) {
  const name = selected.querySelector("strong")?.textContent?.trim() || "Hóspede";
  const detail = selected.querySelector(".cell-subtitle")?.textContent?.trim() || "Cadastro localizado";
  return { name, detail };
}

function enhanceGuestSelection(wizard) {
  const results = wizard.querySelector("#guest-results");
  const search = wizard.querySelector("#guest-search");
  if (!results || !search) return;

  let banner = wizard.querySelector("[data-selected-guest-banner]");
  if (!banner) {
    banner = document.createElement("div");
    banner.dataset.selectedGuestBanner = "true";
    banner.className = "form-alert";
    banner.style.borderLeft = "3px solid var(--success)";
    banner.style.background = "var(--success-bg)";
    banner.style.margin = "10px 0";
    banner.hidden = true;
    results.before(banner);
  }

  const backdrop = reservationBackdropFrom(wizard);
  const state = backdrop ? stateFor(backdrop) : {};
  const selected = results.querySelector(".guest-result.is-selected");
  if (selected) state.selectedGuest = selectedGuestText(selected);
  if (!state.selectedGuest) {
    banner.hidden = true;
    return;
  }

  const { name, detail } = state.selectedGuest;
  banner.hidden = false;
  banner.innerHTML = `<strong>✓ Hóspede selecionado: ${escapeHtml(name)}</strong><span style="display:block;margin-top:3px">${escapeHtml(detail)} · Você pode continuar para a próxima etapa.</span>`;
}

function rememberPeriod(backdrop, wizard) {
  const checkIn = wizard.querySelector('[name="checkIn"]');
  const checkOut = wizard.querySelector('[name="checkOut"]');
  if (!checkIn || !checkOut) return;

  const state = stateFor(backdrop);
  const sync = () => {
    state.checkIn = checkIn.value;
    state.checkOut = checkOut.value;
  };
  sync();

  if (checkIn.dataset.reservationPeriodBound !== "true") {
    checkIn.dataset.reservationPeriodBound = "true";
    checkIn.addEventListener("input", sync);
    checkIn.addEventListener("change", sync);
  }
  if (checkOut.dataset.reservationPeriodBound !== "true") {
    checkOut.dataset.reservationPeriodBound = "true";
    checkOut.addEventListener("input", sync);
    checkOut.addEventListener("change", sync);
  }
}

function enhanceStatus(backdrop, wizard) {
  const modalTitle = backdrop.querySelector(".modal__header h2")?.textContent?.trim() || "";
  if (!modalTitle.startsWith("Editar ")) return;

  const select = wizard.querySelector('select[name="status"]');
  if (!select || select.dataset.reservationStatusEnhanced === "true") return;
  select.dataset.reservationStatusEnhanced = "true";
  const current = select.value;

  editableStatuses.forEach(([value, label]) => {
    if (select.querySelector(`option[value="${value}"]`)) return;
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  });
  if (editableStatuses.some(([value]) => value === current)) select.value = current;
}

function enhanceValues(backdrop, wizard) {
  const dailyRate = wizard.querySelector('[name="dailyRate"]');
  const discount = wizard.querySelector('[name="discount"]');
  const surcharge = wizard.querySelector('[name="surcharge"]');
  if (!dailyRate || !discount || !surcharge) return;

  const preview = [...wizard.querySelectorAll("input[disabled]")].find((input) => (
    input.closest(".field")?.querySelector("label")?.textContent?.includes("Prévia do total")
  ));
  if (!preview) return;

  let breakdown = wizard.querySelector("[data-financial-breakdown]");
  if (!breakdown) {
    breakdown = document.createElement("div");
    breakdown.dataset.financialBreakdown = "true";
    breakdown.className = "form-alert span-2";
    preview.closest(".field")?.insertAdjacentElement("afterend", breakdown);
  }

  const update = () => {
    const state = stateFor(backdrop);
    const nights = nightsBetween(state.checkIn, state.checkOut);
    const rate = Math.max(0, Number(dailyRate.value || 0));
    const discountValue = Math.max(0, Number(discount.value || 0));
    const surchargeValue = Math.max(0, Number(surcharge.value || 0));
    const subtotal = rate * nights;
    const total = Math.max(0, subtotal - discountValue + surchargeValue);
    preview.value = money(total);
    breakdown.innerHTML = `<strong>Cálculo automático</strong><span style="display:block;margin-top:4px">${nights} diária(s) × ${money(rate)} = ${money(subtotal)} · Desconto − ${money(discountValue)} · Acréscimo + ${money(surchargeValue)}</span><strong style="display:block;margin-top:6px;font-size:1rem">Total: ${money(total)}</strong>`;
  };

  for (const input of [dailyRate, discount, surcharge]) {
    if (input.dataset.financialPreviewBound === "true") continue;
    input.dataset.financialPreviewBound = "true";
    input.addEventListener("input", update);
    input.addEventListener("change", update);
  }
  update();
}

function enhanceWizard(backdrop) {
  const wizard = backdrop.querySelector("#wizard-content");
  if (!wizard) return;
  rememberPeriod(backdrop, wizard);
  enhanceStatus(backdrop, wizard);
  enhanceQuickGuest(wizard);
  enhanceGuestSelection(wizard);
  enhanceValues(backdrop, wizard);
}

function enhanceReservationDrawers(root) {
  root.querySelectorAll(".drawer").forEach((drawer) => {
    const eyebrow = drawer.querySelector(".eyebrow")?.textContent?.trim();
    if (eyebrow !== "Detalhes da reserva") return;
    const edit = drawer.querySelector("[data-edit]");
    if (edit) edit.textContent = "Editar reserva / situação";
  });
}

function protectWizardBackdrop(event) {
  const backdrop = event.target?.closest?.(".modal-backdrop") || null;
  if (!backdrop || event.target !== backdrop || !backdrop.querySelector("#wizard-content")) return;
  event.preventDefault();
  event.stopPropagation();
  const now = Date.now();
  if (now - lastProtectedCloseNotice > 1800) {
    lastProtectedCloseNotice = now;
    toast("A nova reserva continua aberta. Use o X no canto superior somente se realmente quiser sair.", {
      title: "Rascunho preservado",
      type: "info",
    });
  }
}

function protectWizardEscape(event) {
  if (event.key !== "Escape") return;
  const root = document.getElementById("overlay-root");
  const top = root?.lastElementChild;
  if (!top?.querySelector?.("#wizard-content")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const now = Date.now();
  if (now - lastProtectedCloseNotice > 1800) {
    lastProtectedCloseNotice = now;
    toast("A reserva não foi fechada para evitar perda do preenchimento. Use o X se quiser sair.", {
      title: "Rascunho preservado",
      type: "info",
    });
  }
}

function checkedInReservationTarget(target) {
  const item = target?.closest?.("[data-open]");
  if (!item) return null;
  const checkedIn = item.dataset.status === "checked_in" || Boolean(item.querySelector?.(".status--checked_in"));
  return checkedIn ? item : null;
}

async function openLinkedStay(reservationId) {
  const reservation = await api.get(`/api/reservations/${reservationId}`);
  const stays = await api.get("/api/stays", { tab: "active", q: reservation.code });
  const stay = stays.find((item) => Number(item.reservation_id) === Number(reservation.id))
    || stays.find((item) => item.reservation_code === reservation.code);

  if (!stay) {
    toast("A reserva está marcada como hospedada, mas a hospedagem ativa correspondente não foi localizada.", {
      title: "Hospedagem não encontrada",
      type: "danger",
    });
    return;
  }

  window.dispatchEvent(new CustomEvent("app:navigate", {
    detail: { route: "hospedagens", params: { open: stay.id } },
  }));
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

function interceptCheckedInReservationKey(event) {
  if (!["Enter", " "].includes(event.key)) return;
  interceptCheckedInReservation(event);
}

export function installReservationWizardEnhancer() {
  const root = document.getElementById("overlay-root");
  if (!root || root.dataset.reservationWizardEnhancer === "true") return;
  root.dataset.reservationWizardEnhancer = "true";

  root.addEventListener("click", protectWizardBackdrop, true);
  root.addEventListener("click", (event) => {
    if (!event.target.closest?.("[data-guest]")) return;
    const backdrop = reservationBackdropFrom(event.target);
    if (backdrop) Promise.resolve().then(() => enhanceWizard(backdrop));
  });
  window.addEventListener("keydown", protectWizardEscape, true);
  document.addEventListener("click", interceptCheckedInReservation, true);
  document.addEventListener("keydown", interceptCheckedInReservationKey, true);

  const enhance = () => {
    root.querySelectorAll(".modal-backdrop").forEach((backdrop) => enhanceWizard(backdrop));
    enhanceReservationDrawers(root);
  };
  enhance();
  const observer = new window.MutationObserver(enhance);
  observer.observe(root, { childList: true, subtree: true });
}
