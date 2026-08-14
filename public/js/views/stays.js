import { api } from "../api.js";
import { hasPermission } from "../state.js";
import { confirmDialog, emptyState, setMain, showDrawer, showModal, toast } from "../components/ui.js";
import { currency, dateTime, debounce, escapeHtml, initials, longDate, shortDate, statusLabel } from "../utils/format.js";

const state = { tab: "active", q: "" };

function detail(label, value) { return `<div class="detail-item"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`; }

function formModal({ title, content, saveLabel = "Salvar", onSave }) {
  return showModal({
    title,
    content: `<form id="action-form">${content}<p class="form-alert form-alert--danger" data-error hidden></p></form>`,
    footer: `<button class="button button--ghost" data-close>Cancelar</button><button class="button button--primary" data-save>${saveLabel}</button>`,
    onMount(element, close) {
      element.querySelector("[data-save]").addEventListener("click", async () => {
        const form = element.querySelector("#action-form");
        if (!form.reportValidity()) return;
        const button = element.querySelector("[data-save]");
        button.disabled = true;
        try { await onSave(Object.fromEntries(new FormData(form))); close(); } catch (error) { element.querySelector("[data-error]").textContent = error.message; element.querySelector("[data-error]").hidden = false; button.disabled = false; }
      });
    },
  });
}

async function openStay(id) {
  const item = await api.get(`/api/stays/${id}`);
  const redraw = () => { drawer.close(); openStay(id); };
  const drawer = showDrawer({
    title: `Quarto ${item.room_number}`,
    eyebrow: `Hospedagem · ${item.reservation_code}`,
    content: `<div class="identity-cell"><span class="avatar">${initials(item.guest_name)}</span><div><h3>${escapeHtml(item.guest_name)}</h3><p class="muted">${escapeHtml(item.guest_cpf || "CPF não informado")} · ${escapeHtml(item.guest_phone || "telefone não informado")}</p></div></div>
      <h3 class="section-title">Estadia</h3><div class="detail-grid">${detail("Situação", statusLabel(item.status))}${detail("Categoria", item.category_name)}${detail("Check-in", dateTime(item.check_in_at))}${detail("Saída prevista", longDate(item.expected_checkout_date))}${detail("Ocupação", `${item.adults} adulto(s) · ${item.children} criança(s)`)}${detail("Reserva", item.reservation_code)}</div>
      <h3 class="section-title">Conta</h3><div class="detail-grid">${detail("Hospedagem", currency(item.lodging_amount))}${detail("Consumos", currency(item.charges_amount))}${detail("Pago", currency(item.paid_amount))}${detail("Saldo", currency(item.balance))}</div>
      <h3 class="section-title">Lançamentos</h3>${item.charges.length ? `<div class="timeline-list">${item.charges.map((charge) => `<div class="timeline-item"><strong>${escapeHtml(charge.description)} · ${currency(charge.total_amount)}</strong><span>${dateTime(charge.charged_at)} · ${charge.quantity} × ${currency(charge.unit_price)}</span></div>`).join("")}</div>` : `<p class="muted">Nenhum consumo lançado.</p>`}
      <h3 class="section-title">Pagamentos</h3>${item.payments.length ? `<div class="timeline-list">${item.payments.map((payment) => `<div class="timeline-item"><strong>${currency(payment.amount)} · ${escapeHtml(payment.payment_method)}</strong><span>${dateTime(payment.paid_at)} · ${escapeHtml(payment.user_name)}</span></div>`).join("")}</div>` : `<p class="muted">Nenhum pagamento registrado.</p>`}`,
    footer: hasPermission("stays.write") ? `<button class="button button--ghost" data-extend>Estender</button><button class="button button--secondary" data-charge>Adicionar consumo</button>${hasPermission("payments.write") ? `<button class="button button--secondary" data-payment>Registrar pagamento</button>` : ""}<button class="button button--primary" data-checkout>Fazer check-out</button>` : "",
    onMount(element, close) {
      element.querySelector("[data-charge]")?.addEventListener("click", () => formModal({ title: "Adicionar consumo", content: `<div class="form-grid"><div class="field span-2"><label>Descrição *</label><input name="description" required maxlength="190" placeholder="Ex.: Frigobar"></div><div class="field"><label>Quantidade *</label><input name="quantity" type="number" min="0.01" step="0.01" value="1" required></div><div class="field"><label>Valor unitário *</label><input name="unitPrice" type="number" min="0.01" step="0.01" required></div></div>`, saveLabel: "Adicionar", onSave: async (data) => { await api.post(`/api/stays/${id}/charges`, data); toast("Consumo adicionado à conta."); redraw(); } }));
      element.querySelector("[data-payment]")?.addEventListener("click", async () => {
        try {
          const settings = await api.get("/api/settings");
          formModal({ title: "Registrar pagamento", content: `<div class="form-grid"><div class="field"><label>Valor *</label><input name="amount" type="number" min="0.01" max="${item.balance}" step="0.01" value="${Math.max(0, item.balance)}" required></div><div class="field"><label>Forma de pagamento *</label><select name="paymentMethod" required>${settings.paymentMethods.map((method) => `<option>${escapeHtml(method)}</option>`).join("")}</select></div><div class="field span-2"><label>Observação</label><textarea name="notes"></textarea></div></div>`, saveLabel: "Registrar", onSave: async (data) => { await api.post("/api/payments", { ...data, stayId: item.id }); toast("Pagamento registrado."); redraw(); } });
        } catch (error) { toast(error.message, { title: "Formas de pagamento indisponíveis", type: "danger" }); }
      });
      element.querySelector("[data-extend]")?.addEventListener("click", () => formModal({ title: "Estender hospedagem", content: `<div class="field"><label>Diárias adicionais *</label><input name="nights" type="number" min="1" max="30" value="1" required><p class="muted">A disponibilidade do quarto será verificada antes de confirmar.</p></div>`, saveLabel: "Verificar e estender", onSave: async (data) => { await api.post(`/api/stays/${id}/extend`, data); toast("Hospedagem estendida."); redraw(); } }));
      element.querySelector("[data-checkout]")?.addEventListener("click", async () => {
        if (Number(item.balance) > 0) { toast(`Registre o saldo de ${currency(item.balance)} antes do check-out.`, { title: "Saldo pendente", type: "danger" }); return; }
        const confirmed = await confirmDialog({ title: "Concluir check-out", message: `Encerrar a hospedagem de ${item.guest_name} e enviar o quarto ${item.room_number} para limpeza?`, confirmLabel: "Concluir check-out" });
        if (!confirmed) return;
        try { await api.post(`/api/stays/${id}/check-out`, {}); close(); toast("Check-out concluído. O quarto aguarda limpeza."); staysView.render(); } catch (error) { toast(error.message, { title: "Check-out não concluído", type: "danger" }); }
      });
    },
  });
  return drawer;
}

async function render() {
  const items = await api.get("/api/stays", { tab: state.tab, q: state.q });
  setMain(`<div class="page-shell"><div class="page-header"><div><p class="eyebrow">Hospedagens</p><h1>Hóspedes no hotel</h1><p>Acompanhe estadias ativas, saídas e contas em aberto.</p></div></div>
    <div class="toolbar"><div class="tabs"><button class="tab${state.tab === "active" ? " is-active" : ""}" data-tab="active">Todas ativas</button><button class="tab${state.tab === "departures" ? " is-active" : ""}" data-tab="departures">Saídas de hoje</button><button class="tab${state.tab === "extended" ? " is-active" : ""}" data-tab="extended">Estendidas</button></div><span class="header-spacer"></span><input class="input" id="stay-search" placeholder="Hóspede, quarto ou reserva" value="${escapeHtml(state.q)}"></div>
    <section class="card card--flush">${items.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Hóspede</th><th>Quarto</th><th>Check-in</th><th>Saída prevista</th><th>Situação</th><th>Saldo</th></tr></thead><tbody>${items.map((item) => `<tr data-clickable data-open="${item.id}" tabindex="0"><td><div class="identity-cell"><span class="avatar">${initials(item.guest_name)}</span><span><span class="cell-title">${escapeHtml(item.guest_name)}</span><span class="cell-subtitle">${escapeHtml(item.reservation_code)}</span></span></div></td><td><span class="cell-title">Quarto ${escapeHtml(item.room_number)}</span><span class="cell-subtitle">${escapeHtml(item.category_name)}</span></td><td>${shortDate(item.check_in_date)}</td><td><span class="cell-title">${longDate(item.expected_checkout_date)}</span></td><td><span class="badge status--${item.status}">${statusLabel(item.status)}</span></td><td><span class="cell-title">${currency(item.balance)}</span><span class="cell-subtitle">Total ${currency(item.total_amount)}</span></td></tr>`).join("")}</tbody></table></div>` : emptyState("Nenhuma hospedagem encontrada", "Não há estadias ativas para este filtro.", "bed-double")}</section>
  </div>`);
  document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => { state.tab = button.dataset.tab; render(); }));
  document.querySelectorAll("[data-open]").forEach((row) => { row.addEventListener("click", () => openStay(row.dataset.open)); row.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); openStay(row.dataset.open); } }); });
  document.querySelector("#stay-search").addEventListener("input", debounce((event) => { state.q = event.target.value; render(); }, 350));
}

export const staysView = {
  async render(params = {}) {
    if (params.tab === "checkin") {
      window.dispatchEvent(new CustomEvent("app:navigate", { detail: { route: "reservas", params: { tab: "today" } } }));
      return;
    }
    if (params.tab === "checkout") state.tab = "departures";
    if (params.tab && ["active", "departures", "extended"].includes(params.tab)) state.tab = params.tab;
    await render();
    if (params.open) openStay(params.open);
  },
};
