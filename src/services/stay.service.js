import { withTransaction } from "../database/pool.js";
import { stayRepository } from "../repositories/stay.repository.js";
import { reservationRepository } from "../repositories/reservation.repository.js";
import { roomRepository } from "../repositories/room.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { AppError } from "../utils/app-error.js";
import { assertDateRange, addDays, toSqlDate } from "../utils/dates.js";
import { maskCpf } from "../utils/cpf.js";
import { optionalString, positiveId, positiveNumber, requiredString } from "../validators/common.js";

export const stayService = {
  async list(query) {
    const rows = await stayRepository.list({ tab: query.tab || "active", q: String(query.q || "").trim(), today: toSqlDate() });
    return rows.map((row) => ({
      ...row,
      guest_cpf: maskCpf(row.guest_cpf),
      total_amount: Number(row.lodging_amount) + Number(row.charges_amount),
      balance: Number(row.lodging_amount) + Number(row.charges_amount) - Number(row.paid_amount),
    }));
  },

  async detail(id) {
    const stayId = positiveId(id, "Hospedagem");
    const stay = await stayRepository.findById(stayId);
    if (!stay) throw new AppError("STAY_NOT_FOUND", "Hospedagem não encontrada.", 404);
    const [charges, payments] = await Promise.all([stayRepository.charges(stayId), stayRepository.payments(stay)]);
    const total = Number(stay.lodging_amount) + Number(stay.charges_amount);
    const protectedCpf = maskCpf(stay.guest_cpf);
    return {
      ...stay,
      guest_cpf: protectedCpf,
      guest_cpf_document: protectedCpf,
      total_amount: total,
      balance: total - Number(stay.paid_amount),
      charges,
      payments,
    };
  },

  async checkIn(reservationIdValue, actor) {
    const reservationId = positiveId(reservationIdValue, "Reserva");
    return withTransaction(async (connection) => {
      const reservation = await reservationRepository.findById(reservationId, connection, { forUpdate: true });
      if (!reservation) throw new AppError("RESERVATION_NOT_FOUND", "Reserva não encontrada.", 404);
      if (!["confirmed", "awaiting_checkin"].includes(reservation.status)) {
        throw new AppError("INVALID_RESERVATION_STATUS", "A reserva não está pronta para check-in.", 409);
      }
      if (!reservation.room_id) throw new AppError("ROOM_REQUIRED", "Defina um quarto antes do check-in.", 409);
      const room = await reservationRepository.lockRoom(reservation.room_id, connection);
      if (!room || ["occupied", "awaiting_cleaning", "cleaning", "maintenance", "blocked"].includes(room.status)) {
        throw new AppError("ROOM_NOT_READY", `O quarto ${room?.number || "informado"} não está pronto para check-in.`, 409);
      }
      const activeStay = await stayRepository.findActiveByRoom(room.id, connection);
      if (activeStay) throw new AppError("ROOM_OCCUPIED", `O quarto ${room.number} já está ocupado.`, 409);
      const today = toSqlDate();
      if (today < reservation.check_in_date) {
        throw new AppError("CHECKIN_TOO_EARLY", "A data de entrada desta reserva ainda não chegou.", 409);
      }
      if (today >= reservation.check_out_date) {
        throw new AppError("CHECKIN_DATE_EXPIRED", "O período desta reserva já terminou.", 409);
      }
      const stayId = await stayRepository.create({
        reservationId,
        guestId: reservation.guest_id,
        roomId: reservation.room_id,
        expectedCheckoutDate: reservation.check_out_date,
        userId: actor.id,
      }, connection);
      await reservationRepository.updateStatus(reservationId, "checked_in", actor.id, connection);
      await roomRepository.updateStatus(room.id, "occupied", connection);
      await reservationRepository.addHistory({
        reservationId, action: "check_in", fromStatus: reservation.status, toStatus: "checked_in",
        description: `Check-in realizado no quarto ${room.number}`, metadata: { stayId }, userId: actor.id,
      }, connection);
      await auditRepository.log({
        userId: actor.id, entityType: "stay", entityId: stayId, action: "check_in",
        changes: { reservationId, roomId: room.id }, ipAddress: actor.ipAddress,
      }, connection);
      const createdStay = await stayRepository.findById(stayId, connection);
      return { ...createdStay, guest_cpf: maskCpf(createdStay?.guest_cpf) };
    });
  },

  async addCharge(id, input, actor) {
    const stayId = positiveId(id, "Hospedagem");
    const quantity = positiveNumber(input.quantity, "Quantidade");
    const unitPrice = Math.round(positiveNumber(input.unitPrice, "Valor unitário") * 100) / 100;
    const data = {
      stayId,
      description: requiredString(input.description, "Descrição", { min: 2, max: 190 }),
      quantity,
      unitPrice,
      totalAmount: Math.round(quantity * unitPrice * 100) / 100,
      userId: actor.id,
    };
    return withTransaction(async (connection) => {
      const stay = await stayRepository.findById(stayId, connection, { forUpdate: true });
      if (!stay || !["active", "extended"].includes(stay.status)) throw new AppError("STAY_NOT_ACTIVE", "A hospedagem não está ativa.", 409);
      const chargeId = await stayRepository.addCharge(data, connection);
      await reservationRepository.addHistory({
        reservationId: stay.reservation_id, action: "charge_added",
        description: `${data.description} adicionado à hospedagem`, metadata: { chargeId, totalAmount: data.totalAmount }, userId: actor.id,
      }, connection);
      await auditRepository.log({
        userId: actor.id, entityType: "charge", entityId: chargeId, action: "charge_created",
        changes: { stayId, totalAmount: data.totalAmount }, ipAddress: actor.ipAddress,
      }, connection);
      return { id: chargeId, ...data };
    });
  },

  async extend(id, input, actor) {
    const stayId = positiveId(id, "Hospedagem");
    const extraNights = Math.round(positiveNumber(input.nights || 1, "Diárias"));
    if (extraNights > 30) throw new AppError("INVALID_EXTENSION", "A extensão máxima por operação é de 30 diárias.");
    return withTransaction(async (connection) => {
      const stay = await stayRepository.findById(stayId, connection, { forUpdate: true });
      if (!stay || !["active", "extended"].includes(stay.status)) throw new AppError("STAY_NOT_ACTIVE", "A hospedagem não está ativa.", 409);
      await reservationRepository.lockRoom(stay.room_id, connection);
      const newCheckout = addDays(stay.expected_checkout_date, extraNights);
      const conflict = await reservationRepository.findConflict({
        roomId: stay.room_id,
        checkIn: stay.expected_checkout_date,
        checkOut: newCheckout,
        excludeReservationId: stay.reservation_id,
      }, connection);
      if (conflict) throw new AppError("ROOM_NOT_AVAILABLE", `O quarto já possui a reserva ${conflict.code} nesse período.`, 409, { conflictingReservation: conflict });
      const nights = assertDateRange(stay.check_in_date, newCheckout);
      const totalAmount = Math.max(
        0,
        Math.round((Number(stay.daily_rate) * nights - Number(stay.discount) + Number(stay.surcharge)) * 100) / 100,
      );
      await stayRepository.extend(stayId, newCheckout, connection);
      await stayRepository.updateReservationDatesAndAmount(stay.reservation_id, newCheckout, nights, totalAmount, actor.id, connection);
      await reservationRepository.addHistory({
        reservationId: stay.reservation_id, action: "stay_extended", description: `Hospedagem estendida até ${newCheckout}`,
        metadata: { extraNights, newCheckout }, userId: actor.id,
      }, connection);
      return { id: stayId, expectedCheckoutDate: newCheckout, status: "extended" };
    });
  },

  async checkout(id, input, actor) {
    const stayId = positiveId(id, "Hospedagem");
    const notes = optionalString(input.notes, "Observações", { max: 5000 });
    return withTransaction(async (connection) => {
      const stay = await stayRepository.findById(stayId, connection, { forUpdate: true });
      if (!stay || !["active", "extended"].includes(stay.status)) throw new AppError("STAY_NOT_ACTIVE", "A hospedagem não está ativa.", 409);
      await reservationRepository.lockRoom(stay.room_id, connection);
      const total = Number(stay.lodging_amount) + Number(stay.charges_amount);
      const balance = Math.round((total - Number(stay.paid_amount)) * 100) / 100;
      if (balance > 0) {
        throw new AppError("OUTSTANDING_BALANCE", `Ainda existe saldo de R$ ${balance.toFixed(2).replace(".", ",")}.`, 409, { balance });
      }
      await stayRepository.complete(stayId, actor.id, connection);
      await reservationRepository.updateStatus(stay.reservation_id, "completed", actor.id, connection);
      await roomRepository.updateStatus(stay.room_id, "awaiting_cleaning", connection);
      const cleaningTaskId = await roomRepository.createCleaningTask({
        roomId: stay.room_id, status: "pending", notes, userId: actor.id,
      }, connection);
      await reservationRepository.addHistory({
        reservationId: stay.reservation_id, action: "check_out", fromStatus: "checked_in", toStatus: "completed",
        description: `Check-out concluído; quarto ${stay.room_number} aguardando limpeza`, metadata: { stayId, cleaningTaskId }, userId: actor.id,
      }, connection);
      await auditRepository.log({
        userId: actor.id, entityType: "stay", entityId: stayId, action: "check_out",
        changes: { roomId: stay.room_id, cleaningTaskId }, ipAddress: actor.ipAddress,
      }, connection);
      return { id: stayId, status: "completed", roomStatus: "awaiting_cleaning", cleaningTaskId };
    });
  },
};
