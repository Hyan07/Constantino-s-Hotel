import { api } from "../api.js";
import { refreshIcons, showDrawer, toast } from "./ui.js";
import { debounce, escapeHtml, initials } from "../utils/format.js";

const wizardStates = new WeakMap();

function stateFor(backdrop) {
  if (!wizardStates.has(backdrop)) wizardStates.set(backdrop, { selectedGuest: null });
  return wizardStates.get(backdrop);
}

function cleanDigits(value, limit) {
  return String(value || "").replace(/\D/g, "").slice(0, limit);
}

function guestFromButton(button) {
  if (!button) return null;
  return {
    id: Number(button.dataset.guest),
    name: button.dataset.name || button.querySelector("strong")?.textContent?.trim() || "Hóspede",
    cpf: button.dataset.cpf || "",
    phone: button.dataset.phone || "",
  };
}

function hideLegacyGuestControls(wizard) {
  const search = wizard.querySelector("#guest-search");
  const results = wizard.querySelector("#guest-results");
  const quickForm = wizard.querySelector("#quick-guest");
  const toggle = wizard.querySelector("[data-toggle-guest]");
  const selectedBanner = wizard.querySelector("[data-selected-guest-banner]");

  if (search?.closest(".field")) search.closest(".field").hidden = true;
  if (results) results.hidden = true;
  if (quickForm) quickForm.hidden = true;
  if (toggle) toggle.hidden = true;
  if (selectedBanner) selectedBanner.hidden = true;

  return { results };
}

function compactGuestMarkup(state, editing) {
  if (state.selectedGuest) {
    const detail = state.selectedGuest.cpf || state.selectedGuest.phone || "Cadastro localizado";
    return `<div class="guest-picker-summary__identity"><span class="avatar">${initials(state.selectedGuest.name)}</span><div><span class="guest-picker-summary__label">Hóspede selecionado</span><strong>${escapeHtml(state.selectedGuest.name)}</strong><span>${escapeHtml(detail)}</span></div></div><button type="button" class="button button--secondary" data-open-guest-picker>Trocar hóspede</button>`;
  }

  if (editing) {
    return `<div><span class="guest-picker-summary__label">Hóspede da reserva</span><strong>Cadastro atual mantido</strong><span>Abra a busca somente se precisar trocar o hóspede responsável.</span></div><button type="button" class="button button--secondary" data-open-guest-picker>Localizar outro hóspede</button>`;
  }

  return `<div><span class="guest-picker-summary__label">Hóspede responsável</span><strong>Nenhum hóspede selecionado</strong><span>Localize um cadastro existente ou faça um novo cadastro.</span></div><button type="button" class="button button--primary" data-open-guest-picker>Localizar hóspede</button>`;
}

function selectGuestInWizard(wizard, state, guest, closeDrawer) {
  const results = wizard.querySelector("#guest-results");
  if (!results) {
    toast("A etapa de hóspede não está disponível no momento.", { title: "Seleção não concluída", type: "danger" });
    return;
  }

  const bridge = document.createElement("button");
  bridge.type = "button";
  bridge.className = "guest-result is-selected";
  bridge.dataset.guest = String(guest.id);
  bridge.dataset.name = guest.name;
  bridge.dataset.cpf = guest.cpf || "";
  bridge.dataset.phone = guest.phone || "";
  bridge.innerHTML = `<span><strong>${escapeHtml(guest.name)}</strong><span class="cell-subtitle">${escapeHtml(guest.cpf || guest.phone || "Sem documento")}</span></span>`;
  results.replaceChildren(bridge);
  bridge.click();

  state.selectedGuest = {
    id: Number(guest.id),
    name: guest.name,
    cpf: guest.cpf || "",
    phone: guest.phone || "",
  };
  closeDrawer();
  enhanceWizard(wizard);
}

function openGuestPicker(wizard, state) {
  showDrawer({
    title: "Localizar hóspede",
    eyebrow: "Reserva · Hóspede responsável",
    content: `<div class="guest-picker-drawer__layout">
      <div class="field guest-picker-drawer__search"><label for="guest-picker-search">Pesquisar hóspede</label><input id="guest-picker-search" autocomplete="off" placeholder="Nome, CPF, telefone ou e-mail"></div>
      <div class="guest-picker-drawer__results" data-guest-picker-results><p class="muted">Carregando hóspedes...</p></div>
      <div class="guest-picker-drawer__create">
        <button type="button" class="button button--secondary" data-toggle-new-guest>+ Cadastrar novo hóspede</button>
        <form class="form-grid guest-picker-drawer__form" data-new-guest-form hidden>
          <div class="field span-2"><label>Nome completo *</label><input name="name" required minlength="3" maxlength="190"></div>
          <div class="field"><label>CPF</label><input name="cpf" inputmode="numeric" maxlength="14" placeholder="Opcional"></div>
          <div class="field"><label>Telefone</label><input name="phone" inputmode="tel" maxlength="15" placeholder="Opcional"></div>
          <div class="span-2"><button type="submit" class="button button--primary">Salvar e selecionar</button></div>
        </form>
      </div>
    </div>`,
    onMount(element, close) {
      const drawer = element.querySelector(".drawer");
      drawer?.classList.add("drawer--guest-picker");
      const input = element.querySelector("#guest-picker-search");
      const results = element.querySelector("[data-guest-picker-results]");
      const form = element.querySelector("[data-new-guest-form]");
      let items = [];
      let searchSequence = 0;

      const renderResults = () => {
        if (!items.length) {
          results.innerHTML = `<div class="empty-state guest-picker-empty"><div><h3>Nenhum hóspede encontrado</h3><p>Revise o filtro ou cadastre um novo hóspede.</p></div></div>`;
          return;
        }
        results.innerHTML = items.map((guest) => `<button type="button" class="guest-picker-result" data-pick-guest="${guest.id}"><span class="avatar">${initials(guest.name)}</span><span class="guest-picker-result__text"><strong>${escapeHtml(guest.name)}</strong><span>${escapeHtml(guest.cpf || guest.phone || guest.email || "Sem documento ou contato")}</span></span><i data-lucide="chevron-right"></i></button>`).join("");
        refreshIcons(results);
      };

      const searchGuests = async () => {
        const sequence = ++searchSequence;
        results.innerHTML = `<p class="muted guest-picker-loading">Buscando hóspedes...</p>`;
        try {
          const response = await api.get("/api/guests", { q: input.value.trim(), pageSize: 30 });
          if (sequence !== searchSequence) return;
          items = response.items || [];
          renderResults();
        } catch (error) {
          if (sequence !== searchSequence) return;
          results.innerHTML = `<p class="form-alert form-alert--danger">${escapeHtml(error.message)}</p>`;
        }
      };

      input.addEventListener("input", debounce(searchGuests, 250));
      results.addEventListener("click", (event) => {
        const button = event.target.closest("[data-pick-guest]");
        if (!button) return;
        const guest = items.find((item) => Number(item.id) === Number(button.dataset.pickGuest));
        if (guest) selectGuestInWizard(wizard, state, guest, close);
      });

      element.querySelector("[data-toggle-new-guest]").addEventListener("click", () => {
        form.hidden = !form.hidden;
        if (!form.hidden) form.elements.name?.focus();
      });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = form.querySelector("button[type='submit']");
        submit.disabled = true;
        const payload = Object.fromEntries(new FormData(form));
        payload.cpf = cleanDigits(payload.cpf, 11);
        payload.phone = cleanDigits(payload.phone, 11);
        if (!payload.cpf) delete payload.cpf;
        if (!payload.phone) delete payload.phone;
        try {
          const guest = await api.post("/api/guests", payload);
          toast("Hóspede cadastrado e selecionado.");
          selectGuestInWizard(wizard, state, guest, close);
        } catch (error) {
          submit.disabled = false;
          toast(error.message, { title: "Cadastro não concluído", type: "danger" });
        }
      });

      searchGuests();
      input.focus();
    },
  });
}

function enhanceWizard(wizard) {
  if (!wizard?.querySelector("#guest-search")) return;
  const backdrop = wizard.closest(".modal-backdrop");
  if (!backdrop) return;
  const modal = backdrop.querySelector(".modal");
  modal?.classList.add("modal--reservation-wizard");

  const state = stateFor(backdrop);
  const { results } = hideLegacyGuestControls(wizard);
  const selectedButton = results?.querySelector(".guest-result.is-selected");
  if (!state.selectedGuest && selectedButton) state.selectedGuest = guestFromButton(selectedButton);

  let host = wizard.querySelector("[data-guest-picker-host]");
  if (!host) {
    host = document.createElement("section");
    host.dataset.guestPickerHost = "true";
    host.className = "guest-picker-summary";
    const firstHiddenField = wizard.querySelector("#guest-search")?.closest(".field");
    if (firstHiddenField) firstHiddenField.insertAdjacentElement("beforebegin", host);
    else wizard.prepend(host);
  }

  const editing = Boolean(backdrop.querySelector(".modal__header h2")?.textContent?.trim().startsWith("Editar "));
  const signature = state.selectedGuest
    ? `guest:${state.selectedGuest.id}:${state.selectedGuest.name}:${state.selectedGuest.cpf}:${state.selectedGuest.phone}`
    : `empty:${editing}`;

  if (host.dataset.renderSignature === signature) return;
  host.dataset.renderSignature = signature;
  host.innerHTML = compactGuestMarkup(state, editing);
  host.querySelector("[data-open-guest-picker]")?.addEventListener("click", () => openGuestPicker(wizard, state));
  refreshIcons(host);
}

export function installReservationFlowEnhancer() {
  const root = document.getElementById("overlay-root");
  if (!root || root.dataset.reservationFlowEnhancer === "true") return;
  root.dataset.reservationFlowEnhancer = "true";

  const enhance = () => root.querySelectorAll("#wizard-content").forEach((wizard) => enhanceWizard(wizard));
  enhance();
  const observer = new window.MutationObserver(enhance);
  observer.observe(root, { childList: true, subtree: true });
}
