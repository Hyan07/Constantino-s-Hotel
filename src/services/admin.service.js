import { withTransaction } from "../database/pool.js";
import { adminRepository } from "../repositories/admin.repository.js";
import { authRepository } from "../repositories/auth.repository.js";
import { roomRepository } from "../repositories/room.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { hashPassword } from "../security/password.js";
import { AppError } from "../utils/app-error.js";
import { isValidCpf, maskCpf, normalizeCpf } from "../utils/cpf.js";
import { isValidCnpjFormat, normalizeCnpj } from "../utils/cnpj.js";
import { booleanValue, nonNegativeMoney, optionalString, positiveId, requiredString } from "../validators/common.js";
import { paginationMeta, parsePagination } from "../utils/pagination.js";

function slug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

function duplicate(error, message) {
  if (error?.code === "ER_DUP_ENTRY") throw new AppError("DUPLICATE_RECORD", message, 409);
  throw error;
}

export const adminService = {
  async rooms() { return adminRepository.listRooms(); },

  async users() {
    return (await adminRepository.listUsers()).map((user) => ({ ...user, cpf: maskCpf(user.cpf), roles: user.roles?.split(",") || [] }));
  },

  async roles() { return adminRepository.listRoles(); },

  async createUser(input, actor) {
    const cpf = normalizeCpf(input.cpf);
    if (!isValidCpf(cpf)) throw new AppError("INVALID_CPF", "O CPF informado não é válido.");
    const email = optionalString(input.email, "E-mail", { max: 190 });
    if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new AppError("INVALID_EMAIL", "O e-mail informado não é válido.");
    const passwordHash = await hashPassword(input.password);
    try {
      return await withTransaction(async (connection) => {
        const role = await adminRepository.findRoleBySlug(input.role || "reception", connection);
        if (!role) throw new AppError("ROLE_NOT_FOUND", "Perfil de acesso não encontrado.", 404);
        const userId = await adminRepository.createUser({
          name: requiredString(input.name, "Nome", { min: 3, max: 160 }),
          cpf,
          email: email?.toLowerCase() || null,
          passwordHash,
          roleId: role.id,
        }, connection);
        await auditRepository.log({ userId: actor.id, entityType: "user", entityId: userId, action: "user_created", changes: { role: role.slug }, ipAddress: actor.ipAddress }, connection);
        return { id: userId };
      });
    } catch (error) {
      return duplicate(error, "Já existe um usuário com este CPF ou e-mail.");
    }
  },

  async updateUser(id, input, actor) {
    const userId = positiveId(id, "Usuário");
    const email = optionalString(input.email, "E-mail", { max: 190 });
    if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new AppError("INVALID_EMAIL", "O e-mail informado não é válido.");
    return withTransaction(async (connection) => {
      const current = await authRepository.findUserById(userId, connection);
      if (!current) throw new AppError("USER_NOT_FOUND", "Usuário não encontrado.", 404);
      if (userId === actor.id && input.active === false) throw new AppError("SELF_DEACTIVATION", "Você não pode desativar sua própria conta.", 409);
      const role = await adminRepository.findRoleBySlug(input.role || current.roles[0], connection);
      if (!role) throw new AppError("ROLE_NOT_FOUND", "Perfil de acesso não encontrado.", 404);
      await adminRepository.updateUser(userId, {
        name: requiredString(input.name, "Nome", { min: 3, max: 160 }),
        email: email?.toLowerCase() || null,
        active: booleanValue(input.active, current.active),
        roleId: role.id,
      }, connection);
      if (!booleanValue(input.active, current.active)) await authRepository.revokeUserSessions(userId, connection);
      await auditRepository.log({ userId: actor.id, entityType: "user", entityId: userId, action: "user_updated", changes: { role: role.slug, active: input.active }, ipAddress: actor.ipAddress }, connection);
      return { id: userId };
    });
  },

  async resetUserPassword(id, input, actor) {
    const userId = positiveId(id, "Usuário");
    const passwordHash = await hashPassword(input.password);
    return withTransaction(async (connection) => {
      const user = await authRepository.findUserById(userId, connection);
      if (!user) throw new AppError("USER_NOT_FOUND", "Usuário não encontrado.", 404);
      await authRepository.updatePassword(userId, passwordHash, connection);
      await authRepository.revokeUserSessions(userId, connection);
      await auditRepository.log({ userId: actor.id, entityType: "user", entityId: userId, action: "password_reset_by_admin", ipAddress: actor.ipAddress }, connection);
      return { id: userId, reset: true };
    });
  },

  async categories() { return adminRepository.listCategories(); },

  async saveCategory(id, input, actor) {
    const data = {
      name: requiredString(input.name, "Nome", { min: 2, max: 100 }),
      slug: slug(input.slug || input.name),
      capacity: Number(input.capacity),
      baseRate: nonNegativeMoney(input.baseRate, "Diária padrão"),
      description: optionalString(input.description, "Descrição", { max: 5000 }),
      active: booleanValue(input.active, true),
    };
    if (!Number.isInteger(data.capacity) || data.capacity < 1 || data.capacity > 30) throw new AppError("VALIDATION_ERROR", "Capacidade deve ser de 1 a 30 hóspedes.");
    if (!data.slug) throw new AppError("VALIDATION_ERROR", "Não foi possível gerar o identificador da categoria.");
    try {
      return await withTransaction(async (connection) => {
        const categoryId = id
          ? positiveId(id, "Categoria")
          : await adminRepository.createCategory(data, connection);
        if (id) {
          if (!(await adminRepository.findCategoryById(categoryId, connection))) throw new AppError("CATEGORY_NOT_FOUND", "Categoria não encontrada.", 404);
          if (!data.active && await adminRepository.countActiveRoomsByCategory(categoryId, connection)) throw new AppError("CATEGORY_IN_USE", "Desative ou mova os quartos ativos desta categoria antes de desativá-la.", 409);
          await adminRepository.updateCategory(categoryId, data, connection);
        }
        await auditRepository.log({ userId: actor.id, entityType: "room_category", entityId: categoryId, action: id ? "category_updated" : "category_created", changes: data, ipAddress: actor.ipAddress }, connection);
        return { id: categoryId };
      });
    } catch (error) {
      return duplicate(error, "Já existe uma categoria com este identificador.");
    }
  },

  async settings() { return adminRepository.listSettings(); },

  async updateSettings(input, actor) {
    const normalized = {};
    if (input.hotel !== undefined) {
      if (!input.hotel || typeof input.hotel !== "object" || Array.isArray(input.hotel)) throw new AppError("VALIDATION_ERROR", "Os dados do hotel não são válidos.");
      const email = optionalString(input.hotel.email, "E-mail", { max: 190 });
      if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new AppError("INVALID_EMAIL", "O e-mail do hotel não é válido.");
      const cnpj = normalizeCnpj(input.hotel.cnpj);
      if (cnpj && !isValidCnpjFormat(cnpj)) {
        throw new AppError("INVALID_CNPJ", "O CNPJ deve possuir 14 posições; as 12 primeiras podem conter letras ou números e as duas últimas devem ser numéricas.");
      }
      const checkInTime = String(input.hotel.checkInTime || "14:00");
      const checkOutTime = String(input.hotel.checkOutTime || "12:00");
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(checkInTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(checkOutTime)) throw new AppError("VALIDATION_ERROR", "Os horários de check-in e check-out devem usar HH:MM.");
      const timezone = requiredString(input.hotel.timezone || "America/Sao_Paulo", "Fuso horário", { max: 100 });
      try { new Intl.DateTimeFormat("pt-BR", { timeZone: timezone }).format(); } catch { throw new AppError("VALIDATION_ERROR", "O fuso horário informado não é válido."); }
      const currency = String(input.hotel.currency || "BRL").toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) throw new AppError("VALIDATION_ERROR", "A moeda deve usar um código de três letras, como BRL.");
      const cleaningEstimateMinutes = input.hotel.cleaningEstimateMinutes === undefined || input.hotel.cleaningEstimateMinutes === ""
        ? null
        : Number(input.hotel.cleaningEstimateMinutes);
      if (cleaningEstimateMinutes !== null && (!Number.isInteger(cleaningEstimateMinutes) || cleaningEstimateMinutes < 1 || cleaningEstimateMinutes > 180)) {
        throw new AppError("VALIDATION_ERROR", "O tempo estimado de limpeza deve ser de 1 a 180 minutos.");
      }
      normalized.hotel = {
        name: requiredString(input.hotel.name, "Nome do hotel", { min: 2, max: 160 }),
        legalName: optionalString(input.hotel.legalName, "Razão social", { max: 180 }) || "",
        cnpj,
        phone: optionalString(input.hotel.phone, "Telefone", { max: 30 }) || "",
        email: email || "",
        address: optionalString(input.hotel.address, "Endereço", { max: 500 }) || "",
        checkInTime,
        checkOutTime,
        cleaningEstimateMinutes,
        hostingTerms: optionalString(input.hotel.hostingTerms, "Condições de hospedagem", { max: 5000 }) || "",
        privacyNotice: optionalString(input.hotel.privacyNotice, "Aviso de privacidade", { max: 2000 }) || "",
        currency,
        timezone,
      };
    }
    if (input.payment_methods !== undefined) {
      if (!Array.isArray(input.payment_methods) || input.payment_methods.length < 1 || input.payment_methods.length > 20) throw new AppError("VALIDATION_ERROR", "Informe de 1 a 20 formas de pagamento.");
      normalized.payment_methods = [...new Set(input.payment_methods.map((method) => requiredString(method, "Forma de pagamento", { max: 80 })))];
    }
    if (!Object.keys(normalized).length) throw new AppError("VALIDATION_ERROR", "Nenhuma configuração válida foi informada.");
    await withTransaction(async (connection) => {
      for (const [key, value] of Object.entries(normalized)) {
        await adminRepository.setSetting(key, value, actor.id, connection);
      }
      await auditRepository.log({ userId: actor.id, entityType: "settings", action: "settings_updated", changes: { keys: Object.keys(normalized) }, ipAddress: actor.ipAddress }, connection);
    });
    return adminRepository.listSettings();
  },

  async audit(query) {
    const pagination = parsePagination(query);
    const { rows, total } = await adminRepository.listAudit({ q: String(query.q || "").trim(), ...pagination });
    return { items: rows, pagination: paginationMeta(total, pagination.page, pagination.pageSize) };
  },

  async saveRoom(id, input, actor) {
    const data = {
      number: requiredString(input.number, "Número", { max: 12 }),
      categoryId: positiveId(input.categoryId, "Categoria"),
      floor: Number(input.floor),
      capacity: Number(input.capacity),
      beds: optionalString(input.beds, "Camas", { max: 180 }),
      notes: optionalString(input.notes, "Observações", { max: 5000 }),
      active: booleanValue(input.active, true),
    };
    if (!Number.isInteger(data.floor) || data.floor < -5 || data.floor > 200) throw new AppError("VALIDATION_ERROR", "Andar inválido.");
    if (!Number.isInteger(data.capacity) || data.capacity < 1 || data.capacity > 30) throw new AppError("VALIDATION_ERROR", "Capacidade inválida.");
    try {
      return await withTransaction(async (connection) => {
        if (!(await adminRepository.findCategoryById(data.categoryId, connection))) throw new AppError("CATEGORY_NOT_FOUND", "Categoria não encontrada.", 404);
        const roomId = id ? positiveId(id, "Quarto") : await adminRepository.createRoom(data, connection);
        if (id) {
          const room = await roomRepository.findById(roomId, connection, { forUpdate: true });
          if (!room) throw new AppError("ROOM_NOT_FOUND", "Quarto não encontrado.", 404);
          if (!data.active && (room.status === "occupied" || room.next_reservation_id)) throw new AppError("ROOM_IN_USE", "Não é possível desativar um quarto ocupado ou com reserva futura.", 409);
          await adminRepository.updateRoom(roomId, data, connection);
        }
        await auditRepository.log({ userId: actor.id, entityType: "room", entityId: roomId, action: id ? "room_updated" : "room_created", changes: { number: data.number, categoryId: data.categoryId, active: data.active }, ipAddress: actor.ipAddress }, connection);
        return { id: roomId };
      });
    } catch (error) {
      return duplicate(error, "Já existe um quarto com este número.");
    }
  },
};
