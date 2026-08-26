import { api } from "../api.js";
import { getState } from "../state.js";
import { escapeHtml } from "../utils/format.js";
import { toast } from "./ui.js";

function ensureMobilePrintStyles() {
  if (document.getElementById("print-mobile-actions")) return;
  const style = document.createElement("style");
  style.id = "print-mobile-actions";
  style.textContent = `
    @media (max-width: 680px) {
      .drawer__footer [data-print-contract],
      .drawer__footer [data-guest-print-report] {
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
}

function safe(value, fallback = "—") {
  return escapeHtml(value === null || value === undefined || value === "" ? fallback : String(value));
}

function hotelInitials(name) {
  return String(name || "H")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function guestProfileData(drawer) {
  const details = {};
  drawer.querySelectorAll(".detail-item").forEach((item) => {
    const label = item.querySelector("span")?.textContent?.trim().toLowerCase();
    const value = item.querySelector("strong")?.textContent?.trim();
    if (label) details[label] = value;
  });

  const reservations = [...drawer.querySelectorAll("[data-reservation]")].map((button) => {
    const heading = button.querySelector("strong")?.textContent?.trim() || "";
    const [code, ...statusParts] = heading.split(" · ");
    return {
      code: code || "Reserva",
      status: statusParts.join(" · ") || "—",
      details: button.querySelector("span")?.textContent?.trim() || "—",
    };
  });

  return {
    name: drawer.querySelector(".drawer__header h2")?.textContent?.trim()
      || drawer.querySelector(".identity-cell h3")?.textContent?.trim()
      || "Hóspede",
    summary: drawer.querySelector(".identity-cell .muted")?.textContent?.trim() || "Sem histórico registrado.",
    cpf: details.cpf || "Não informado",
    phone: details.telefone || "Não informado",
    email: details["e-mail"] || details.email || "Não informado",
    reservations,
  };
}

function renderGuestReport(drawer, settings) {
  const guest = guestProfileData(drawer);
  const hotel = settings?.hotel || {};
  const hotelName = hotel.name || "Constantino's Hotel";
  const operator = getState().user?.name || "Operador não identificado";
  const issuedAt = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());
  const legal = [hotel.legalName, hotel.cnpj ? `CNPJ ${hotel.cnpj}` : ""].filter(Boolean).join(" · ");
  const contacts = [hotel.phone, hotel.email].filter(Boolean).join(" · ");
  const rows = guest.reservations.length
    ? guest.reservations.map((item) => `<tr><td><strong>${safe(item.code)}</strong><span>${safe(item.status)}</span></td><td>${safe(item.details)}</td></tr>`).join("")
    : `<tr><td colspan="2" class="empty">Nenhuma reserva registrada para este hóspede.</td></tr>`;

  const printWindow = window.open("", "_blank", "width=980,height=760");
  if (!printWindow) {
    toast("Permita pop-ups para imprimir o relatório do hóspede.", {
      title: "Impressão bloqueada",
      type: "danger",
    });
    return;
  }

  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relatório do Hóspede · ${safe(guest.name)}</title><style>
    @page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}body{color:#18232d;font:11px/1.4 Arial,Helvetica,sans-serif}.document{max-width:186mm;margin:0 auto}.institutional{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:14px 16px;background:#102b46;color:#fff;border-radius:8px 8px 0 0}.seal{display:grid;place-items:center;width:46px;height:46px;border:1px solid rgba(255,255,255,.65);border-radius:50%;font-size:14px;font-weight:800}.institutional small{display:block;font-size:8px;letter-spacing:.14em;text-transform:uppercase;opacity:.72}.institutional h1{margin:2px 0 1px;font-size:18px}.institutional p{margin:0;font-size:9px;opacity:.8}.issued{text-align:right;font-size:9px}.hotel-strip{display:flex;justify-content:space-between;gap:16px;padding:7px 10px;border:1px solid #d7e0e7;border-top:0;color:#5b6873}.title{text-align:center;padding:17px 0 11px}.title h2{margin:0;color:#102b46;font-size:17px;letter-spacing:.08em;text-transform:uppercase}.title p{margin:4px 0 0;color:#66737e}.section{margin-top:12px;break-inside:avoid}.section h3{margin:0 0 7px;padding-bottom:4px;color:#102b46;font-size:10px;letter-spacing:.06em;text-transform:uppercase;border-bottom:1px solid #dce3e8}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px}.field{padding:5px 0}.field span{display:block;color:#6c7882;font-size:8px;letter-spacing:.04em;text-transform:uppercase}.field strong{display:block;margin-top:2px;font-size:11px}.summary{padding:9px 11px;background:#f2f6f8;border-left:3px solid #356a91;color:#34424e}table{width:100%;border-collapse:collapse}th,td{padding:7px 8px;border:1px solid #dce3e8;text-align:left;vertical-align:top}th{background:#eef4f7;color:#102b46;font-size:8px;text-transform:uppercase}td:first-child{width:30%}td strong{display:block;color:#102b46}td span{display:block;margin-top:2px;color:#67737e;font-size:9px}.empty{text-align:center;color:#7c8790}.notice{margin-top:14px;padding:8px 10px;background:#fafbfc;border:1px solid #d7dfe5;color:#53606a}.footer{margin-top:18px;padding-top:7px;border-top:1px solid #dfe5e9;color:#7a858e;font-size:8px;text-align:center}.footer p{margin:2px 0}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.document{break-inside:avoid}}
  </style></head><body><main class="document"><header class="institutional"><div class="seal">${safe(hotelInitials(hotelName))}</div><div><small>Documento cadastral</small><h1>${safe(hotelName)}</h1><p>${safe(legal || hotel.address || "Hospedagem e atendimento")}</p></div><div class="issued"><small>Emitido em</small><strong>${safe(issuedAt)}</strong></div></header><div class="hotel-strip"><span>${safe(hotel.address || "Passos, MG")}</span><span>${safe(contacts, "Contato institucional não informado")}</span></div><div class="title"><h2>Relatório do Hóspede</h2><p>Cadastro e histórico de reservas vinculadas</p></div><section class="section"><h3>Identificação e contato</h3><div class="grid"><div class="field"><span>Nome</span><strong>${safe(guest.name)}</strong></div><div class="field"><span>CPF</span><strong>${safe(guest.cpf)}</strong></div><div class="field"><span>Telefone</span><strong>${safe(guest.phone)}</strong></div><div class="field"><span>E-mail</span><strong>${safe(guest.email)}</strong></div></div></section><section class="section"><h3>Resumo do histórico</h3><div class="summary">${safe(guest.summary)}</div></section><section class="section"><h3>Histórico de reservas</h3><table><thead><tr><th>Reserva / situação</th><th>Período, quarto e valor</th></tr></thead><tbody>${rows}</tbody></table></section><div class="notice"><strong>Documento diferente do Termo de Hospedagem.</strong> Este relatório reúne dados cadastrais e histórico do hóspede e não altera nem substitui o termo emitido dentro de cada hospedagem.</div><footer class="footer"><p>Gerado em ${safe(issuedAt)} · Impresso por ${safe(operator)}</p><p>${safe(hotelName)} · Relatório interno do hóspede</p></footer></main><script>window.addEventListener("load",()=>setTimeout(()=>{window.focus();window.print();},120));<\/script></body></html>`);
  printWindow.document.close();
}

function enhanceGuestDrawer(drawer) {
  const eyebrow = drawer.querySelector(".eyebrow")?.textContent?.trim();
  if (eyebrow !== "Perfil do hóspede" || drawer.dataset.guestPrintReady === "true") return;
  drawer.dataset.guestPrintReady = "true";

  const footer = ensureDrawerFooter(drawer);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button--secondary";
  button.dataset.guestPrintReport = "true";
  button.textContent = "Imprimir relatório";
  footer.prepend(button);

  button.addEventListener("click", async () => {
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "Preparando relatório...";
    try {
      const settings = await api.get("/api/settings");
      renderGuestReport(drawer, settings);
    } catch (error) {
      toast(error.message, { title: "Relatório não disponível", type: "danger" });
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
