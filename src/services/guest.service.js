import { withTransaction } from "../database/pool.js";
import { guestRepository } from "../repositories/guest.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { AppError } from "../utils/app-error.js";
import { isValidCpf, maskCpf, normalizeCpf } from "../utils/cpf.js";
import { optionalString, positiveId, requiredString } from "../validators/common.js";
import { paginationMeta, parsePagination } from "../utils/pagination.js";

function validateGuest(input, { currentCpf = null, preserveCpfWhenBlank = false } = {}) {
  const cpfInput = String(input.cpf ?? "").trim();
  const cpf = cpfInput ? normalizeCpf(cpfInput) : (preserveCpfWhenBlank ? currentCpf : null);
  if (cpf && !isValidCpf(cpf)) throw new AppError("INVALID_CPF", "O CPF informado não é válido.");

  const email = optionalString(input.email, "E-mail", { max: 190 });
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new AppError("INVALID_EMAIL", "O e-mail informado não é válido.");

  return {
    name: requiredString(input.name, "Nome", { min: 3, max: 180 }),
    cpf,
    phone: optionalString(input.phone, "Telefone", { max: 30 }),
    email: email?.toLowerCase() || null,
  };
}

function protectedGuest(row) {
  if (!row) return row;
  return {
    ...row,
    has_cpf: Boolean(row.cpf),
    cpf: maskCpf(row.cpf),
  };
}

function duplicateError(error) {
  if (error?.code === "ER_DUP_ENTRY") {
    throw new AppError("GUEST_CPF_EXISTS", "Já existe um hóspede cadastrado com este CPF.", 409);
  }
  throw error;
}

export const guestService = {
  async list(query) {
    const pagination = parsePagination(query);
    const { rows, total } = await guestRepository.list({ q: String(query.q || "").trim(), ...pagination });
    return {
      items: rows.map(protectedGuest),
      pagination: paginationMeta(total, pagination.page, pagination.pageSize),
    };
  },

  async detail(id) {
    const guestId = positiveId(id, "Hóspede");
    const guest = await guestRepository.findById(guestId);
    if (!guest) throw new AppError("GUEST_NOT_FOUND", "Hóspede não encontrado.", 404);
    const history = await guestRepository.history(guestId);
    return { ...protectedGuest(guest), history };
  },

  async create(input, actor) {
    const data = validateGuest(input);
    try {
      return await withTransaction(async (connection) => {
        const id = await guestRepository.create(data, connection);
        await auditRepository.log({
          userId: actor.id,
          entityType: "guest",
          entityId: id,
          action: "guest_created",
          changes: { name: data.name, hasCpf: Boolean(data.cpf) },
          ipAddress: actor.ipAddress,
        }, connection);
        return protectedGuest(await guestRepository.findById(id, connection));
      });
    } catch (error) {
      return duplicateError(error);
    }
  },

  async update(id, input, actor) {
    const guestId = positiveId(id, "Hóspede");
    try {
      return await withTransaction(async (connection) => {
        const current = await guestRepository.findById(guestId, connection);
        if (!current) throw new AppError("GUEST_NOT_FOUND", "Hóspede não encontrado.", 404);

        const data = validateGuest(input, { currentCpf: current.cpf, preserveCpfWhenBlank: true });
        await guestRepository.update(guestId, data, connection);
        await auditRepository.log({
          userId: actor.id,
          entityType: "guest",
          entityId: guestId,
          action: "guest_updated",
          changes: { name: data.name, hasCpf: Boolean(data.cpf) },
          ipAddress: actor.ipAddress,
        }, connection);
        return protectedGuest(await guestRepository.findById(guestId, connection));
      });
    } catch (error) {
      return duplicateError(error);
    }
  },
};
