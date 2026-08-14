import { api } from "../api.js";

const fallbackSources = ["Direta", "Telefone", "WhatsApp", "Instagram", "Booking.com", "Expedia", "Agência / empresa"];
let sourcePromise;

function sources() {
  if (!sourcePromise) {
    sourcePromise = api.get("/api/settings")
      .then((settings) => Array.isArray(settings.reservationSources) && settings.reservationSources.length ? settings.reservationSources : fallbackSources)
      .catch(() => fallbackSources);
  }
  return sourcePromise;
}

async function enhance(input) {
  if (!input?.isConnected || input.dataset.sourceEnhancing === "true") return;
  input.dataset.sourceEnhancing = "true";
  const configured = await sources();
  if (!input.isConnected) return;
  const current = String(input.value || "Direta").trim() || "Direta";
  const items = configured.includes(current) ? configured : [current, ...configured];
  const select = document.createElement("select");
  select.name = input.name;
  select.id = input.id;
  select.className = input.className;
  select.required = true;
  select.setAttribute("aria-label", input.getAttribute("aria-label") || "Origem da reserva");
  for (const value of items) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    option.selected = value === current;
    select.append(option);
  }
  input.replaceWith(select);
}

function scan(root = document) {
  if (root instanceof HTMLElement && root.matches('input[name="source"]')) enhance(root);
  root.querySelectorAll?.('input[name="source"]').forEach((input) => enhance(input));
}

export function installReservationSourceEnhancer() {
  sources();
  scan();
  const observer = new window.MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) if (node instanceof HTMLElement) scan(node);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
