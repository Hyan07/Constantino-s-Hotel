import { api } from "../api.js";
import { emptyState, setMain, showModal, toast } from "../components/ui.js";
import { currency, dateTime, escapeHtml, initials, statusLabel } from "../utils/format.js";

let section = "users";

function adminShell(content) {
  setMain(`<div class="page-shell"><div class="page-header"><div><p class="eyebrow">Administração</p><h1>Configurações do sistema</h1><p>Usuários, acomodações, parâmetros e rastreabilidade.</p></div></div><div class="admin-layout"><nav class="card admin-nav"><button data-section="users" class="${section === "users" ? "is-active" : ""}">Usuários</button><button data-section="rooms" class="${section === "rooms" ? "is-active" : ""}">Quartos</button><button data-section="categories" class="${section === "categories" ? "is-active" : ""}">Categorias</button><button data-section="settings" class="${section === "settings" ? "is-active" : ""}">Hotel e pagamentos</button><button data-section="audit" class="${section === "audit" ? "is-active" : ""}">Auditoria</button></nav><div>${content}</div></div></div>`);
  document.querySelectorAll("[data-section]").forEach((button) => button.addEventListener("click", () => { section = button.dataset.section; adminView.render(); }));
}

function editor({ title, fields, saveLabel = "Salvar", onSave }) {
  showModal({ title, wide: true, content: `<form id="admin-form" class="form-grid">${fields}<p class="form-alert form-alert--danger span-2" data-error hidden></p></form>`, footer: `<button class="button button--ghost" data-close>Cancelar</button><button class="button button--primary" data-save>${saveLabel}</button>`, onMount(element, close) {
    element.querySelector("[data-save]").addEventListener("click", async () => {
      const form = element.querySelector("#admin-form");
      if (!form.reportValidity()) return;
      const button = element.querySelector("[data-save]"); button.disabled = true;
      try { await onSave(Object.fromEntries(new FormData(form))); close(); toast("Alterações salvas."); adminView.render(); } catch (error) { const panel = element.querySelector("[data-error]"); panel.textContent = error.message; panel.hidden = false; button.disabled = false; }
    });
  } });
}

async function users() {
  const [items, roles] = await Promise.all([api.get("/api/admin/users"), api.get("/api/admin/roles")]);
  const roleOptions = (selected) => roles.map((role) => `<option value="${role.slug}"${selected === role.slug ? " selected" : ""}>${escapeHtml(role.name)}</option>`).join("");
  const userFields = (user = {}) => `<div class="field span-2"><label>Nome *</label><input name="name" value="${escapeHtml(user.name || "")}" required minlength="3"></div><div class="field"><label>CPF *</label><input name="cpf" value="${escapeHtml(user.cpf || "")}" ${user.id ? "disabled" : "required"}></div><div class="field"><label>E-mail</label><input name="email" type="email" value="${escapeHtml(user.email || "")}"></div>${user.id ? "" : `<div class="field"><label>Senha inicial *</label><input name="password" type="password" minlength="12" required></div>`}<div class="field"><label>Perfil *</label><select name="role">${roleOptions(user.roles?.[0] || "reception")}</select></div>${user.id ? `<div class="field"><label>Situação</label><select name="active"><option value="true"${user.active ? " selected" : ""}>Ativo</option><option value="false"${!user.active ? " selected" : ""}>Inativo</option></select></div>` : ""}<p class="form-alert span-2">Senhas precisam ter ao menos 12 caracteres, com maiúscula, minúscula, número e símbolo.</p>`;
  adminShell(`<section class="card card--flush"><div class="card__header"><div><h2>Usuários e acessos</h2><p class="muted">Perfis disponíveis: ${roles.map((role) => escapeHtml(role.name)).join(", ")}</p></div><button class="button button--primary" data-new-user><i data-lucide="user-plus"></i>Novo usuário</button></div>${items.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Usuário</th><th>CPF</th><th>Perfil</th><th>Último acesso</th><th>Situação</th><th></th></tr></thead><tbody>${items.map((user) => `<tr><td><div class="identity-cell"><span class="avatar">${initials(user.name)}</span><span><span class="cell-title">${escapeHtml(user.name)}</span><span class="cell-subtitle">${escapeHtml(user.email || "sem e-mail")}</span></span></div></td><td>${escapeHtml(user.cpf)}</td><td>${escapeHtml(user.role_names || user.roles.join(", "))}</td><td>${dateTime(user.last_login_at)}</td><td><span class="badge ${user.active ? "badge--success" : "badge--danger"}">${user.active ? "Ativo" : "Inativo"}</span></td><td><button class="icon-button" data-edit-user="${user.id}" aria-label="Editar"><i data-lucide="pencil"></i></button><button class="icon-button" data-reset-user="${user.id}" aria-label="Redefinir senha"><i data-lucide="key-round"></i></button></td></tr>`).join("")}</tbody></table></div>` : emptyState("Nenhum usuário", "Crie o primeiro usuário adicional.", "users")}</section>`);
  document.querySelector("[data-new-user]").addEventListener("click", () => editor({ title: "Novo usuário", fields: userFields(), onSave: (data) => api.post("/api/admin/users", data) }));
  document.querySelectorAll("[data-edit-user]").forEach((button) => button.addEventListener("click", () => { const user = items.find((item) => item.id === Number(button.dataset.editUser)); editor({ title: "Editar usuário", fields: userFields(user), onSave: (data) => api.put(`/api/admin/users/${user.id}`, { ...data, active: data.active === "true" }) }); }));
  document.querySelectorAll("[data-reset-user]").forEach((button) => button.addEventListener("click", () => editor({
    title: "Redefinir senha",
    fields: `<div class="field span-2"><label>Nova senha *</label><input name="password" type="password" minlength="12" required></div>`,
    saveLabel: "Redefinir e encerrar sessões",
    onSave: (data) => api.post(`/api/admin/users/${button.dataset.resetUser}/reset-password`, data),
  })));
}

async function categories() {
  const items = await api.get("/api/admin/categories");
  const fields = (item = {}) => { const active = item.id ? Boolean(item.active) : true; return `<div class="field"><label>Nome *</label><input name="name" value="${escapeHtml(item.name || "")}" required></div><div class="field"><label>Identificador</label><input name="slug" value="${escapeHtml(item.slug || "")}" placeholder="Gerado pelo nome"></div><div class="field"><label>Capacidade *</label><input name="capacity" type="number" min="1" max="30" value="${item.capacity || 2}" required></div><div class="field"><label>Diária padrão *</label><input name="baseRate" type="number" min="0" step="0.01" value="${item.base_rate || 0}" required></div><div class="field span-2"><label>Descrição</label><textarea name="description">${escapeHtml(item.description || "")}</textarea></div><div class="field"><label>Situação</label><select name="active"><option value="true"${active ? " selected" : ""}>Ativa</option><option value="false"${!active ? " selected" : ""}>Inativa</option></select></div>`; };
  adminShell(`<section class="card card--flush"><div class="card__header"><div><h2>Categorias de quartos</h2><p class="muted">Capacidade e tarifa padrão usadas nas reservas.</p></div><button class="button button--primary" data-new><i data-lucide="plus"></i>Nova categoria</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Categoria</th><th>Capacidade</th><th>Diária</th><th>Quartos</th><th>Situação</th><th></th></tr></thead><tbody>${items.map((item) => `<tr><td><span class="cell-title">${escapeHtml(item.name)}</span><span class="cell-subtitle">${escapeHtml(item.slug)}</span></td><td>${item.capacity} pax</td><td>${currency(item.base_rate)}</td><td>${item.room_count}</td><td><span class="badge ${item.active ? "badge--success" : "badge--danger"}">${item.active ? "Ativa" : "Inativa"}</span></td><td><button class="icon-button" data-edit="${item.id}"><i data-lucide="pencil"></i></button></td></tr>`).join("")}</tbody></table></div></section>`);
  document.querySelector("[data-new]").addEventListener("click", () => editor({ title: "Nova categoria", fields: fields(), onSave: (data) => api.post("/api/admin/categories", { ...data, active: data.active === "true" }) }));
  document.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => { const item = items.find((entry) => entry.id === Number(button.dataset.edit)); editor({ title: "Editar categoria", fields: fields(item), onSave: (data) => api.put(`/api/admin/categories/${item.id}`, { ...data, active: data.active === "true" }) }); }));
}

async function rooms() {
  const [items, categoriesList] = await Promise.all([api.get("/api/admin/rooms"), api.get("/api/admin/categories")]);
  const options = (selected) => categoriesList.filter((item) => item.active || item.id === selected).map((item) => `<option value="${item.id}"${item.id === selected ? " selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
  const fields = (item = {}) => { const active = item.id ? Boolean(item.active) : true; return `<div class="field"><label>Número *</label><input name="number" value="${escapeHtml(item.number || "")}" required></div><div class="field"><label>Categoria *</label><select name="categoryId">${options(item.category_id)}</select></div><div class="field"><label>Andar *</label><input name="floor" type="number" value="${item.floor ?? 1}" required></div><div class="field"><label>Capacidade *</label><input name="capacity" type="number" min="1" max="30" value="${item.capacity || 2}" required></div><div class="field span-2"><label>Camas</label><input name="beds" value="${escapeHtml(item.beds || "")}" placeholder="Ex.: 1 cama queen e 1 solteiro"></div><div class="field span-2"><label>Observações</label><textarea name="notes">${escapeHtml(item.notes || "")}</textarea></div><div class="field"><label>Situação cadastral</label><select name="active"><option value="true"${active ? " selected" : ""}>Ativo</option><option value="false"${!active ? " selected" : ""}>Inativo</option></select></div>`; };
  adminShell(`<section class="card card--flush"><div class="card__header"><div><h2>Cadastro de quartos</h2><p class="muted">Estrutura física e capacidade das acomodações.</p></div><button class="button button--primary" data-new><i data-lucide="plus"></i>Novo quarto</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Quarto</th><th>Categoria</th><th>Andar</th><th>Capacidade</th><th>Situação</th><th></th></tr></thead><tbody>${items.map((item) => `<tr><td class="cell-title">${escapeHtml(item.number)}</td><td>${escapeHtml(item.category_name)}</td><td>${item.floor}º</td><td>${item.capacity} pax</td><td><span class="badge ${item.active ? `status--${item.status}` : "badge--danger"}">${item.active ? statusLabel(item.status) : "Inativo"}</span></td><td><button class="icon-button" data-edit="${item.id}"><i data-lucide="pencil"></i></button></td></tr>`).join("")}</tbody></table></div></section>`);
  document.querySelector("[data-new]").addEventListener("click", () => editor({ title: "Novo quarto", fields: fields(), onSave: (data) => api.post("/api/admin/rooms", { ...data, active: data.active === "true" }) }));
  document.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => { const item = items.find((entry) => entry.id === Number(button.dataset.edit)); editor({ title: `Editar quarto ${item.number}`, fields: fields(item), onSave: (data) => api.put(`/api/admin/rooms/${item.id}`, { ...data, active: data.active === "true" }) }); }));
}

function objectValue(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

async function settings() {
  const values = await api.get("/api/admin/settings");
  const hotel = objectValue(values.hotel, {});
  const methods = objectValue(values.payment_methods, ["Pix", "Dinheiro", "Cartão de crédito", "Cartão de débito"]);
  adminShell(`<section class="card"><form id="settings-form">
    <div class="settings-section"><h2>Identificação do hotel</h2><div class="form-grid">
      <div class="field"><label>Nome comercial</label><input name="hotelName" value="${escapeHtml(hotel.name || "Constantino's Hotel")}" required></div>
      <div class="field"><label>Razão social</label><input name="legalName" maxlength="180" value="${escapeHtml(hotel.legalName || "")}" placeholder="Opcional"></div>
      <div class="field"><label>CNPJ</label><input name="cnpj" maxlength="18" value="${escapeHtml(hotel.cnpj || "")}" placeholder="Numérico ou alfanumérico"></div>
      <div class="field"><label>Telefone</label><input name="phone" value="${escapeHtml(hotel.phone || "")}"></div>
      <div class="field"><label>E-mail</label><input name="email" type="email" value="${escapeHtml(hotel.email || "")}"></div>
      <div class="field"><label>Moeda</label><select name="currency"><option value="BRL" selected>Real brasileiro (BRL)</option></select></div>
      <div class="field span-2"><label>Endereço</label><input name="address" value="${escapeHtml(hotel.address || "")}"></div>
    </div></div>
    <div class="settings-section"><h2>Operação da hospedagem</h2><div class="form-grid">
      <div class="field"><label>Horário padrão de check-in</label><input name="checkInTime" type="time" value="${escapeHtml(hotel.checkInTime || "14:00")}"></div>
      <div class="field"><label>Horário padrão de check-out</label><input name="checkOutTime" type="time" value="${escapeHtml(hotel.checkOutTime || "12:00")}"></div>
      <div class="field"><label>Tempo estimado de limpeza/organização</label><input name="cleaningEstimateMinutes" type="number" min="1" max="180" step="1" value="${escapeHtml(hotel.cleaningEstimateMinutes ?? "")}" placeholder="Ex.: 120"><span class="muted">Em minutos, até 180.</span></div>
      <div class="field"><label>Fuso horário</label><input name="timezone" value="${escapeHtml(hotel.timezone || "America/Sao_Paulo")}" required></div>
      <div class="field span-2"><label>Condições de hospedagem</label><textarea name="hostingTerms" maxlength="5000" placeholder="Ex.: regras de horário, silêncio, visitantes, danos e outras condições próprias do hotel.">${escapeHtml(hotel.hostingTerms || "")}</textarea><span class="muted">Esse texto será incluído no termo impresso quando preenchido.</span></div>
      <div class="field span-2"><label>Aviso resumido de privacidade</label><textarea name="privacyNotice" maxlength="2000" placeholder="Explique de forma simples como os dados do hóspede são usados e protegidos.">${escapeHtml(hotel.privacyNotice || "")}</textarea></div>
      <p class="form-alert span-2">Os horários de entrada/saída e o tempo estimado de limpeza aparecem no termo de hospedagem. Revise as condições comerciais e o aviso de privacidade antes do uso definitivo.</p>
    </div></div>
    <div class="settings-section"><h2>Formas de pagamento</h2><div class="field"><label>Uma por linha</label><textarea name="paymentMethods">${escapeHtml(methods.join("\n"))}</textarea></div></div>
    <div class="settings-section"><button class="button button--primary" type="submit">Salvar configurações</button></div>
  </form></section>`);
  document.querySelector("#settings-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api.put("/api/admin/settings", {
        hotel: {
          name: data.hotelName,
          legalName: data.legalName,
          cnpj: data.cnpj,
          phone: data.phone,
          email: data.email,
          address: data.address,
          checkInTime: data.checkInTime,
          checkOutTime: data.checkOutTime,
          cleaningEstimateMinutes: data.cleaningEstimateMinutes,
          hostingTerms: data.hostingTerms,
          privacyNotice: data.privacyNotice,
          currency: data.currency,
          timezone: data.timezone,
        },
        payment_methods: data.paymentMethods.split("\n").map((item) => item.trim()).filter(Boolean),
      });
      toast("Configurações salvas.");
    } catch (error) {
      toast(error.message, { title: "Configurações não salvas", type: "danger" });
    }
  });
}

async function audit() {
  const result = await api.get("/api/admin/audit", { pageSize: 50 });
  adminShell(`<section class="card card--flush"><div class="card__header"><div><h2>Trilha de auditoria</h2><p class="muted">Operações sensíveis registradas com usuário, data e origem.</p></div></div>${result.items.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>IP</th></tr></thead><tbody>${result.items.map((item) => `<tr><td>${dateTime(item.created_at)}</td><td>${escapeHtml(item.user_name || "Sistema")}</td><td><span class="cell-title">${escapeHtml(item.action)}</span></td><td>${escapeHtml(item.entity_type)}${item.entity_id ? ` #${item.entity_id}` : ""}</td><td>${escapeHtml(item.ip_address || "—")}</td></tr>`).join("")}</tbody></table></div>` : emptyState("Sem eventos de auditoria", "As operações administrativas aparecerão aqui.", "scroll-text")}</section>`);
}

const renderers = { users, rooms, categories, settings, audit };
export const adminView = { async render() { await renderers[section](); } };
