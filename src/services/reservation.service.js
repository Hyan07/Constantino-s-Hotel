import { randomBytes } from "node:crypto";
import { withTransaction } from "../database/pool.js";
import { reservationRepository } from "../repositories/reservation.repository.js";
import { guestRepository } from "../repositories/guest.repository.js";
import { roomRepository } from "../repositories/room.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { AppError } from "../utils/app-error.js";
import { assertDateRange, addDays, toSqlDate } from "../utils/dates.js";
import { maskCpf } from "../utils/cpf.js";
import { nonNegativeMoney, optionalString, positiveId } from "../validators/common.js";
import { paginationMeta, parsePagination } from "../utils/pagination.js";
import { canTransitionReservation } from "./reservation-status.js";

const validStatuses = new Set(["pending", "confirmed", "checked_in", "cancelled", "no_show"]);
const editableStatuses = new Set(["pending", "confirmed"]);
const activeBookingStatuses = new Set(["pending", "confirmed"]);

function code() {
  const now = new Date();
  const prefix = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `R${prefix}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function integer(value, field, { min = 0, max = 99 } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new AppError("VALIDATION_ERROR", `${field} deve ser um número entre ${min} e ${max}.`);
  }
  return number;
}

function baseData(input) {
  const nights = assertDateRange(input.checkIn, input.checkOut);
  const adults = integer(input.adults, "Adultos", { min: 1, max: 30 });
  const children = integer(input.children ?? 0, "Crianças", { min: 0, max: 30 });
  const discount = nonNegativeMoney(input.discount, "Desconto");
  const surcharge = nonNegativeMoney(input.surcharge, "Acréscimo");
  const requestedRate = input.dailyRate === undefined || input.dailyRate === "" ? null : nonNegativeMoney(input.dailyRate, "Diária");
  return {
    guestId: positiveId(input.guestId, "Hóspede"),
    roomId: input.roomId ? positiveId(input.roomId, "Quarto") : null,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    adults,
    children,
    nights,
    requestedRate,
    discount,
    surcharge,
    source: optionalString(input.source, "Origem", { max: 80 }),
    notes: optionalString(input.notes, "Observações", { max: 5000 }),
    status: editableStatuses.has(input.status) ? input.status : "pending",
  };
}

async function validateRoom(data, connection, excludeReservationId = null) {
  if (!data.roomId) {
    if (data.requestedRate === null) throw new AppError("DAILY_RATE_REQUIRED", "Informe a diária para reserva sem quarto definido.");
    return data.requestedRate;
  }
  const room = await reservationRepository.lockRoom(data.roomId, connection);
  if (!room || !room.active || !room.category_active) throw new AppError("ROOM_NOT_FOUND", "Quarto não encontrado ou inativo.", 404);
  if (["maintenance", "blocked"].includes(room.status)) {
    throw new AppError("ROOM_NOT_AVAILABLE", `O quarto ${room.number} não está disponível nesse período.`, 409);
  }
  if (room.capacity < data.adults + data.children) {
    throw new AppError("ROOM_CAPACITY_EXCEEDED", `O quarto ${room.number} não comporta essa quantidade de hóspedes.`, 409);
  }
  const conflict = await reservationRepository.findConflict({
    roomId: data.roomId,
    checkIn: data.checkIn,
    checkOut: data.checkOut,
    excludeReservationId,
  }, connection);
  if (conflict) {
    throw new AppError(
      "ROOM_NOT_AVAILABLE",
      `O quarto ${room.number} já possui uma reserva nesse período.`,
      409,
      { conflictingReservation: conflict },
    );
  }
  const block = await reservationRepository.findBlockConflict(data, connection);
  if (block) {
    throw new AppError("ROOM_BLOCKED", `O quarto ${room.number} está bloqueado nesse período: ${block.reason}.`, 409);
  }
  return data.requestedRate ?? Number(room.base_rate);
}

function finalData(data, dailyRate, userId) {
  const totalAmount = Math.max(0, Math.round((dailyRate * data.nights - data.discount + data.surcharge) * 100) / 100);
  return { ...data, dailyRate, totalAmount, userId };
}

export const reservationService = {
  async list(query) {
    const pagination = parsePagination(query);
    const filters = {
      q: String(query.q || "").trim(),
      status: validStatuses.has(query.status) ? query.status : null,
      roomId: query.roomId ? positiveId(query.roomId, "Quarto") : null,
      categoryId: query.categoryId ? positiveId(query.categoryId, "Categoria") : null,
      from: query.from || null,
      to: query.to || null,
      withoutRoom: query.withoutRoom === "true",
      tab: query.tab || "all",
      today: toSqlDate(),
      ...pagination,
    };
    const { rows, total } = await reservationRepository.list(filters);
    return {
      items: rows.map((row) => ({ ...row, guest_cpf: maskCpf(row.guest_cpf), balance: Number(row.total_amount) - Number(row.paid_amount) })),
      pagination: paginationMeta(total, pagination.page, pagination.pageSize),
    };
  },

  async detail(id) {
    const reservationId = positiveId(id, "Reserva");
    const reservation = await reservationRepository.findById(reservationId);
    if (!reservation) throw new AppError("RESERVATION_NOT_FOUND", "Reserva não encontrada.", 404);
    const [history, payments] = await Promise.all([
      reservationRepository.history(reservationId),
      reservationRepository.payments(reservationId),
    ]);
    return { ...reservation, guest_cpf: maskCpf(reservation.guest_cpf), balance: Number(reservation.total_amount) - Number(reservation.paid_amount), history, payments };
  },

  async available(query) {
    assertDateRange(query.checkIn, query.checkOut);
    const people = integer(query.people, "Hóspedes", { min: 1, max: 60 });
    return reservationRepository.availableRooms({
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      people,
      categoryId: query.categoryId ? positiveId(query.categoryId, "Categoria") : null,
      excludeReservationId: query.excludeReservationId ? positiveId(query.excludeReservationId, "Reserva") : null,
    });
  },

  async create(input, actor) {
    const data = baseData(input);
    if (!["pending", "confirmed"].includes(data.status)) data.status = "pending";
    return withTransaction(async (connection) => {
      const guest = await guestRepository.findById(data.guestId, connection);
      if (!guest || !guest.active) throw new AppError("GUEST_NOT_FOUND", "Hóspede não encontrado.", 404);
      const dailyRate = await validateRoom(data, connection);
      const prepared = finalData(data, dailyRate, actor.id);
      let reservationId;
      try {
        reservationId = await reservationRepository.insert({ ...prepared, code: code() }, connection);
      } catch (error) {
        if (error?.code !== "ER_DUP_ENTRY") throw error;
        reservationId = await reservationRepository.insert({ ...prepared, code: code() }, connection);
      }
      await reservationRepository.setPrimaryGuest(reservationId, prepared.guestId, connection);
      const reservation = await reservationRepository.findById(reservationId, connection);
      await reservationRepository.addHistory({
        reservationId,
        action: "created",
        toStatus: prepared.status,
        description: "Reserva criada",
        metadata: { roomId: prepared.roomId, checkIn: prepared.checkIn, checkOut: prepared.checkOut },
        userId: actor.id,
      }, connection);
      if (prepared.roomId && prepared.checkIn === toSqlDate() && reservation.room_status === "available") {
        await roomRepository.updateStatus(prepared.roomId, "reserved", connection);
      }
      await auditRepository.log({
        userId: actor.id,
        entityType: "reservation",
        entityId: reservationId,
        action: "reservation_created",
        changes: { code: reservation.code, roomId: prepared.roomId, totalAmount: prepared.totalAmount },
        ipAddress: actor.ipAddress,
      }, connection);
      return reservation;
    });
  },

  async update(id, input, actor) {
    const reservationId = positiveId(id, "Reserva");
    const data = baseData(input);
    return withTransaction(async (connection) => {
      const current = await reservationRepository.findById(reservationId, connection, { forUpdate: true });
      if (!current) throw new AppError("RESERVATION_NOT_FOUND", "Reserva não encontrada.", 404);
      if (!editableStatuses.has(current.status)) {
        throw new AppError("RESERVATION_NOT_EDITABLE", "Esta reserva não pode mais ser editada.", 409);
      }
      if (!canTransitionReservation(current.status, data.status)) {
        throw new AppError("INVALID_RESERVATION_STATUS", "A mudança de situação da reserva não é permitida.", 409);
      }
      const guest = await guestRepository.findById(data.guestId, connection);
      if (!guest || !guest.active) throw new AppError("GUEST_NOT_FOUND", "Hóspede não encontrado.", 404);
      const dailyRate = await validateRoom(data, connection, reservationId);
      const prepared = finalData(data, dailyRate, actor.id);
      await reservationRepository.update(reservationId, prepared, connection);
      await reservationRepository.setPrimaryGuest(reservationId, prepared.guestId, connection);
      await reservationRepository.addHistory({
        reservationId,
        action: "updated",
        fromStatus: current.status,
        toStatus: prepared.status,
        description: current.room_id !== prepared.roomId
          ? "Quarto ou período da reserva alterado"
          : "Reserva atualizada",
        metadata: {
          previousRoomId: current.room_id,
          roomId: prepared.roomId,
          checkIn: prepared.checkIn,
          checkOut: prepared.checkOut,
        },
        userId: actor.id,
      }, connection);
      if (current.room_id && current.room_id !== prepared.roomId && current.room_status === "reserved") {
        await roomRepository.updateStatus(current.room_id, "available", connection);
      }
      const updated = await reservationRepository.findById(reservationId, connection);
      if (prepared.roomId && prepared.checkIn === toSqlDate() && activeBookingStatuses.has(prepared.status) && updated.room_status === "available") {
        await roomRepository.updateStatus(prepared.roomId, "reserved", connection);
      }
      await auditRepository.log({
        userId: actor.id,
        entityType: "reservation",
        entityId: reservationId,
        action: "reservation_updated",
        changes: {
          fromStatus: current.status,
          toStatus: prepared.status,
          roomId: prepared.roomId,
          checkIn: prepared.checkIn,
          checkOut: prepared.checkOut,
        },
        ipAddress: actor.ipAddress,
      }, connection);
      return reservationRepository.findById(reservationId, connection);
    });
  },

  async cancel(id, input, actor) {
    const reservationId = positiveId(id, "Reserva");
    const reason = optionalString(input.reason, "Motivo", { max: 500 }) || "Cancelada pela recepção";
    return withTransaction(async (connection) => {
      const current = await reservationRepository.findById(reservationId, connection, { forUpdate: true });
      if (!current) throw new AppError("RESERVATION_NOT_FOUND", "Reserva não encontrada.", 404);
      if (!canTransitionReservation(current.status, "cancelled")) {
        throw new AppError("INVALID_RESERVATION_STATUS", "Esta reserva não pode ser cancelada.", 409);
      }
      await reservationRepository.updateStatus(reservationId, "cancelled", actor.id, connection);
      await reservationRepository.addHistory({
        reservationId, action: "cancelled", fromStatus: current.status, toStatus: "cancelled",
        description: reason, userId: actor.id,
      }, connection);
      if (current.room_id && current.room_status === "reserved") {
        await roomRepository.updateStatus(current.room_id, "available", connection);
      }
      await auditRepository.log({
        userId: actor.id, entityType: "reservation", entityId: reservationId,
        action: "reservation_cancelled", changes: { reason }, ipAddress: actor.ipAddress,
      }, connection);
      return { id: reservationId, status: "cancelled" };
    });
  },

  async noShow(id, actor) {
    const reservationId = positiveId(id, "Reserva");
    return withTransaction(async (connection) => {
      const current = await reservationRepository.findById(reservationId, connection, { forUpdate: true });
      if (!current) throw new AppError("RESERVATION_NOT_FOUND", "Reserva não encontrada.", 404);
      if (!canTransitionReservation(current.status, "no_show")) throw new AppError("INVALID_RESERVATION_STATUS", "Apenas uma reserva confirmada pode ser marcada como não compareceu.", 409);
      if (toSqlDate() < current.check_in_date) throw new AppError("NO_SHOW_TOO_EARLY", "A reserva só pode ser marcada como não compareceu a partir da data de entrada.", 409);
      await reservationRepository.updateStatus(reservationId, "no_show", actor.id, connection);
      await reservationRepository.addHistory({ reservationId, action: "no_show", fromStatus: current.status, toStatus: "no_show", description: "Hóspede não compareceu", userId: actor.id }, connection);
      if (current.room_id && current.room_status === "reserved") await roomRepository.updateStatus(current.room_id, "available", connection);
      await auditRepository.log({ userId: actor.id, entityType: "reservation", entityId: reservationId, action: "reservation_no_show", ipAddress: actor.ipAddress }, connection);
      return { id: reservationId, status: "no_show" };
    });
  },

  async calendar(query) {
    const from = query.from || toSqlDate();
    const days = [7, 15, 31].includes(Number(query.days)) ? Number(query.days) : 15;
    const to = query.to || addDays(from, days);
    assertDateRange(from, to);
    const data = await reservationRepository.calendar({ from, to });
    const occupancy = {};
    for (let cursor = from; cursor < to; cursor = addDays(cursor, 1)) {
      const occupied = new Set(
        data.reservations.filter((item) => item.room_id && item.check_in_date <= cursor && item.check_out_date > cursor).map((item) => item.room_id),
      ).size;
      occupancy[cursor] = data.rooms.length ? Math.round((occupied / data.rooms.length) * 100) : 0;
    }
    return { ...data, from, to, occupancy };
  },
};
