import { api } from "../api.js";
import { hasPermission } from "../state.js";
import { emptyState, setMain, showDrawer, showModal, toast } from "../components/ui.js";
import { currency, debounce, escapeHtml, initials, longDate, statusLabel } from "../utils/format.js";

const state = { q: "", page: 1 };

function guestFields(guest = {}) {
  return `<div class="field span-2"><label>Nome completo *</label><input name="name" value="${escapeHtml(guest.name || "")}" required minlength="3" maxlength="180" autocomplete="name"></div>
    <div class="field"><label>CPF <span class="muted">(opcional)</span></label><input name="cpf" value="${escapeHtml(guest.cpf || "")}" inputmode="numeric" autocomplete="off" placeholder="Somente números"></div>
    <div class="field"><label>Telefone <span class="muted">(opcional)</span></label><input name="phone" value="${escapeHtml(guest.phone || "")}" autocomplete="tel"></div>
    <div class="field span-2"><label>E-mail <span class="muted">(opcional)</span></label><input name="email" type="email" value="${escapeHtml(guest.email || "")}" autocomplete="email"></div>`;
}

function guestModal(guest = null, afterSave = () => guestsView.render()) {
  showModal({
    title: guest ? "Editar hóspede" : "Novo hóspede",
    eyebrow: "Cadastro",
    content: `<form id="guest-form" class="form-grid">${guestFields(guest || {})}<p class="form-alert form-alert--danger span-2" data-error hidden></p></form>`,
    footer: `<button class="button button--ghost" data-close>Cancelar</button><button class="button button--primary" data-save>Salvar hóspede</button>`,
    onMount(element, close) {
      element.querySelector("[data-save]").addEventListener("click", async () => {
        const form = element.querySelector("#guest-form");
        if (!form.reportValidity()) return;
        const body = Object.fromEntries(new FormData(form));
        try {
          const saved = guest ? await api.put(`/api/guests/${guest.id}`, body) : await api.post("/api/guests", body);
          close();
          toast(guest ? "Cadastro atualizado." : "Hóspede cadastrado.");
          afterSave(saved);
        } catch (error) {
          const panel = element.querySelector("[data-error]");
          panel.textContent = error.message;
          panel.hidden = false;
        }
      });
    },
  });
}

async function openGuest(id) {
  const guest = await api.get(`/api/guests/${id}`);
  showDrawer({
    title: guest.name,
    eyebrow: "Perfil do hóspede",
    content: `<div class="identity-cell"><span class="avatar">${initials(guest.name)}</span><div><h3>${escapeHtml(guest.name)}</h3><p class="muted">${guest.stay_count} hospedagem(ns) · ${guest.total_nights} diária(s)</p></div></div>
      <h3 class="section-title">Contato e identificação</h3><div class="detail-grid"><div class="detail-item"><span>CPF</span><strong>${escapeHtml(guest.cpf || "Não informado")}</strong></div><div class="detail-item"><span>Telefone</span><strong>${escapeHtml(guest.phone || "Não informado")}</strong></div><div class="detail-item"><span>E-mail</span><strong>${escapeHtml(guest.email || "Não informado")}</strong></div></div>
      <h3 class="section-title">Histórico de reservas</h3>${guest.history.length ? `<div class="timeline-list">${guest.history.map((item) => `<button class="timeline-item" data-reservation="${item.id}"><strong>${escapeHtml(item.code)} · ${statusLabel(item.status)}</strong><span>${longDate(item.check_in_date)} → ${longDate(item.check_out_date)} · ${item.room_number ? `quarto ${escapeHtml(item.room_number)}` : "sem quarto"} · ${currency(item.total_amount)}</span></button>`).join("")}</div>` : `<p class="muted">Este hóspede ainda não possui reservas.</p>`}`,
    footer: hasPermission("guests.write") ? `<button class="button button--secondary" data-edit>Editar cadastro</button><button class="button button--primary" data-reserve>Nova reserva</button>` : "",
    onMount(element, close) {
      element.querySelector("[data-edit]")?.addEventListener("click", () => { close(); guestModal(guest); });
      element.querySelector("[data-reserve]")?.addEventListener("click", () => { close(); window.dispatchEvent(new CustomEvent("app:new-reservation", { detail: { guest } })); });
      element.querySelectorAll("[data-reservation]").forEach((button) => button.addEventListener("click", () => { close(); window.dispatchEvent(new CustomEvent("app:navigate", { detail: { route: "reservas", params: { open: button.dataset.reservation } } })); }));
    },
  });
}

async function render() {
  const result = await api.get("/api/guests", { q: state.q, page: state.page, pageSize: 20 });
  setMain(`<div class="page-shell"><div class="page-header"><div><p class="eyebrow">Relacionamento</p><h1>Hóspedes</h1><p>Cadastros essenciais e histórico de estadias.</p></div>${hasPermission("guests.write") ? `<button class="button button--primary" data-new><i data-lucide="user-plus"></i>Novo hóspede</button>` : ""}</div><div class="toolbar"><input class="input" id="guest-search" placeholder="Pesquisar por nome, CPF, telefone ou e-mail" value="${escapeHtml(state.q)}"></div>
    <section class="card card--flush">${result.items.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Hóspede</th><th>Contato</th><th>Última estadia</th><th>Reservas</th><th>Diárias</th></tr></thead><tbody>${result.items.map((guest) => `<tr data-clickable data-open="${guest.id}" tabindex="0"><td><div class="identity-cell"><span class="avatar">${initials(guest.name)}</span><span><span class="cell-title">${escapeHtml(guest.name)}</span><span class="cell-subtitle">${escapeHtml(guest.cpf || "CPF não informado")}</span></span></div></td><td><span class="cell-title">${escapeHtml(guest.phone || "Não informado")}</span><span class="cell-subtitle">${escapeHtml(guest.email || "")}</span></td><td>${longDate(guest.last_stay)}</td><td>${guest.reservation_count}</td><td>${guest.total_nights}</td></tr>`).join("")}</tbody></table></div>` : emptyState("Nenhum hóspede encontrado", "Cadastre um hóspede ou ajuste a pesquisa.", "users")}
      <div class="pagination"><span class="muted">${result.pagination.total} hóspede(s) · página ${result.pagination.page} de ${result.pagination.totalPages}</span><div class="pagination__controls"><button class="button button--secondary" data-page="${state.page - 1}"${state.page <= 1 ? " disabled" : ""}>Anterior</button><button class="button button--secondary" data-page="${state.page + 1}"${state.page >= result.pagination.totalPages ? " disabled" : ""}>Próxima</button></div></div>
    </section></div>`);
  document.querySelector("[data-new]")?.addEventListener("click", () => guestModal());
  document.querySelectorAll("[data-open]").forEach((row) => {
    row.addEventListener("click", () => openGuest(row.dataset.open));
    row.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); openGuest(row.dataset.open); } });
  });
  document.querySelector("#guest-search").addEventListener("input", debounce((event) => { state.q = event.target.value; state.page = 1; render(); }, 350));
  document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => { state.page = Number(button.dataset.page); render(); }));
}

export const guestsView = { async render(params = {}) { await render(); if (params.open) openGuest(params.open); } };
