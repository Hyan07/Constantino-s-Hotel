import { api } from "../api.js";
import { hasPermission } from "../state.js";
import { confirmDialog, refreshIcons, showModal, toast } from "./ui.js";
import { currency, dateTime, escapeHtml } from "../utils/format.js";

const entityLabels = {
  reservation: "reserva",
  guest: "hóspede",
  stay: "hospedagem",
};

let pendingDetail = null;
let fetchInstalled = false;
let observerInstalled = false;

function attr(value) {
  return escapeHtml(String(value ?? ""));
}

function dateOnly(value) {
  return String(value || "").slice(0, 10);
}

function dateTimeLocal(value) {
  if (!value) return "";
  return String(value).replace(" ", "T").slice(0, 16);
}

function selectOptions(items, selected, valueKey, label) {
  return items.map((item) => {
    const value = item[valueKey];
    return `<option value="${attr(value)}"${String(value) === String(selected) ? " selected" : ""}>${escapeHtml(label(item))}</option>`;
  }).join("");
}

function field(label, name, value = "", { type = "text", span = false, extra = "", help = "" } = {}) {
  return `<div class="field${span ? " span-2" : ""}"><label>${escapeHtml(label)}</label><input name="${attr(name)}" type="${attr(type)}" value="${attr(value)}" ${extra}>${help ? `<span class="muted">${escapeHtml(help)}</span>` : ""}</div>`;
}

function textarea(label, name, value = "", { span = true } = {}) {
  return `<div class="field${span ? " span-2" : ""}"><label>${escapeHtml(label)}</label><textarea name="${attr(name)}">${escapeHtml(String(value || ""))}</textarea></div>`;
}

function selectField(label, name, options, { span = false } = {}) {
  return `<div class="field${span ? " span-2" : ""}"><label>${escapeHtml(label)}</label><select name="${attr(name)}">${options}</select></div>`;
}

function installFetchCapture() {
  if (fetchInstalled) return;
  fetchInstalled = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, options = {}) => {
    const response = await originalFetch(input, options);
    try {
      const method = String(options.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
      const match = url.pathname.match(/^\/api\/(reservations|guests|stays)\/(\d+)$/);
      if (method === "GET" && match && response.ok) {
        const payload = await response.clone().json();
        if (payload?.success && payload.data) {
          const type = match[1] === "reservations" ? "reservation" : match[1] === "guests" ? "guest" : "stay";
          pendingDetail = { type, id: Number(match[2]), data: payload.data };
        }
      }
    } catch {
      // A captura é apenas um aprimoramento administrativo; a requisição original continua normalmente.
    }
    return response;
  };
}

function choicesWithCurrent(items, current, idKey = "id") {
  if (!current || items.some((item) => Number(item[idKey]) === Number(current[idKey]))) return items;
  return [current, ...items];
}

async function loadChoices(entity) {
  if (!["reservation", "stay"].includes(entity.type)) return {};
  const [rooms, guestsResult] = await Promise.all([
    api.get("/api/rooms"),
    api.get("/api/guests", { page: 1, pageSize: 100 }),
  ]);
  const guests = choicesWithCurrent(guestsResult.items || [], { id: entity.data.guest_id, name: entity.data.guest_name });
  return { rooms, guests };
}

function financialSection(entity) {
  const payments = Array.isArray(entity.data.payments) ? entity.data.payments : [];
  const charges = Array.isArray(entity.data.charges) ? entity.data.charges : [];
  const paymentsHtml = payments.length ? `
    <div class="span-2"><h3 class="section-title">Pagamentos</h3><div class="timeline-list">
      ${payments.map((payment) => `<div class="timeline-item"><strong>${currency(payment.amount)} · ${escapeHtml(payment.payment_method || "")}</strong><span>${dateTime(payment.paid_at)} · ${escapeHtml(payment.status || "")}</span><div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="button button--secondary" data-admin-payment-edit="${payment.id}">Editar</button><button type="button" class="button button--danger" data-admin-payment-delete="${payment.id}">Excluir</button></div></div>`).join("")}
    </div></div>` : "";
  const chargesHtml = charges.length ? `
    <div class="span-2"><h3 class="section-title">Consumos e lançamentos</h3><div class="timeline-list">
      ${charges.map((charge) => `<div class="timeline-item"><strong>${escapeHtml(charge.description || "Lançamento")} · ${currency(charge.total_amount)}</strong><span>${dateTime(charge.charged_at)}</span><div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="button button--secondary" data-admin-charge-edit="${charge.id}">Editar</button><button type="button" class="button button--danger" data-admin-charge-delete="${charge.id}">Excluir</button></div></div>`).join("")}
    </div></div>` : "";
  return paymentsHtml + chargesHtml;
}

function guestFields(item) {
  return `
    ${field("Nome *", "name", item.name, { span: true, extra: "required maxlength=180" })}
    ${field("Novo CPF", "cpf", "", { help: item.has_cpf ? "Deixe vazio para manter o CPF atual." : "Opcional." })}
    <div class="field"><label>CPF atual</label><input value="${attr(item.cpf || "Não informado")}" disabled><label style="display:flex;gap:8px;align-items:center;margin-top:8px"><input name="clearCpf" type="checkbox" style="width:auto"> Remover CPF cadastrado</label></div>
    ${field("Data de nascimento", "birthDate", dateOnly(item.birth_date), { type: "date" })}
    ${field("Telefone", "phone", item.phone || "")}
    ${field("E-mail", "email", item.email || "", { type: "email" })}
    ${field("CEP", "postalCode", item.postal_code || "")}
    ${field("Logradouro", "street", item.street || "", { span: true })}
    ${field("Número", "streetNumber", item.street_number || "")}
    ${field("Complemento", "complement", item.complement || "")}
    ${field("Bairro", "neighborhood", item.neighborhood || "")}
    ${field("Cidade", "city", item.city || "")}
    ${field("UF", "state", item.state || "", { extra: "maxlength=2" })}
    ${selectField("Situação", "active", `<option value="true"${item.active ? " selected" : ""}>Ativo</option><option value="false"${!item.active ? " selected" : ""}>Inativo</option>`)}
    ${textarea("Observações", "notes", item.notes || "")}`;
}

function reservationFields(item, choices) {
  const guests = choices.guests || [];
  const rooms = choices.rooms || [];
  const guestOptions = selectOptions(guests, item.guest_id, "id", (guest) => guest.name || `Hóspede #${guest.id}`);
  const roomOptions = `<option value="">Sem quarto definido</option>${selectOptions(rooms, item.room_id, "id", (room) => `Quarto ${room.number} · ${room.category_name || ""}`)}`;
  const statuses = [
    ["pending", "Pendente"], ["confirmed", "Confirmada"], ["awaiting_checkin", "Aguardando check-in"],
    ["checked_in", "Hospedado"], ["completed", "Finalizada"], ["cancelled", "Cancelada"], ["no_show", "Não compareceu"],
  ];
  return `
    ${selectField("Hóspede principal", "guestId", guestOptions, { span: true })}
    ${selectField("Quarto", "roomId", roomOptions, { span: true })}
    ${field("Entrada", "checkIn", dateOnly(item.check_in_date), { type: "date", extra: "required" })}
    ${field("Saída", "checkOut", dateOnly(item.check_out_date), { type: "date", extra: "required" })}
    ${field("Adultos", "adults", item.adults, { type: "number", extra: "min=1 max=30 required" })}
    ${field("Crianças", "children", item.children, { type: "number", extra: "min=0 max=30 required" })}
    ${field("Diária", "dailyRate", item.daily_rate, { type: "number", extra: "min=0 step=0.01 required" })}
    ${field("Desconto", "discount", item.discount, { type: "number", extra: "min=0 step=0.01 required" })}
    ${field("Acréscimo", "surcharge", item.surcharge, { type: "number", extra: "min=0 step=0.01 required" })}
    ${field("Origem", "source", item.source || "")}
    ${selectField("Situação", "status", statuses.map(([value, label]) => `<option value="${value}"${item.status === value ? " selected" : ""}>${label}</option>`).join(""), { span: true })}
    ${textarea("Observações", "notes", item.notes || "")}`;
}

function stayFields(item, choices) {
  const guests = choices.guests || [];
  const rooms = choices.rooms || [];
  const guestOptions = selectOptions(guests, item.guest_id, "id", (guest) => guest.name || `Hóspede #${guest.id}`);
  const roomOptions = selectOptions(rooms, item.room_id, "id", (room) => `Quarto ${room.number} · ${room.category_name || ""}`);
  return `
    ${selectField("Hóspede principal", "guestId", guestOptions, { span: true })}
    ${selectField("Quarto", "roomId", roomOptions, { span: true })}
    ${field("Check-in", "checkInAt", dateTimeLocal(item.check_in_at), { type: "datetime-local", extra: "required" })}
    ${field("Saída prevista", "expectedCheckoutDate", dateOnly(item.expected_checkout_date), { type: "date", extra: "required" })}
    ${field("Check-out real", "checkOutAt", dateTimeLocal(item.check_out_at), { type: "datetime-local" })}
    ${selectField("Situação", "status", `<option value="active"${item.status === "active" ? " selected" : ""}>Ativa</option><option value="extended"${item.status === "extended" ? " selected" : ""}>Estendida</option><option value="completed"${item.status === "completed" ? " selected" : ""}>Finalizada</option>`)}
    <p class="form-alert span-2">Alterações administrativas de quarto, hóspede, datas ou situação também sincronizam a reserva vinculada.</p>`;
}

async function openPaymentEditor(payment) {
  showModal({
    title: "Editar pagamento",
    eyebrow: "Administração",
    content: `<form id="admin-payment-form" class="form-grid">
      ${field("Valor", "amount", payment.amount, { type: "number", extra: "min=0.01 step=0.01 required" })}
      ${field("Forma de pagamento", "paymentMethod", payment.payment_method || "", { extra: "required maxlength=80" })}
      ${field("Data", "paidAt", dateTimeLocal(payment.paid_at), { type: "datetime-local", extra: "required" })}
      ${selectField("Situação", "status", ["confirmed", "cancelled", "refunded"].map((status) => `<option value="${status}"${payment.status === status ? " selected" : ""}>${status}</option>`).join(""))}
      ${textarea("Observações", "notes", payment.notes || "")}
    </form>`,
    footer: `<button class="button button--ghost" data-close>Cancelar</button><button class="button button--primary" data-save>Salvar</button>`,
    onMount(element, close) {
      element.querySelector("[data-save]").addEventListener("click", async () => {
        const form = element.querySelector("#admin-payment-form");
        if (!form.reportValidity()) return;
        try {
          await api.put(`/api/admin/maintenance/payment/${payment.id}`, Object.fromEntries(new FormData(form)));
          close();
          toast("Pagamento atualizado pelo administrador.");
          window.setTimeout(() => window.location.reload(), 250);
        } catch (error) { toast(error.message, { title: "Não foi possível editar", type: "danger" }); }
      });
    },
  });
}

async function openChargeEditor(charge) {
  showModal({
    title: "Editar lançamento",
    eyebrow: "Administração",
    content: `<form id="admin-charge-form" class="form-grid">
      ${field("Descrição", "description", charge.description || "", { span: true, extra: "required maxlength=190" })}
      ${field("Quantidade", "quantity", charge.quantity, { type: "number", extra: "min=0.01 step=0.01 required" })}
      ${field("Valor unitário", "unitPrice", charge.unit_price, { type: "number", extra: "min=0 step=0.01 required" })}
      ${field("Data", "chargedAt", dateTimeLocal(charge.charged_at), { type: "datetime-local", span: true, extra: "required" })}
    </form>`,
    footer: `<button class="button button--ghost" data-close>Cancelar</button><button class="button button--primary" data-save>Salvar</button>`,
    onMount(element, close) {
      element.querySelector("[data-save]").addEventListener("click", async () => {
        const form = element.querySelector("#admin-charge-form");
        if (!form.reportValidity()) return;
        try {
          await api.put(`/api/admin/maintenance/charge/${charge.id}`, Object.fromEntries(new FormData(form)));
          close();
          toast("Lançamento atualizado pelo administrador.");
          window.setTimeout(() => window.location.reload(), 250);
        } catch (error) { toast(error.message, { title: "Não foi possível editar", type: "danger" }); }
      });
    },
  });
}

async function removeNested(type, item) {
  const label = type === "payment" ? "pagamento" : "lançamento";
  const confirmed = await confirmDialog({
    title: `Excluir ${label}`,
    message: `Esta ação remove definitivamente o ${label} #${item.id}. A operação ficará registrada na auditoria.`,
    confirmLabel: "Excluir definitivamente",
    danger: true,
  });
  if (!confirmed) return;
  try {
    await api.delete(`/api/admin/maintenance/${type}/${item.id}`);
    toast(`${label.charAt(0).toUpperCase() + label.slice(1)} excluído.`);
    window.setTimeout(() => window.location.reload(), 250);
  } catch (error) { toast(error.message, { title: "Não foi possível excluir", type: "danger" }); }
}

async function openEntityEditor(entity) {
  let choices = {};
  try { choices = await loadChoices(entity); }
  catch (error) { return toast(error.message, { title: "Não foi possível carregar opções", type: "danger" }); }

  const fields = entity.type === "guest" ? guestFields(entity.data)
    : entity.type === "reservation" ? reservationFields(entity.data, choices)
      : stayFields(entity.data, choices);
  showModal({
    title: `Editar ${entityLabels[entity.type]}`,
    eyebrow: "Modo administrador",
    wide: true,
    content: `<p class="form-alert form-alert--danger">Modo administrativo: estas alterações podem modificar dados históricos. Use somente para correções autorizadas.</p><form id="admin-maintenance-form" class="form-grid">${fields}${financialSection(entity)}</form>`,
    footer: `<button class="button button--ghost" data-close>Cancelar</button><button class="button button--primary" data-save><i data-lucide="save"></i>Salvar alterações</button>`,
    onMount(element, close) {
      element.querySelector("[data-save]").addEventListener("click", async () => {
        const form = element.querySelector("#admin-maintenance-form");
        if (!form.reportValidity()) return;
        const button = element.querySelector("[data-save]");
        button.disabled = true;
        try {
          await api.put(`/api/admin/maintenance/${entity.type}/${entity.id}`, Object.fromEntries(new FormData(form)));
          close();
          toast("Alterações administrativas salvas.");
          window.setTimeout(() => window.location.reload(), 250);
        } catch (error) {
          button.disabled = false;
          toast(error.message, { title: "Não foi possível salvar", type: "danger", duration: 6500 });
        }
      });
      const payments = entity.data.payments || [];
      const charges = entity.data.charges || [];
      element.querySelectorAll("[data-admin-payment-edit]").forEach((button) => button.addEventListener("click", () => openPaymentEditor(payments.find((item) => Number(item.id) === Number(button.dataset.adminPaymentEdit)))));
      element.querySelectorAll("[data-admin-payment-delete]").forEach((button) => button.addEventListener("click", () => removeNested("payment", payments.find((item) => Number(item.id) === Number(button.dataset.adminPaymentDelete)))));
      element.querySelectorAll("[data-admin-charge-edit]").forEach((button) => button.addEventListener("click", () => openChargeEditor(charges.find((item) => Number(item.id) === Number(button.dataset.adminChargeEdit)))));
      element.querySelectorAll("[data-admin-charge-delete]").forEach((button) => button.addEventListener("click", () => removeNested("charge", charges.find((item) => Number(item.id) === Number(button.dataset.adminChargeDelete)))));
    },
  });
}

async function deleteEntity(entity) {
  const label = entityLabels[entity.type];
  const confirmed = await confirmDialog({
    title: `Excluir ${label}`,
    message: `Deseja excluir definitivamente este ${label}? Se houver registros vinculados, o sistema bloqueará a exclusão e informará o que precisa ser resolvido antes.`,
    confirmLabel: "Excluir definitivamente",
    danger: true,
  });
  if (!confirmed) return;
  try {
    await api.delete(`/api/admin/maintenance/${entity.type}/${entity.id}`);
    toast(`${label.charAt(0).toUpperCase() + label.slice(1)} excluído.`);
    window.setTimeout(() => window.location.reload(), 250);
  } catch (error) {
    toast(error.message, { title: "Exclusão bloqueada", type: "danger", duration: 7000 });
  }
}

async function cancelReservation(entity) {
  const confirmed = await confirmDialog({
    title: "Cancelar reserva como administrador",
    message: `Deseja cancelar ${entity.data.code || `a reserva #${entity.id}`}? Se existir hospedagem ativa, a operação será bloqueada para preservar a consistência.`,
    confirmLabel: "Cancelar reserva",
    danger: true,
  });
  if (!confirmed) return;
  try {
    await api.post(`/api/admin/maintenance/reservation/${entity.id}/cancel`, {});
    toast("Reserva cancelada pelo administrador.");
    window.setTimeout(() => window.location.reload(), 250);
  } catch (error) { toast(error.message, { title: "Não foi possível cancelar", type: "danger", duration: 6500 }); }
}

function enhanceDrawer(backdrop, entity) {
  const drawer = backdrop.querySelector(".drawer");
  if (!drawer || drawer.dataset.adminMaintenance === "true") return;
  drawer.dataset.adminMaintenance = "true";
  let footer = drawer.querySelector(".drawer__footer");
  if (!footer) {
    footer = document.createElement("footer");
    footer.className = "drawer__footer";
    drawer.append(footer);
  }
  const marker = document.createElement("span");
  marker.className = "muted";
  marker.style.marginRight = "auto";
  marker.textContent = "Ações de administrador";
  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "button button--secondary";
  editButton.innerHTML = `<i data-lucide="pencil-ruler"></i>Editar tudo`;
  editButton.addEventListener("click", () => openEntityEditor(entity));
  footer.append(marker, editButton);

  if (entity.type === "reservation" && entity.data.status !== "cancelled") {
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "button button--ghost";
    cancelButton.innerHTML = `<i data-lucide="ban"></i>Cancelar (ADM)`;
    cancelButton.addEventListener("click", () => cancelReservation(entity));
    footer.append(cancelButton);
  }

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "button button--danger";
  deleteButton.innerHTML = `<i data-lucide="trash-2"></i>Excluir`;
  deleteButton.addEventListener("click", () => deleteEntity(entity));
  footer.append(deleteButton);
  refreshIcons(footer);
}

async function deleteConfigurationRecord(type, id, label) {
  const confirmed = await confirmDialog({
    title: `Excluir ${label}`,
    message: `Deseja excluir definitivamente este ${label}? Se houver histórico ou vínculos, a exclusão será bloqueada e o sistema indicará a alternativa segura.`,
    confirmLabel: "Excluir definitivamente",
    danger: true,
  });
  if (!confirmed) return;
  try {
    await api.delete(`/api/admin/maintenance/${type}/${id}`);
    toast(`${label.charAt(0).toUpperCase() + label.slice(1)} excluído.`);
    window.setTimeout(() => window.location.reload(), 250);
  } catch (error) {
    toast(error.message, { title: "Exclusão bloqueada", type: "danger", duration: 7000 });
  }
}

function addTableDeleteButton(editButton, type, label) {
  if (editButton.dataset.adminDeleteInstalled === "true") return;
  editButton.dataset.adminDeleteInstalled = "true";
  const id = Number(editButton.dataset.editUser || editButton.dataset.edit);
  if (!id) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button";
  button.setAttribute("aria-label", `Excluir ${label}`);
  button.setAttribute("title", `Excluir ${label}`);
  button.innerHTML = `<i data-lucide="trash-2"></i>`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    deleteConfigurationRecord(type, id, label);
  });
  editButton.insertAdjacentElement("afterend", button);
  refreshIcons(button);
}

function enhanceAdministrationPage() {
  const main = document.getElementById("main-view");
  if (!main || !window.location.hash.includes("administracao")) return;
  main.querySelectorAll("[data-edit-user]").forEach((button) => addTableDeleteButton(button, "user", "usuário"));
  main.querySelectorAll("section.card").forEach((section) => {
    const title = section.querySelector("h2")?.textContent?.trim() || "";
    if (title === "Cadastro de quartos") section.querySelectorAll("[data-edit]").forEach((button) => addTableDeleteButton(button, "room", "quarto"));
    if (title === "Categorias de quartos") section.querySelectorAll("[data-edit]").forEach((button) => addTableDeleteButton(button, "category", "categoria"));
  });
}

function installAdministrationObserver() {
  const main = document.getElementById("main-view");
  if (!main || main.dataset.adminMaintenanceObserver === "true") return;
  main.dataset.adminMaintenanceObserver = "true";
  const observer = new MutationObserver(enhanceAdministrationPage);
  observer.observe(main, { childList: true, subtree: true });
  window.addEventListener("hashchange", () => window.setTimeout(enhanceAdministrationPage, 0));
  enhanceAdministrationPage();
}

function installDrawerObserver() {
  if (observerInstalled) return;
  observerInstalled = true;
  const root = document.getElementById("overlay-root");
  if (!root) return;
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element) || !node.classList.contains("drawer-backdrop") || !pendingDetail) continue;
        const entity = pendingDetail;
        pendingDetail = null;
        enhanceDrawer(node, entity);
      }
    }
  });
  observer.observe(root, { childList: true });
}

export function installAdminMaintenance() {
  if (!hasPermission("administration.write")) return;
  installFetchCapture();
  installDrawerObserver();
  installAdministrationObserver();
}