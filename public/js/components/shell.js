import { api } from "../api.js";
import { getState, hasPermission } from "../state.js";
import { debounce, escapeHtml, initials } from "../utils/format.js";
import { refreshIcons, showDrawer, showModal, toast } from "./ui.js";

const navigation = [
  { route: "dashboard", label: "Visão Geral", icon: "layout-dashboard", permission: "reservations.read" },
  { route: "reservas", label: "Reservas", icon: "calendar-days", permission: "reservations.read" },
  { route: "hospedagens", label: "Hospedagens", icon: "bed-double", permission: "stays.read" },
  { route: "quartos", label: "Quartos", icon: "door-open", permission: "rooms.read" },
  { route: "hospedes", label: "Hóspedes", icon: "users", permission: "guests.read" },
  { route: "administracao", label: "Administração", icon: "settings", permission: "administration.write" },
];

function navigate(route, params = {}) {
  const query = new URLSearchParams(params).toString();
  window.location.hash = `#/${route}${query ? `?${query}` : ""}`;
}

function currentDateLabel() {
  const label = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date());
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function accountDrawer() {
  const { user } = getState();
  showDrawer({
    title: user.name,
    eyebrow: "Minha conta",
    content: `<div class="detail-grid">
      <div class="detail-item"><span>CPF</span><strong>${escapeHtml(user.cpf)}</strong></div>
      <div class="detail-item"><span>E-mail</span><strong>${escapeHtml(user.email || "Não informado")}</strong></div>
      <div class="detail-item"><span>Perfis</span><strong>${escapeHtml(user.roles.join(", "))}</strong></div>
      <div class="detail-item"><span>Último acesso</span><strong>${escapeHtml(user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("pt-BR") : "Primeiro acesso")}</strong></div>
    </div>
    <h3 class="section-title">Segurança</h3>
    <p class="muted">A sessão expira automaticamente por segurança. Ao alterar a senha, todos os acessos ativos serão encerrados.</p>`,
    footer: `<button class="button button--secondary" data-password><i data-lucide="key-round"></i>Alterar senha</button>`,
    onMount(element, close) {
      element.querySelector("[data-password]").addEventListener("click", () => {
        close();
        passwordModal();
      });
    },
  });
}

function passwordModal() {
  showModal({
    title: "Alterar senha",
    eyebrow: "Segurança",
    content: `<form id="change-password-form" class="form-grid">
      <div class="field span-2"><label for="current-password">Senha atual</label><input id="current-password" name="currentPassword" type="password" autocomplete="current-password" required></div>
      <div class="field"><label for="new-password">Nova senha</label><input id="new-password" name="newPassword" type="password" autocomplete="new-password" minlength="12" required></div>
      <div class="field"><label for="confirm-password">Confirmar nova senha</label><input id="confirm-password" name="confirmation" type="password" autocomplete="new-password" minlength="12" required></div>
      <p class="form-alert span-2">Use ao menos 12 caracteres, com maiúscula, minúscula, número e símbolo.</p>
      <p id="password-error" class="form-alert form-alert--danger span-2" hidden></p>
    </form>`,
    footer: `<button class="button button--ghost" data-close>Cancelar</button><button class="button button--primary" data-save>Salvar nova senha</button>`,
    onMount(element, close) {
      element.querySelector("[data-save]").addEventListener("click", async () => {
        const form = element.querySelector("#change-password-form");
        const error = element.querySelector("#password-error");
        if (!form.reportValidity()) return;
        const data = Object.fromEntries(new FormData(form));
        if (data.newPassword !== data.confirmation) {
          error.textContent = "A confirmação não corresponde à nova senha.";
          error.hidden = false;
          return;
        }
        try {
          await api.post("/api/auth/change-password", data);
          close();
          window.location.assign("/login.html?passwordChanged=1");
        } catch (requestError) {
          error.textContent = requestError.message;
          error.hidden = false;
        }
      });
    },
  });
}

function installSearch(root) {
  const wrapper = root.querySelector(".global-search");
  const input = wrapper.querySelector("input");
  const results = wrapper.querySelector(".search-results");
  let searchSequence = 0;

  const setResultsVisible = (visible) => {
    results.hidden = !visible;
    input.setAttribute("aria-expanded", String(visible));
  };

  const search = debounce(async (q, sequence) => {
    try {
      const items = await api.get("/api/search", { q });
      if (sequence !== searchSequence || input.value.trim() !== q) return;
      results.innerHTML = items.length ? items.map((item) => `<button class="search-result" data-type="${item.type}" data-id="${item.id}">
        <i data-lucide="${item.type === "guest" ? "user" : item.type === "room" ? "door-open" : item.type === "stay" ? "bed-double" : "calendar"}"></i>
        <span><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.subtitle || "")}</span></span>
      </button>`).join("") : `<p class="muted">Nenhum resultado encontrado.</p>`;
      setResultsVisible(true);
      refreshIcons(results);
    } catch (error) {
      if (sequence !== searchSequence || input.value.trim() !== q) return;
      results.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
      setResultsVisible(true);
    }
  }, 280);

  input.addEventListener("input", () => {
    const q = input.value.trim();
    searchSequence += 1;
    if (q.length < 2) {
      setResultsVisible(false);
      return;
    }
    search(q, searchSequence);
  });
  input.addEventListener("focus", () => wrapper.classList.add("is-open"));
  input.addEventListener("blur", () => {
    if (!input.value.trim()) wrapper.classList.remove("is-open");
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && !results.hidden) {
      const first = results.querySelector("button");
      if (first) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  results.addEventListener("keydown", (event) => {
    const buttons = [...results.querySelectorAll("button")];
    const index = buttons.indexOf(document.activeElement);
    if (!buttons.length || index < 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      buttons[(index + 1) % buttons.length].focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      buttons[(index - 1 + buttons.length) % buttons.length].focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setResultsVisible(false);
      input.focus();
    }
  });
  results.addEventListener("click", (event) => {
    const item = event.target.closest("[data-type]");
    if (!item) return;
    const map = { guest: "hospedes", room: "quartos", reservation: "reservas", stay: "hospedagens" };
    navigate(map[item.dataset.type], { open: item.dataset.id });
    setResultsVisible(false);
    input.value = "";
    wrapper.classList.remove("is-open");
  });
  document.addEventListener("click", (event) => {
    if (!wrapper.contains(event.target)) {
      setResultsVisible(false);
      if (!input.value.trim()) wrapper.classList.remove("is-open");
    }
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      wrapper.classList.add("is-open");
      input.focus();
      input.select();
    }
    if (event.key === "Escape" && document.activeElement === input) {
      input.blur();
      setResultsVisible(false);
      wrapper.classList.remove("is-open");
    }
  });
}

export function renderShell() {
  const { user, environment } = getState();
  const nav = navigation.filter((item) => hasPermission(item.permission)).map((item) => `
    <button class="nav-link" data-route="${item.route}" aria-label="${item.label}" title="${item.label}">
      <i data-lucide="${item.icon}" aria-hidden="true"></i><span>${item.label}</span>
    </button>`).join("");
  const root = document.getElementById("app");
  root.className = "";
  root.innerHTML = `<div class="app-layout">
    <aside class="sidebar" aria-label="Menu principal">
      <div class="sidebar__brand"><strong>Constantino's Hotel</strong><button class="icon-button sidebar__toggle" data-mobile-sidebar-close aria-label="Fechar menu"><i data-lucide="panel-left-close"></i></button></div>
      <nav class="sidebar__nav" aria-label="Navegação principal">${nav}</nav>
      <div class="sidebar__status"><strong>Sistema disponível</strong><span>${environment === "production" ? "Ambiente de produção" : "Ambiente de desenvolvimento"}</span></div>
    </aside>
    <div class="mobile-backdrop" data-mobile-close></div>
    <header class="app-header">
      <button class="icon-button mobile-menu-button" data-mobile-menu aria-label="Abrir menu" aria-expanded="false"><i data-lucide="menu"></i></button>
      <div class="header-greeting"><strong>Olá, ${escapeHtml(user.name.split(" ")[0])}</strong><span>${escapeHtml(currentDateLabel())}</span></div>
      <div class="header-spacer"></div>
      <div class="global-search">
        <input type="search" placeholder="Hóspede, quarto, reserva ou hospedagem" aria-label="Pesquisa global" aria-controls="global-search-results" aria-expanded="false" autocomplete="off">
        <i class="global-search__icon" data-lucide="search"></i>
        <div class="search-results" id="global-search-results" aria-live="polite" hidden></div>
      </div>
      <div class="header-actions">
        ${hasPermission("reservations.write") ? `<button class="header-action header-action--primary" data-new-reservation><i data-lucide="plus"></i><span>Nova reserva</span></button>` : ""}
        ${hasPermission("stays.write") ? `<button class="header-action" data-quick="checkin"><i data-lucide="log-in"></i><span>Check-in</span></button><button class="header-action" data-quick="checkout"><i data-lucide="log-out"></i><span>Check-out</span></button>` : ""}
      </div>
      <div class="avatar-wrap">
        <button class="avatar-button" data-account aria-haspopup="menu" aria-expanded="false" aria-controls="account-menu">${initials(user.name)}</button>
        <div class="account-menu" id="account-menu" role="menu" hidden>
          <button role="menuitem" data-profile><i data-lucide="user-round"></i>Minha conta</button>
          <button role="menuitem" data-password><i data-lucide="key-round"></i>Alterar senha</button>
          <button role="menuitem" data-logout><i data-lucide="log-out"></i>Sair</button>
        </div>
      </div>
    </header>
    <main class="main-content" id="main-view" tabindex="-1"></main>
  </div>`;
  refreshIcons(root);

  const layout = root.querySelector(".app-layout");
  const mobileMenuButton = root.querySelector("[data-mobile-menu]");
  const closeMobileMenu = () => {
    layout.classList.remove("is-mobile-open");
    mobileMenuButton.setAttribute("aria-expanded", "false");
  };
  mobileMenuButton.addEventListener("click", () => {
    const open = !layout.classList.contains("is-mobile-open");
    layout.classList.toggle("is-mobile-open", open);
    mobileMenuButton.setAttribute("aria-expanded", String(open));
  });
  root.querySelector("[data-mobile-sidebar-close]").addEventListener("click", closeMobileMenu);
  root.querySelector("[data-mobile-close]").addEventListener("click", closeMobileMenu);
  root.querySelector(".sidebar__nav").addEventListener("click", (event) => {
    const link = event.target.closest("[data-route]");
    if (!link) return;
    navigate(link.dataset.route);
    closeMobileMenu();
    if (event.detail > 0) link.blur();
  });
  root.querySelector("[data-new-reservation]")?.addEventListener("click", () => window.dispatchEvent(new CustomEvent("app:new-reservation")));
  root.querySelectorAll("[data-quick]").forEach((button) => button.addEventListener("click", () => navigate("hospedagens", { tab: button.dataset.quick })));

  const accountButton = root.querySelector("[data-account]");
  const accountMenu = root.querySelector(".account-menu");
  const setAccountMenu = (open, { focusFirst = false } = {}) => {
    accountMenu.hidden = !open;
    accountButton.setAttribute("aria-expanded", String(open));
    if (open && focusFirst) accountMenu.querySelector("button")?.focus();
  };
  accountButton.addEventListener("click", () => setAccountMenu(accountMenu.hidden));
  accountButton.addEventListener("keydown", (event) => {
    if (["ArrowDown", "Enter", " "].includes(event.key) && accountMenu.hidden) {
      event.preventDefault();
      setAccountMenu(true, { focusFirst: true });
    }
  });
  accountMenu.addEventListener("keydown", (event) => {
    const buttons = [...accountMenu.querySelectorAll("button")];
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      buttons[(index + 1) % buttons.length].focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      buttons[(index - 1 + buttons.length) % buttons.length].focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setAccountMenu(false);
      accountButton.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!root.querySelector(".avatar-wrap").contains(event.target)) setAccountMenu(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !accountMenu.hidden) {
      setAccountMenu(false);
      accountButton.focus();
    }
  });
  root.querySelector("[data-profile]").addEventListener("click", () => { setAccountMenu(false); accountDrawer(); });
  root.querySelector("[data-password]").addEventListener("click", () => { setAccountMenu(false); passwordModal(); });
  root.querySelector("[data-logout]").addEventListener("click", async () => {
    setAccountMenu(false);
    try {
      await api.post("/api/auth/logout");
      window.location.assign("/login.html");
    } catch (error) {
      toast(error.message, { title: "Não foi possível sair", type: "danger" });
    }
  });
  installSearch(root);
}

export function setActiveNavigation(route) {
  document.querySelectorAll(".nav-link").forEach((item) => item.classList.toggle("is-active", item.dataset.route === route));
}
