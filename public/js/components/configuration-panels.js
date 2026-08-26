import { api } from "../api.js";
import { refreshIcons, toast } from "./ui.js";
import { escapeHtml } from "../utils/format.js";

const fallbackSources = ["Direta", "Telefone", "WhatsApp", "Instagram", "Booking.com", "Expedia", "Agência / empresa"];
const fallbackPrint = {
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

function objectValue(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function panelHost() {
  return document.querySelector(".admin-layout > div:last-child");
}

function setActive(section) {
  document.querySelectorAll(".admin-nav [data-section]").forEach((button) => button.classList.toggle("is-active", button.dataset.section === section));
}

function toggle(name, label, description, checked) {
  return `<label class="card" style="display:flex;align-items:flex-start;gap:10px;padding:12px;cursor:pointer"><input type="checkbox" name="${name}"${checked ? " checked" : ""} style="margin-top:3px"><span><strong>${escapeHtml(label)}</strong><span class="muted" style="display:block;margin-top:3px">${escapeHtml(description)}</span></span></label>`;
}

async function renderSources() {
  const host = panelHost();
  if (!host) return;
  setActive("reservation_sources");
  host.innerHTML = `<section class="card"><div class="card__body"><p class="muted">Carregando origens de reserva...</p></div></section>`;
  try {
    const values = await api.get("/api/admin/settings");
    const sources = objectValue(values.reservation_sources, fallbackSources);
    host.innerHTML = `<section class="card"><form id="reservation-sources-form">
      <div class="card__header"><div><h2>Origens de reserva</h2><p class="muted">Gerencie as opções disponíveis na lista suspensa ao criar ou editar reservas.</p></div></div>
      <div class="card__body">
        <div class="field"><label>Uma origem por linha</label><textarea name="sources" rows="14" required>${escapeHtml(sources.join("\n"))}</textarea><span class="muted">Ex.: Direta, Telefone, WhatsApp, Booking.com, agência ou empresa. Reservas antigas preservam a origem já registrada.</span></div>
        <p class="form-alert" style="margin-top:14px">Mantenha pelo menos uma opção. Duplicidades são removidas automaticamente.</p>
        <button class="button button--primary" type="submit" style="margin-top:16px">Salvar origens</button>
      </div>
    </form></section>`;
    host.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector("button[type=submit]");
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const reservation_sources = data.sources.split("\n").map((item) => item.trim()).filter(Boolean);
      button.disabled = true;
      try {
        await api.put("/api/admin/settings", { reservation_sources });
        toast("Origens de reserva atualizadas.");
        await renderSources();
      } catch (error) {
        button.disabled = false;
        toast(error.message, { title: "Origens não salvas", type: "danger" });
      }
    });
  } catch (error) {
    host.innerHTML = `<section class="card"><div class="card__body"><p class="form-alert form-alert--danger">${escapeHtml(error.message)}</p></div></section>`;
  }
  refreshIcons(host);
}

async function renderPrint() {
  const host = panelHost();
  if (!host) return;
  setActive("print");
  host.innerHTML = `<section class="card"><div class="card__body"><p class="muted">Carregando padrão de impressão...</p></div></section>`;
  try {
    const values = await api.get("/api/admin/settings");
    const config = { ...fallbackPrint, ...objectValue(values.stay_print, {}) };
    host.innerHTML = `<section class="card"><form id="print-settings-form">
      <div class="card__header"><div><h2>Identidade e conteúdo da impressão</h2><p class="muted">Defina o padrão institucional dos termos de hospedagem e quais blocos aparecem inicialmente.</p></div></div>
      <div class="card__body">
        <div style="padding:18px;border-radius:10px;background:#102b46;color:white;margin-bottom:20px"><span style="font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;opacity:.72">${escapeHtml(config.institutionalLabel)}</span><h3 style="margin:7px 0 3px;color:white">${escapeHtml(config.documentTitle)}</h3><p style="margin:0;opacity:.8">${escapeHtml(config.documentSubtitle)}</p></div>
        <div class="form-grid">
          <div class="field"><label>Identificação institucional</label><input name="institutionalLabel" maxlength="80" value="${escapeHtml(config.institutionalLabel)}" required></div>
          <div class="field"><label>Título do documento</label><input name="documentTitle" maxlength="100" value="${escapeHtml(config.documentTitle)}" required></div>
          <div class="field span-2"><label>Subtítulo</label><input name="documentSubtitle" maxlength="180" value="${escapeHtml(config.documentSubtitle)}" required></div>
          <div class="field span-2"><label>Declaração / ciência</label><textarea name="declaration" maxlength="1800" required>${escapeHtml(config.declaration)}</textarea></div>
          <div class="field span-2"><label>Nota de rodapé</label><textarea name="footerNote" maxlength="600" required>${escapeHtml(config.footerNote)}</textarea></div>
        </div>
        <h3 class="section-title">Blocos exibidos por padrão</h3>
        <div class="form-grid">
          ${toggle("showGuestContact", "Contato e endereço do hóspede", "Telefone, e-mail e endereço.", config.showGuestContact)}
          ${toggle("showValues", "Valores", "Diária, totais, desconto, acréscimo, pago e saldo.", config.showValues)}
          ${toggle("showCharges", "Consumos e lançamentos", "Itens cobrados durante a hospedagem.", config.showCharges)}
          ${toggle("showPayments", "Pagamentos", "Histórico de pagamentos e operador responsável.", config.showPayments)}
          ${toggle("showOperational", "Informações operacionais", "Horários padrão e tempo de limpeza.", config.showOperational)}
          ${toggle("showTerms", "Condições de hospedagem", "Texto cadastrado em Hotel e pagamentos.", config.showTerms)}
          ${toggle("showPrivacy", "Aviso de privacidade", "Resumo do uso e proteção dos dados.", config.showPrivacy)}
          ${toggle("showSignatures", "Assinaturas", "Linhas do hóspede e do operador responsável.", config.showSignatures)}
        </div>
        <p class="form-alert" style="margin-top:16px">Na hora de imprimir, o operador poderá ajustar estes blocos para aquela cópia. A impressão nunca altera valores, consumos ou pagamentos gravados; correções devem ser feitas no fluxo operacional para preservar a auditoria.</p>
        <button class="button button--primary" type="submit" style="margin-top:16px">Salvar padrão de impressão</button>
      </div>
    </form></section>`;
    host.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector("button[type=submit]");
      const data = Object.fromEntries(new FormData(form));
      const stay_print = {
        institutionalLabel: data.institutionalLabel,
        documentTitle: data.documentTitle,
        documentSubtitle: data.documentSubtitle,
        declaration: data.declaration,
        footerNote: data.footerNote,
        showGuestContact: form.elements.showGuestContact.checked,
        showValues: form.elements.showValues.checked,
        showCharges: form.elements.showCharges.checked,
        showPayments: form.elements.showPayments.checked,
        showOperational: form.elements.showOperational.checked,
        showTerms: form.elements.showTerms.checked,
        showPrivacy: form.elements.showPrivacy.checked,
        showSignatures: form.elements.showSignatures.checked,
      };
      button.disabled = true;
      try {
        await api.put("/api/admin/settings", { stay_print });
        toast("Padrão de impressão atualizado.");
        await renderPrint();
      } catch (error) {
        button.disabled = false;
        toast(error.message, { title: "Impressão não configurada", type: "danger" });
      }
    });
  } catch (error) {
    host.innerHTML = `<section class="card"><div class="card__body"><p class="form-alert form-alert--danger">${escapeHtml(error.message)}</p></div></section>`;
  }
  refreshIcons(host);
}

function injectButtons() {
  const nav = document.querySelector(".admin-nav");
  if (!nav || nav.querySelector('[data-section="reservation_sources"]')) return;
  const audit = nav.querySelector('[data-section="audit"]');
  const sources = document.createElement("button");
  sources.dataset.section = "reservation_sources";
  sources.textContent = "Origens de reserva";
  sources.addEventListener("click", renderSources);
  const print = document.createElement("button");
  print.dataset.section = "print";
  print.textContent = "Impressão";
  print.addEventListener("click", renderPrint);
  nav.insertBefore(sources, audit);
  nav.insertBefore(print, audit);
}

export function installConfigurationPanels() {
  injectButtons();
  const observer = new window.MutationObserver(injectButtons);
  observer.observe(document.body, { childList: true, subtree: true });
}
