import { api } from "../api.js";
import { toast } from "./ui.js";

let pendingStayPrintId = null;

function ensureMobilePrintStyles() {
  if (document.getElementById("print-mobile-actions")) return;
  const style = document.createElement("style");
  style.id = "print-mobile-actions";
  style.textContent = `
    @media (max-width: 680px) {
      .drawer__footer [data-print-contract],
      .drawer__footer [data-guest-print-term] {
        flex: 1 0 100%;
        width: 100%;
        order: -1;
        margin-right: 0 !important;
      }
    }
  `;
  document.head.append(style);
}

function ensureDrawerFooter(drawer) {
  let footer = drawer.querySelector(":scope > .drawer__footer");
  if (footer) return footer;
  footer = document.createElement("footer");
  footer.className = "drawer__footer";
  drawer.append(footer);
  return footer;
}

function simplifyPrintModal(form) {
  if (!form || form.dataset.printActionReady === "true") return;
  form.dataset.printActionReady = "true";

  const modal = form.closest(".modal");
  modal?.classList.remove("modal--wide");

  form.querySelector('[name="documentTitle"]')?.closest(".field")?.setAttribute("hidden", "");
  form.querySelector('[name="documentSubtitle"]')?.closest(".field")?.setAttribute("hidden", "");

  const note = form.querySelector('[name="copyNote"]');
  if (note) {
    const field = note.closest(".field");
    const label = field?.querySelector("label");
    if (label) label.textContent = "Observação";
    note.setAttribute("placeholder", "Opcional. Será incluída somente nesta via impressa.");
    note.setAttribute("rows", "5");
  }

  form.querySelector(".section-title")?.setAttribute("hidden", "");
  const grids = form.querySelectorAll(":scope > .form-grid");
  grids[1]?.setAttribute("hidden", "");
  form.querySelector(".form-alert")?.setAttribute("hidden", "");
  form.querySelector("[data-print-inline]")?.closest(".toolbar")?.remove();

  const footerButton = modal?.querySelector("[data-print-now]");
  if (footerButton) {
    footerButton.textContent = "Imprimir agora";
    footerButton.setAttribute("aria-label", "Imprimir agora");
  }
}

function primeStaySelection(stayId, drawer) {
  const marker = document.createElement("button");
  marker.type = "button";
  marker.hidden = true;
  marker.dataset.open = String(stayId);
  drawer.append(marker);
  marker.click();
  marker.remove();
}

function moveStayPrintButton(drawer) {
  const button = drawer.querySelector("[data-print-contract]");
  if (!button) return;

  const footer = ensureDrawerFooter(drawer);
  if (button.closest(".drawer__footer") !== footer) {
    const oldContainer = button.parentElement;
    footer.prepend(button);
    if (oldContainer?.classList.contains("toolbar") && !oldContainer.children.length) oldContainer.remove();
  }

  button.classList.remove("button--secondary");
  button.classList.add("button--primary");
  button.style.marginRight = "auto";

  if (pendingStayPrintId) {
    const stayId = pendingStayPrintId;
    pendingStayPrintId = null;
    primeStaySelection(stayId, drawer);
    Promise.resolve().then(() => button.click());
  }
}

async function findLatestStay(drawer) {
  const reservationButtons = [...drawer.querySelectorAll("[data-reservation]")].slice(0, 20);
  for (const button of reservationButtons) {
    const reservation = await api.get(`/api/reservations/${button.dataset.reservation}`);
    const tab = reservation.status === "completed"
      ? "completed"
      : reservation.status === "checked_in"
        ? "active"
        : null;
    if (!tab) continue;
    const stays = await api.get("/api/stays", { tab, q: reservation.code });
    const stay = stays.find((item) => item.reservation_code === reservation.code);
    if (stay) return stay;
  }
  return null;
}

function enhanceGuestDrawer(drawer) {
  const eyebrow = drawer.querySelector(".eyebrow")?.textContent?.trim();
  if (eyebrow !== "Perfil do hóspede" || drawer.dataset.guestPrintReady === "true") return;
  drawer.dataset.guestPrintReady = "true";

  if (!drawer.querySelector("[data-reservation]")) return;
  const footer = ensureDrawerFooter(drawer);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button--secondary";
  button.dataset.guestPrintTerm = "true";
  button.textContent = "Imprimir termo";
  footer.prepend(button);

  button.addEventListener("click", async () => {
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "Localizando termo...";
    try {
      const stay = await findLatestStay(drawer);
      if (!stay) {
        toast("Este hóspede ainda não possui uma hospedagem com termo disponível.", { title: "Termo não encontrado", type: "danger" });
        return;
      }
      pendingStayPrintId = String(stay.id);
      drawer.querySelector("[data-close]")?.click();
      window.dispatchEvent(new CustomEvent("app:navigate", {
        detail: { route: "hospedagens", params: { open: stay.id } },
      }));
    } catch (error) {
      toast(error.message, { title: "Impressão não disponível", type: "danger" });
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  });
}

function enhanceOverlays(root) {
  root.querySelectorAll("#stay-print-options").forEach((form) => simplifyPrintModal(form));
  root.querySelectorAll(".drawer").forEach((drawer) => {
    moveStayPrintButton(drawer);
    enhanceGuestDrawer(drawer);
  });
}

export function installPrintActionFix() {
  const root = document.getElementById("overlay-root");
  if (!root) return;

  ensureMobilePrintStyles();
  const enhance = () => enhanceOverlays(root);
  enhance();
  const observer = new window.MutationObserver(enhance);
  observer.observe(root, { childList: true, subtree: true });
}
