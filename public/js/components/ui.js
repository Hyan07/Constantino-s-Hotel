import { escapeHtml } from "../utils/format.js";
import { getState } from "../state.js";

const overlayRoot = () => document.getElementById("overlay-root");
let overlaySequence = 0;

export function refreshIcons(root = document) {
  if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.8 }, root });
}

export function setMain(html) {
  const view = document.getElementById("main-view");
  const environment = getState().environment;
  const banner = environment === "production" ? "" : `<div class="environment-banner">${environment === "staging" ? "AMBIENTE DEV · DADOS FICTÍCIOS" : "AMBIENTE LOCAL · NÃO USE DADOS REAIS"}</div>`;
  view.innerHTML = `${banner}${html}`;
  refreshIcons(view);
  view.focus?.();
}

export function pageLoading() {
  return `<div class="page-shell"><div class="page-header"><div><div class="skeleton skeleton-line" style="width:90px"></div><div class="skeleton skeleton-line" style="width:260px;height:34px"></div></div></div><div class="card"><div class="card__body"><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line" style="width:72%"></div></div></div></div>`;
}

export function emptyState(title, description, icon = "inbox") {
  return `<div class="empty-state"><div><i data-lucide="${icon}" aria-hidden="true"></i><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div></div>`;
}

export function toast(message, { title = "Tudo certo", type = "success", duration = 4200 } = {}) {
  const root = document.getElementById("toast-root");
  const element = document.createElement("div");
  element.className = `toast toast--${type}`;
  element.setAttribute("role", type === "danger" ? "alert" : "status");
  element.innerHTML = `<i data-lucide="${type === "danger" ? "circle-alert" : type === "success" ? "circle-check" : "info"}" aria-hidden="true"></i><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div>`;
  root.append(element);
  refreshIcons(element);
  setTimeout(() => element.remove(), duration);
}

function setApplicationInert(inert) {
  const app = document.getElementById("app");
  if (!app) return;
  if (inert) app.setAttribute("inert", "");
  else app.removeAttribute("inert");
}

function closeOverlay(backdrop) {
  backdrop.remove();
  const hasOverlays = overlayRoot().children.length > 0;
  document.body.style.overflow = hasOverlays ? "hidden" : "";
  setApplicationInert(hasOverlays);
}

function overlayCloser(backdrop, { onClose } = {}) {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let closed = false;
  const close = (reason = "programmatic") => {
    if (closed) return;
    closed = true;
    window.removeEventListener("keydown", keydown);
    closeOverlay(backdrop);
    onClose?.(reason);
    queueMicrotask(() => {
      if (opener?.isConnected) opener.focus();
    });
  };
  const keydown = (event) => {
    if (overlayRoot().lastElementChild !== backdrop) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close("escape");
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...backdrop.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) {
      event.preventDefault();
      backdrop.querySelector('[role="dialog"]')?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!backdrop.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  window.addEventListener("keydown", keydown);
  return close;
}

export function showDrawer({ title, eyebrow = "Detalhes", content, footer = "", onMount, onClose }) {
  const backdrop = document.createElement("div");
  const titleId = `drawer-title-${++overlaySequence}`;
  backdrop.className = "drawer-backdrop";
  backdrop.innerHTML = `<aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1"><header class="drawer__header"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h2 id="${titleId}">${escapeHtml(title)}</h2></div><button class="icon-button" data-close aria-label="Fechar"><i data-lucide="x"></i></button></header><div class="drawer__body">${content}</div>${footer ? `<footer class="drawer__footer">${footer}</footer>` : ""}</aside>`;
  overlayRoot().append(backdrop);
  document.body.style.overflow = "hidden";
  setApplicationInert(true);
  const close = overlayCloser(backdrop, { onClose });
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close("backdrop");
    else if (event.target.closest("[data-close]")) close("close-button");
  });
  refreshIcons(backdrop);
  onMount?.(backdrop, close);
  backdrop.querySelector("[data-close]")?.focus();
  return { element: backdrop, close };
}

export function showModal({ title, eyebrow = "", content, footer = "", wide = false, onMount, onClose }) {
  const backdrop = document.createElement("div");
  const titleId = `modal-title-${++overlaySequence}`;
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<section class="modal${wide ? " modal--wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1"><header class="modal__header"><div>${eyebrow ? `<p class="eyebrow">${escapeHtml(eyebrow)}</p>` : ""}<h2 id="${titleId}">${escapeHtml(title)}</h2></div><button class="icon-button" data-close aria-label="Fechar"><i data-lucide="x"></i></button></header><div class="modal__body">${content}</div>${footer ? `<footer class="modal__footer">${footer}</footer>` : ""}</section>`;
  overlayRoot().append(backdrop);
  document.body.style.overflow = "hidden";
  setApplicationInert(true);
  const close = overlayCloser(backdrop, { onClose });
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close("backdrop");
    else if (event.target.closest("[data-close]")) close("close-button");
  });
  refreshIcons(backdrop);
  onMount?.(backdrop, close);
  backdrop.querySelector("[data-close]")?.focus();
  return { element: backdrop, close };
}

export function confirmDialog({ title, message, confirmLabel = "Confirmar", danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value, close) => {
      if (settled) return;
      settled = true;
      close(value ? "confirm" : "cancel");
      resolve(value);
    };
    showModal({
      title,
      content: `<p class="muted">${escapeHtml(message)}</p>`,
      footer: `<button class="button button--ghost" data-cancel>Cancelar</button><button class="button ${danger ? "button--danger" : "button--primary"}" data-confirm>${escapeHtml(confirmLabel)}</button>`,
      onClose() {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      },
      onMount(element, close) {
        element.querySelector("[data-cancel]").addEventListener("click", () => finish(false, close));
        element.querySelector("[data-confirm]").addEventListener("click", () => finish(true, close));
        element.querySelector("[data-confirm]").focus();
      },
    });
  });
}

export function errorPanel(error) {
  return `<div class="empty-state"><div><i data-lucide="circle-alert"></i><h3>Não foi possível carregar</h3><p>${escapeHtml(error.message || "Tente novamente.")}</p><button class="button button--secondary" data-retry style="margin-top:14px">Tentar novamente</button></div></div>`;
}
