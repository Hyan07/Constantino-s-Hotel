import { withTransaction } from "../database/pool.js";
import { roomRepository } from "../repositories/room.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { AppError } from "../utils/app-error.js";
import { optionalString, positiveId, requiredString } from "../validators/common.js";
import { toSqlDate } from "../utils/dates.js";

const statuses = new Set(["available", "reserved", "occupied", "awaiting_cleaning", "cleaning", "maintenance", "blocked"]);

function actorData(reqActor) {
  return { userId: reqActor.id, ipAddress: reqActor.ipAddress };
}

export const roomService = {
  async list(query) {
    const status = query.status && statuses.has(query.status) ? query.status : null;
    return roomRepository.list({ status, q: String(query.q || "").trim() });
  },

  async detail(id) {
    const roomId = positiveId(id, "Quarto");
    const room = await roomRepository.findById(roomId);
    if (!room) throw new AppError("ROOM_NOT_FOUND", "Quarto não encontrado.", 404);
    return { ...room, history: await roomRepository.history(roomId) };
  },

  async block(id, input, actor) {
    const roomId = positiveId(id, "Quarto");
    const reason = requiredString(input.reason, "Motivo", { min: 3, max: 255 });
    return withTransaction(async (connection) => {
      const room = await roomRepository.findById(roomId, connection, { forUpdate: true });
      if (!room) throw new AppError("ROOM_NOT_FOUND", "Quarto não encontrado.", 404);
      if (room.status !== "available") {
        throw new AppError("INVALID_ROOM_TRANSITION", "Somente um quarto disponível pode ser bloqueado.", 409);
      }
      if (room.next_reservation_id) throw new AppError("ROOM_HAS_FUTURE_RESERVATION", `O quarto possui a reserva ${room.next_reservation_code}. Realoque ou cancele essa reserva antes de bloquear.`, 409);
      await roomRepository.createBlock(roomId, reason, actor.id, connection);
      await roomRepository.updateStatus(roomId, "blocked", connection);
      await auditRepository.log({ ...actorData(actor), entityType: "room", entityId: roomId, action: "room_blocked", changes: { reason } }, connection);
      return { id: roomId, status: "blocked" };
    });
  },

  async unblock(id, actor) {
    const roomId = positiveId(id, "Quarto");
    return withTransaction(async (connection) => {
      const room = await roomRepository.findById(roomId, connection, { forUpdate: true });
      if (!room) throw new AppError("ROOM_NOT_FOUND", "Quarto não encontrado.", 404);
      if (room.status !== "blocked") throw new AppError("INVALID_ROOM_TRANSITION", "O quarto não está bloqueado.", 409);
      await roomRepository.releaseBlock(roomId, actor.id, connection);
      await roomRepository.updateStatus(roomId, "available", connection);
      await auditRepository.log({ ...actorData(actor), entityType: "room", entityId: roomId, action: "room_unblocked" }, connection);
      return { id: roomId, status: "available" };
    });
  },

  async startCleaning(id, input, actor) {
    const roomId = positiveId(id, "Quarto");
    const data = {
      employeeName: optionalString(input.employeeName, "Funcionário", { max: 160 }),
      notes: optionalString(input.notes, "Observações", { max: 5000 }),
    };
    return withTransaction(async (connection) => {
      const room = await roomRepository.findById(roomId, connection, { forUpdate: true });
      if (!room) throw new AppError("ROOM_NOT_FOUND", "Quarto não encontrado.", 404);
      if (room.status !== "awaiting_cleaning") {
        throw new AppError("INVALID_ROOM_TRANSITION", "Este quarto não está aguardando limpeza.", 409);
      }
      const taskId = room.cleaning_task_id || await roomRepository.createCleaningTask({ roomId, status: "pending", userId: actor.id }, connection);
      await roomRepository.startCleaning(taskId, data, connection);
      await roomRepository.updateStatus(roomId, "cleaning", connection);
      await auditRepository.log({ ...actorData(actor), entityType: "cleaning", entityId: taskId, action: "cleaning_started", changes: { roomId } }, connection);
      return { id: taskId, roomId, status: "in_progress" };
    });
  },

  async completeCleaning(id, input, actor) {
    const roomId = positiveId(id, "Quarto");
    const notes = optionalString(input.notes, "Observações", { max: 5000 });
    return withTransaction(async (connection) => {
      const room = await roomRepository.findById(roomId, connection, { forUpdate: true });
      if (!room) throw new AppError("ROOM_NOT_FOUND", "Quarto não encontrado.", 404);
      if (room.status !== "cleaning" || !room.cleaning_task_id) {
        throw new AppError("INVALID_ROOM_TRANSITION", "Este quarto não possui limpeza em andamento.", 409);
      }
      await roomRepository.completeCleaning(room.cleaning_task_id, { notes }, connection);
      const nextStatus = room.next_reservation_id && room.next_check_in === toSqlDate() ? "reserved" : "available";
      await roomRepository.updateStatus(roomId, nextStatus, connection);
      await auditRepository.log({ ...actorData(actor), entityType: "cleaning", entityId: room.cleaning_task_id, action: "cleaning_completed", changes: { roomId } }, connection);
      return { id: room.cleaning_task_id, roomId, status: "completed", roomStatus: nextStatus };
    });
  },

  async createMaintenance(id, input, actor) {
    const roomId = positiveId(id, "Quarto");
    const priority = ["low", "normal", "high", "urgent"].includes(input.priority) ? input.priority : "normal";
    const data = {
      roomId,
      type: requiredString(input.type, "Tipo", { max: 100 }),
      description: requiredString(input.description, "Descrição", { min: 5, max: 5000 }),
      priority,
      expectedAt: input.expectedAt || null,
      responsible: optionalString(input.responsible, "Responsável", { max: 160 }),
      notes: optionalString(input.notes, "Observações", { max: 5000 }),
      userId: actor.id,
    };
    return withTransaction(async (connection) => {
      const room = await roomRepository.findById(roomId, connection, { forUpdate: true });
      if (!room) throw new AppError("ROOM_NOT_FOUND", "Quarto não encontrado.", 404);
      if (!room.active || room.status !== "available") throw new AppError("INVALID_ROOM_TRANSITION", "Somente um quarto disponível pode entrar em manutenção. Realoque ou cancele reservas e remova bloqueios antes.", 409);
      if (room.next_reservation_id) throw new AppError("ROOM_HAS_FUTURE_RESERVATION", `O quarto possui a reserva ${room.next_reservation_code}. Realoque ou cancele essa reserva antes de abrir manutenção.`, 409);
      const maintenanceId = await roomRepository.createMaintenance(data, connection);
      await roomRepository.updateStatus(roomId, "maintenance", connection);
      await auditRepository.log({ ...actorData(actor), entityType: "maintenance", entityId: maintenanceId, action: "maintenance_created", changes: { roomId, priority } }, connection);
      return { id: maintenanceId, roomId, status: "open" };
    });
  },

  async completeMaintenance(id, input, actor) {
    const roomId = positiveId(id, "Quarto");
    const notes = optionalString(input.notes, "Observações", { max: 5000 });
    return withTransaction(async (connection) => {
      const room = await roomRepository.findById(roomId, connection, { forUpdate: true });
      if (!room) throw new AppError("ROOM_NOT_FOUND", "Quarto não encontrado.", 404);
      if (room.status !== "maintenance" || !room.maintenance_id) {
        throw new AppError("INVALID_ROOM_TRANSITION", "Este quarto não possui manutenção aberta.", 409);
      }
      await roomRepository.completeMaintenance(room.maintenance_id, actor.id, notes, connection);
      await roomRepository.updateStatus(roomId, "available", connection);
      await auditRepository.log({ ...actorData(actor), entityType: "maintenance", entityId: room.maintenance_id, action: "maintenance_completed", changes: { roomId } }, connection);
      return { id: room.maintenance_id, roomId, status: "completed" };
    });
  },
};
