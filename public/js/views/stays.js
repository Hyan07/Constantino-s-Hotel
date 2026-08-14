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

function guestAddress(item) {
  const street = [item.guest_street, item.guest_street_number].filter(Boolean).join(", ");
  const location = [item.guest_neighborhood, [item.guest_city, item.guest_state].filter(Boolean).join("/")].filter(Boolean).join(" · ");
  return [street, item.guest_complement, location, item.guest_postal_code ? `CEP ${item.guest_postal_code}` : ""].filter(Boolean).join(" · ") || "Não informado";
}

function printableStayDocument(item, settings) {
  const hotel = settings?.hotel || {};
  const hotelName = hotel.name || "Constantino's Hotel";
  const hotelContacts = [hotel.phone, hotel.email].filter(Boolean).join(" · ");
  const hotelAddress = hotel.address || "Passos, MG";
  const issuedAt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date());
  const safe = (value, fallback = "—") => escapeHtml(value === null || value === undefined || value === "" ? fallback : String(value));
  const charges = item.charges.length
    ? item.charges.map((charge) => `<tr><td>${safe(charge.description)}</td><td>${safe(charge.quantity)}</td><td>${currency(charge.unit_price)}</td><td>${currency(charge.total_amount)}</td></tr>`).join("")
    : `<tr><td colspan="4" class="muted">Nenhum consumo lançado.</td></tr>`;
  const payments = item.payments.length
    ? item.payments.map((payment) => `<tr><td>${dateTime(payment.paid_at)}</td><td>${safe(payment.payment_method)}</td><td>${currency(payment.amount)}</td></tr>`).join("")
    : `<tr><td colspan="3" class="muted">Nenhum pagamento registrado.</td></tr>`;

  const printWindow = window.open("", "_blank", "width=980,height=760");
  if (!printWindow) {
    toast("Permita pop-ups para imprimir o termo de hospedagem.", { title: "Impressão bloqueada", type: "danger" });
    return;
  }

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Termo de hospedagem · ${safe(item.reservation_code)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #17212b; font: 12px/1.45 Arial, Helvetica, sans-serif; background: white; }
    .document { max-width: 820px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 16px; border-bottom: 2px solid #102b46; }
    .brand h1 { margin: 0 0 4px; color: #102b46; font-size: 22px; }
    .brand p, .meta p { margin: 2px 0; color: #5d6872; }
    .meta { text-align: right; }
    .title { margin: 24px 0 18px; text-align: center; }
    .title h2 { margin: 0; font-size: 18px; letter-spacing: .08em; text-transform: uppercase; }
    .title p { margin: 5px 0 0; color: #5d6872; }
    .section { margin-top: 18px; break-inside: avoid; }
    .section h3 { margin: 0 0 8px; padding-bottom: 5px; color: #102b46; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; border-bottom: 1px solid #dce2e7; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; }
    .field { min-height: 36px; padding: 6px 0; }
    .field span { display: block; color: #6d7780; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
    .field strong { display: block; margin-top: 2px; font-size: 12px; font-weight: 600; }
    .span-2 { grid-column: 1 / -1; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { padding: 7px 8px; border: 1px solid #dce2e7; text-align: left; vertical-align: top; }
    th { background: #f1f6f9; color: #102b46; font-size: 10px; text-transform: uppercase; }
    td:last-child, th:last-child { text-align: right; }
    .financial { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .money { padding: 10px; border: 1px solid #dce2e7; border-radius: 4px; }
    .money span { display: block; color: #6d7780; font-size: 10px; text-transform: uppercase; }
    .money strong { display: block; margin-top: 4px; font-size: 14px; }
    .declaration { margin-top: 20px; padding: 12px 14px; border: 1px solid #c7d0d8; background: #f8fafb; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; margin-top: 54px; break-inside: avoid; }
    .signature { padding-top: 8px; border-top: 1px solid #17212b; text-align: center; }
    .signature strong { display: block; }
    .footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e9edf0; color: #89939c; font-size: 9px; text-align: center; }
    .muted { color: #89939c; text-align: center !important; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <main class="document">
    <header class="header">
      <div class="brand">
        <h1>${safe(hotelName)}</h1>
        <p>${safe(hotelAddress)}</p>
        ${hotelContacts ? `<p>${safe(hotelContacts)}</p>` : ""}
      </div>
      <div class="meta">
        <p><strong>Reserva:</strong> ${safe(item.reservation_code)}</p>
        <p><strong>Hospedagem:</strong> #${safe(item.id)}</p>
        <p><strong>Situação:</strong> ${safe(statusLabel(item.status))}</p>
      </div>
    </header>

    <div class="title">
      <h2>Termo de Hospedagem</h2>
      <p>Registro das condições e informações da estadia</p>
    </div>

    <section class="section">
      <h3>1. Hóspede responsável</h3>
      <div class="grid">
        <div class="field"><span>Nome</span><strong>${safe(item.guest_name)}</strong></div>
        <div class="field"><span>CPF</span><strong>${safe(item.guest_cpf, "Não informado")}</strong></div>
        <div class="field"><span>Telefone</span><strong>${safe(item.guest_phone, "Não informado")}</strong></div>
        <div class="field"><span>E-mail</span><strong>${safe(item.guest_email, "Não informado")}</strong></div>
        <div class="field span-2"><span>Endereço</span><strong>${safe(guestAddress(item))}</strong></div>
      </div>
    </section>

    <section class="section">
      <h3>2. Dados da hospedagem</h3>
      <div class="grid">
        <div class="field"><span>Quarto</span><strong>${safe(item.room_number)}</strong></div>
        <div class="field"><span>Categoria</span><strong>${safe(item.category_name)}</strong></div>
        <div class="field"><span>Check-in realizado</span><strong>${safe(dateTime(item.check_in_at))}</strong></div>
        <div class="field"><span>Saída prevista</span><strong>${safe(longDate(item.expected_checkout_date))}</strong></div>
        <div class="field"><span>Diárias</span><strong>${safe(item.nights)}</strong></div>
        <div class="field"><span>Ocupação</span><strong>${safe(`${item.adults} adulto(s) · ${item.children} criança(s)`)}</strong></div>
        <div class="field"><span>Valor da diária</span><strong>${currency(item.daily_rate)}</strong></div>
        <div class="field"><span>Reserva vinculada</span><strong>${safe(item.reservation_code)}</strong></div>
      </div>
    </section>

    <section class="section">
      <h3>3. Resumo financeiro</h3>
      <div class="financial">
        <div class="money"><span>Hospedagem</span><strong>${currency(item.lodging_amount)}</strong></div>
        <div class="money"><span>Consumos</span><strong>${currency(item.charges_amount)}</strong></div>
        <div class="money"><span>Pago</span><strong>${currency(item.paid_amount)}</strong></div>
        <div class="money"><span>Saldo</span><strong>${currency(item.balance)}</strong></div>
      </div>
      <div class="grid" style="margin-top:8px">
        <div class="field"><span>Desconto</span><strong>${currency(item.discount)}</strong></div>
        <div class="field"><span>Acréscimo</span><strong>${currency(item.surcharge)}</strong></div>
      </div>
    </section>

    <section class="section">
      <h3>4. Consumos e lançamentos</h3>
      <table>
        <thead><tr><th>Descrição</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead>
        <tbody>${charges}</tbody>
      </table>
    </section>

    <section class="section">
      <h3>5. Pagamentos registrados</h3>
      <table>
        <thead><tr><th>Data</th><th>Forma de pagamento</th><th>Valor</th></tr></thead>
        <tbody>${payments}</tbody>
      </table>
    </section>

    <div class="declaration">
      Declaro que conferi os dados acima e estou ciente do período, da acomodação e dos valores registrados neste termo de hospedagem.
    </div>

    <div class="signatures">
      <div class="signature"><strong>${safe(item.guest_name)}</strong><span>Hóspede responsável</span></div>
      <div class="signature"><strong>${safe(hotelName)}</strong><span>Responsável pelo hotel</span></div>
    </div>

    <footer class="footer">Documento gerado pelo sistema em ${safe(issuedAt)}.</footer>
  </main>
</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 250);
}

async function openStay(id) {
  const [item, settings] = await Promise.all([
    api.get(`/api/stays/${id}`),
    api.get("/api/settings").catch(() => ({ hotel: {} })),
  ]);
  const redraw = () => { drawer.close(); openStay(id); };
  const stayActions = hasPermission("stays.write") ? `<button class="button button--ghost" data-extend>Estender</button><button class="button button--secondary" data-charge>Adicionar consumo</button>${hasPermission("payments.write") ? `<button class="button button--secondary" data-payment>Registrar pagamento</button>` : ""}<button class="button button--primary" data-checkout>Fazer check-out</button>` : "";
  const drawer = showDrawer({
    title: `Quarto ${item.room_number}`,
    eyebrow: `Hospedagem · ${item.reservation_code}`,
    content: `<div class="identity-cell"><span class="avatar">${initials(item.guest_name)}</span><div><h3>${escapeHtml(item.guest_name)}</h3><p class="muted">${escapeHtml(item.guest_cpf || "CPF não informado")} · ${escapeHtml(item.guest_phone || "telefone não informado")}</p></div></div>
      <h3 class="section-title">Estadia</h3><div class="detail-grid">${detail("Situação", statusLabel(item.status))}${detail("Categoria", item.category_name)}${detail("Check-in", dateTime(item.check_in_at))}${detail("Saída prevista", longDate(item.expected_checkout_date))}${detail("Ocupação", `${item.adults} adulto(s) · ${item.children} criança(s)`)}${detail("Reserva", item.reservation_code)}</div>
      <h3 class="section-title">Conta</h3><div class="detail-grid">${detail("Hospedagem", currency(item.lodging_amount))}${detail("Consumos", currency(item.charges_amount))}${detail("Pago", currency(item.paid_amount))}${detail("Saldo", currency(item.balance))}</div>
      <h3 class="section-title">Lançamentos</h3>${item.charges.length ? `<div class="timeline-list">${item.charges.map((charge) => `<div class="timeline-item"><strong>${escapeHtml(charge.description)} · ${currency(charge.total_amount)}</strong><span>${dateTime(charge.charged_at)} · ${charge.quantity} × ${currency(charge.unit_price)}</span></div>`).join("")}</div>` : `<p class="muted">Nenhum consumo lançado.</p>`}
      <h3 class="section-title">Pagamentos</h3>${item.payments.length ? `<div class="timeline-list">${item.payments.map((payment) => `<div class="timeline-item"><strong>${currency(payment.amount)} · ${escapeHtml(payment.payment_method)}</strong><span>${dateTime(payment.paid_at)} · ${escapeHtml(payment.user_name)}</span></div>`).join("")}</div>` : `<p class="muted">Nenhum pagamento registrado.</p>`}`,
    footer: `<button class="button button--secondary" data-print-contract><i data-lucide="printer"></i>Imprimir termo</button>${stayActions}`,
    onMount(element, close) {
      element.querySelector("[data-print-contract]").addEventListener("click", () => printableStayDocument(item, settings));
      element.querySelector("[data-charge]")?.addEventListener("click", () => formModal({ title: "Adicionar consumo", content: `<div class="form-grid"><div class="field span-2"><label>Descrição *</label><input name="description" required maxlength="190" placeholder="Ex.: Frigobar"></div><div class="field"><label>Quantidade *</label><input name="quantity" type="number" min="0.01" step="0.01" value="1" required></div><div class="field"><label>Valor unitário *</label><input name="unitPrice" type="number" min="0.01" step="0.01" required></div></div>`, saveLabel: "Adicionar", onSave: async (data) => { await api.post(`/api/stays/${id}/charges`, data); toast("Consumo adicionado à conta."); redraw(); } }));
      element.querySelector("[data-payment]")?.addEventListener("click", async () => {
        try {
          const currentSettings = await api.get("/api/settings");
          formModal({ title: "Registrar pagamento", content: `<div class="form-grid"><div class="field"><label>Valor *</label><input name="amount" type="number" min="0.01" max="${item.balance}" step="0.01" value="${Math.max(0, item.balance)}" required></div><div class="field"><label>Forma de pagamento *</label><select name="paymentMethod" required>${currentSettings.paymentMethods.map((method) => `<option>${escapeHtml(method)}</option>`).join("")}</select></div><div class="field span-2"><label>Observação</label><textarea name="notes"></textarea></div></div>`, saveLabel: "Registrar", onSave: async (data) => { await api.post("/api/payments", { ...data, stayId: item.id }); toast("Pagamento registrado."); redraw(); } });
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
