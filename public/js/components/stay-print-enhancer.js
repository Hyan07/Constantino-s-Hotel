import { api } from "../api.js";
import { getState } from "../state.js";
import { showModal, toast } from "./ui.js";
import { currency, dateTime, escapeHtml, longDate, statusLabel } from "../utils/format.js";

const defaults = {
  institutionalLabel: "Documento institucional",
  documentTitle: "Termo de Hospedagem",
  documentSubtitle: "Registro institucional da hospedagem",
  declaration: "Declaro que conferi os dados acima e estou ciente do período, da acomodação, das condições da hospedagem e dos valores registrados neste termo.",
  footerNote: "Documento interno da hospedagem; não substitui o registro na FNRH Digital quando aplicável.",
  showGuestContact: true,
  showValues: true,
  showCharges: true,
  showPayments: true,
  showOperational: true,
  showTerms: true,
  showPrivacy: true,
  showSignatures: true,
};

let lastStayId = null;

function safe(value, fallback = "—") {
  return escapeHtml(value === null || value === undefined || value === "" ? fallback : String(value));
}

function formattedCpf(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 11) return value || "Não informado";
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function guestAddress(item) {
  const street = [item.guest_street, item.guest_street_number].filter(Boolean).join(", ");
  const location = [item.guest_neighborhood, [item.guest_city, item.guest_state].filter(Boolean).join("/")].filter(Boolean).join(" · ");
  return [street, item.guest_complement, location, item.guest_postal_code ? `CEP ${item.guest_postal_code}` : ""].filter(Boolean).join(" · ") || "Não informado";
}

function hotelInitials(name) {
  return String(name || "H").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function option(name, label, checked) {
  return `<label class="card" style="display:flex;align-items:center;gap:9px;padding:10px 12px;cursor:pointer"><input type="checkbox" name="${name}"${checked ? " checked" : ""}><strong>${escapeHtml(label)}</strong></label>`;
}

async function findStayFromDrawer(button) {
  if (lastStayId) {
    try { return await api.get(`/api/stays/${lastStayId}`); } catch { lastStayId = null; }
  }
  const eyebrow = button.closest(".drawer")?.querySelector(".eyebrow")?.textContent || "";
  const code = eyebrow.split("·").slice(1).join("·").trim();
  if (!code) throw new Error("Não foi possível identificar a hospedagem aberta.");
  for (const tab of ["active", "completed"]) {
    const items = await api.get("/api/stays", { tab, q: code });
    const match = items.find((item) => item.reservation_code === code);
    if (match) return api.get(`/api/stays/${match.id}`);
  }
  throw new Error("Hospedagem não encontrada para impressão.");
}

function renderDocument(item, settings, reservation, options) {
  const hotel = settings.hotel || {};
  const config = { ...defaults, ...(settings.stayPrint || {}), ...options };
  const hotelName = hotel.name || "Constantino's Hotel";
  const operator = getState().user?.name || "Operador não identificado";
  const checkInOperator = item.checkin_operator_name || operator;
  const issuedAt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date());
  const contacts = [hotel.phone, hotel.email].filter(Boolean).join(" · ");
  const legal = [hotel.legalName, hotel.cnpj ? `CNPJ ${hotel.cnpj}` : ""].filter(Boolean).join(" · ");
  const source = reservation?.source || "Direta";
  const operational = {
    checkIn: hotel.checkInTime || "Não configurado",
    checkOut: hotel.checkOutTime || "Não configurado",
    cleaning: hotel.cleaningEstimateMinutes ? `${hotel.cleaningEstimateMinutes} minutos` : "Não configurado",
  };
  const charges = item.charges?.length
    ? item.charges.map((charge) => `<tr><td>${safe(charge.description)}</td><td>${safe(charge.quantity)}</td><td>${currency(charge.unit_price)}</td><td>${currency(charge.total_amount)}</td></tr>`).join("")
    : `<tr><td colspan="4" class="muted">Nenhum consumo lançado.</td></tr>`;
  const payments = item.payments?.length
    ? item.payments.map((payment) => `<tr><td>${dateTime(payment.paid_at)}</td><td>${safe(payment.payment_method)}</td><td>${safe(payment.user_name)}</td><td>${currency(payment.amount)}</td></tr>`).join("")
    : `<tr><td colspan="4" class="muted">Nenhum pagamento registrado.</td></tr>`;
  const printWindow = window.open("", "_blank", "width=980,height=760");
  if (!printWindow) {
    toast("Permita pop-ups para imprimir o termo de hospedagem.", { title: "Impressão bloqueada", type: "danger" });
    return;
  }
  const contactFields = config.showGuestContact ? `<div class="field"><span>Telefone</span><strong>${safe(item.guest_phone, "Não informado")}</strong></div><div class="field"><span>E-mail</span><strong>${safe(item.guest_email, "Não informado")}</strong></div><div class="field span-2"><span>Endereço</span><strong>${safe(guestAddress(item))}</strong></div>` : "";
  const operationalSection = config.showOperational ? `<section class="section"><h3>Informações operacionais</h3><div class="grid"><div class="field"><span>Entrada padrão</span><strong>${safe(operational.checkIn)}</strong></div><div class="field"><span>Saída padrão</span><strong>${safe(operational.checkOut)}</strong></div><div class="field span-2"><span>Limpeza estimada</span><strong>${safe(operational.cleaning)}</strong></div></div></section>` : "";
  const valuesSection = config.showValues ? `<section class="section"><h3>Resumo financeiro</h3><div class="financial"><div class="money"><span>Hospedagem</span><strong>${currency(item.lodging_amount)}</strong></div><div class="money"><span>Consumos</span><strong>${currency(item.charges_amount)}</strong></div><div class="money"><span>Pago</span><strong>${currency(item.paid_amount)}</strong></div><div class="money"><span>Saldo</span><strong>${currency(item.balance)}</strong></div></div><div class="grid compact"><div class="field"><span>Diária</span><strong>${currency(item.daily_rate)}</strong></div><div class="field"><span>Desconto / acréscimo</span><strong>${currency(item.discount)} / ${currency(item.surcharge)}</strong></div></div></section>` : "";
  const chargesSection = config.showCharges ? `<section class="section"><h3>Consumos e lançamentos</h3><table><thead><tr><th>Descrição</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead><tbody>${charges}</tbody></table></section>` : "";
  const paymentsSection = config.showPayments ? `<section class="section"><h3>Pagamentos registrados</h3><table><thead><tr><th>Data</th><th>Forma</th><th>Operador</th><th>Valor</th></tr></thead><tbody>${payments}</tbody></table></section>` : "";
  const termsSection = config.showTerms && hotel.hostingTerms ? `<section class="section"><h3>Condições de hospedagem</h3><div class="notice">${safe(hotel.hostingTerms)}</div></section>` : "";
  const privacySection = config.showPrivacy ? `<section class="section"><h3>Privacidade e ciência</h3><div class="notice">${safe(hotel.privacyNotice || "Os dados deste documento são utilizados para a execução e o registro da hospedagem e devem ser acessados somente por pessoas autorizadas.")}</div></section>` : "";
  const copyNote = config.copyNote ? `<div class="copy-note"><strong>Observação desta via:</strong> ${safe(config.copyNote)}</div>` : "";
  const signatures = config.showSignatures ? `<div class="signatures"><div class="signature"><strong>${safe(item.guest_name)}</strong><span>Hóspede responsável</span></div><div class="signature"><strong>${safe(checkInOperator)}</strong><span>Operador responsável · ${safe(hotelName)}</span></div></div>` : "";

  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe(config.documentTitle)} · ${safe(item.reservation_code)}</title><style>
    @page{size:A4 portrait;margin:7mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:white}body{color:#17212b;font:8.7px/1.18 Arial,Helvetica,sans-serif}.document{width:100%;max-width:196mm;margin:0 auto;transform-origin:top left}.institutional{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:9px 11px;background:#102b46;color:white;border-radius:7px 7px 0 0}.seal{display:grid;place-items:center;width:34px;height:34px;border:1px solid rgba(255,255,255,.7);border-radius:50%;font-size:11px;font-weight:800;letter-spacing:.05em}.institutional small{display:block;font-size:6.7px;letter-spacing:.13em;text-transform:uppercase;opacity:.72}.institutional h1{margin:2px 0 1px;color:white;font-size:14px}.institutional p{margin:0;font-size:7.4px;opacity:.82}.document-code{text-align:right}.document-code strong{display:block;font-size:9px}.hotel-strip{display:flex;justify-content:space-between;gap:12px;padding:5px 8px;border:1px solid #d7e0e7;border-top:0;color:#52606c}.hotel-strip span:last-child{text-align:right}.title{text-align:center;margin:7px 0 5px}.title h2{margin:0;color:#102b46;font-size:12px;letter-spacing:.08em;text-transform:uppercase}.title p{margin:2px 0 0;color:#65727d}.meta-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#dce4ea;border:1px solid #dce4ea}.meta{padding:4px 5px;background:#f7f9fb}.meta span,.field span,.money span{display:block;color:#6d7780;font-size:6.5px;text-transform:uppercase;letter-spacing:.03em}.meta strong,.field strong{display:block;margin-top:1px;font-size:8.2px}.section{margin-top:5px;break-inside:avoid}.section h3{margin:0 0 3px;padding-bottom:2px;color:#102b46;font-size:8.2px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #dce2e7}.grid{display:grid;grid-template-columns:1fr 1fr;gap:1px 12px}.grid.compact{margin-top:2px}.field{padding:1.5px 0}.span-2{grid-column:1/-1}.financial{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}.money{padding:4px 5px;border:1px solid #dce2e7;border-radius:3px}.money strong{display:block;margin-top:1px;font-size:8.8px}table{width:100%;border-collapse:collapse;margin-top:2px}th,td{padding:2.4px 4px;border:1px solid #dce2e7;text-align:left;vertical-align:top;font-size:7.4px}th{background:#eef4f7;color:#102b46;font-size:6.7px;text-transform:uppercase}td:last-child,th:last-child{text-align:right}.notice,.copy-note{padding:4px 6px;background:#f2f6f8;border-left:2px solid #356a91;color:#34424e;white-space:pre-line}.copy-note{margin-top:5px;border:1px solid #d4dde4;border-left:3px solid #102b46}.declaration{margin-top:5px;padding:5px 7px;border:1px solid #c7d0d8;background:#fafbfc}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:38px;margin-top:17px;break-inside:avoid}.signature{padding-top:4px;border-top:1px solid #17212b;text-align:center}.signature strong{display:block}.footer{margin-top:6px;padding-top:4px;border-top:1px solid #e2e7eb;color:#7b8790;font-size:6.5px;text-align:center}.footer p{margin:1px 0}.muted{color:#89939c;text-align:center!important}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.document{break-inside:avoid}}
  </style></head><body><main class="document"><header class="institutional"><div class="seal">${safe(hotelInitials(hotelName))}</div><div><small>${safe(config.institutionalLabel)}</small><h1>${safe(hotelName)}</h1><p>${safe(legal || hotel.address || "Hospedagem e atendimento")}</p></div><div class="document-code"><small>Documento</small><strong>${safe(item.reservation_code)}</strong><span>Hospedagem #${safe(item.id)}</span></div></header><div class="hotel-strip"><span>${safe(hotel.address || "Passos, MG")}</span><span>${safe(contacts, "Contato institucional não informado")}</span></div><div class="title"><h2>${safe(config.documentTitle)}</h2><p>${safe(config.documentSubtitle)}</p></div><div class="meta-strip"><div class="meta"><span>Situação</span><strong>${safe(statusLabel(item.status))}</strong></div><div class="meta"><span>Quarto</span><strong>${safe(item.room_number)}</strong></div><div class="meta"><span>Origem</span><strong>${safe(source)}</strong></div><div class="meta"><span>Operador do check-in</span><strong>${safe(checkInOperator)}</strong></div></div><section class="section"><h3>Hóspede responsável</h3><div class="grid"><div class="field"><span>Nome</span><strong>${safe(item.guest_name)}</strong></div><div class="field"><span>CPF</span><strong>${safe(formattedCpf(item.guest_cpf_document || item.guest_cpf), "Não informado")}</strong></div>${contactFields}</div></section><section class="section"><h3>Dados da hospedagem</h3><div class="grid"><div class="field"><span>Categoria</span><strong>${safe(item.category_name)}</strong></div><div class="field"><span>Reserva</span><strong>${safe(item.reservation_code)}</strong></div><div class="field"><span>Check-in realizado</span><strong>${safe(dateTime(item.check_in_at))}</strong></div><div class="field"><span>Saída prevista</span><strong>${safe(longDate(item.expected_checkout_date))}</strong></div><div class="field"><span>Diárias</span><strong>${safe(item.nights)}</strong></div><div class="field"><span>Ocupação</span><strong>${safe(`${item.adults} adulto(s) · ${item.children} criança(s)`)}</strong></div></div></section>${operationalSection}${valuesSection}${chargesSection}${paymentsSection}${termsSection}${privacySection}<div class="declaration">${safe(config.declaration)}</div>${copyNote}${signatures}<footer class="footer"><p>Gerado em ${safe(issuedAt)} · Impresso por ${safe(operator)}.</p><p>${safe(config.footerNote)}</p></footer></main></body></html>`);
  printWindow.document.close();
  window.setTimeout(() => {
    const documentElement = printWindow.document.querySelector(".document");
    if (documentElement) {
      const targetHeightPx = 1040;
      const contentHeight = Math.max(documentElement.scrollHeight, 1);
      documentElement.style.zoom = String(Math.max(0.62, Math.min(1, targetHeightPx / contentHeight)));
    }
    printWindow.focus();
    printWindow.print();
  }, 180);
}

function printOptionsModal(item, settings, reservation) {
  const config = { ...defaults, ...(settings.stayPrint || {}) };
  showModal({
    title: "Preparar impressão",
    eyebrow: item.reservation_code,
    wide: true,
    content: `<form id="stay-print-options"><div class="form-grid"><div class="field"><label>Título desta via</label><input name="documentTitle" maxlength="100" value="${escapeHtml(config.documentTitle)}" required></div><div class="field"><label>Subtítulo desta via</label><input name="documentSubtitle" maxlength="180" value="${escapeHtml(config.documentSubtitle)}" required></div><div class="field span-2"><label>Observação somente nesta impressão</label><textarea name="copyNote" maxlength="800" placeholder="Opcional. Não altera a hospedagem nem a auditoria."></textarea></div></div><h3 class="section-title">Incluir no documento</h3><div class="form-grid">${option("showGuestContact", "Contato e endereço", config.showGuestContact)}${option("showValues", "Valores", config.showValues)}${option("showCharges", "Consumos e lançamentos", config.showCharges)}${option("showPayments", "Pagamentos", config.showPayments)}${option("showOperational", "Informações operacionais", config.showOperational)}${option("showTerms", "Condições de hospedagem", config.showTerms)}${option("showPrivacy", "Privacidade", config.showPrivacy)}${option("showSignatures", "Assinaturas", config.showSignatures)}</div><p class="form-alert" style="margin-top:14px">Estas opções alteram somente esta via impressa. Valores reais e lançamentos permanecem exatamente como estão no sistema.</p></form>`,
    footer: `<button class="button button--ghost" data-close>Cancelar</button><button class="button button--primary" data-print-now><i data-lucide="printer"></i>Gerar impressão</button>`,
    onMount(element, close) {
      element.querySelector("[data-print-now]").addEventListener("click", () => {
        const form = element.querySelector("#stay-print-options");
        if (!form.reportValidity()) return;
        const data = Object.fromEntries(new FormData(form));
        const options = {
          documentTitle: data.documentTitle,
          documentSubtitle: data.documentSubtitle,
          copyNote: data.copyNote,
          showGuestContact: form.elements.showGuestContact.checked,
          showValues: form.elements.showValues.checked,
          showCharges: form.elements.showCharges.checked,
          showPayments: form.elements.showPayments.checked,
          showOperational: form.elements.showOperational.checked,
          showTerms: form.elements.showTerms.checked,
          showPrivacy: form.elements.showPrivacy.checked,
          showSignatures: form.elements.showSignatures.checked,
        };
        close();
        renderDocument(item, settings, reservation, options);
      });
    },
  });
}

async function handlePrint(button) {
  try {
    const item = await findStayFromDrawer(button);
    const [settings, reservation] = await Promise.all([
      api.get("/api/settings"),
      api.get(`/api/reservations/${item.reservation_id}`).catch(() => null),
    ]);
    printOptionsModal(item, settings, reservation);
  } catch (error) {
    toast(error.message, { title: "Impressão não disponível", type: "danger" });
  }
}

export function installStayPrintEnhancer() {
  document.addEventListener("click", (event) => {
    const stayRow = event.target.closest('[data-open]');
    if (stayRow && document.querySelector("#stay-search")) lastStayId = stayRow.dataset.open;
    const button = event.target.closest("[data-print-contract]");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    handlePrint(button);
  }, true);
  document.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    const stayRow = event.target.closest?.('[data-open]');
    if (stayRow && document.querySelector("#stay-search")) lastStayId = stayRow.dataset.open;
  }, true);
}
