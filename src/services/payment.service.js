import { withTransaction } from "../database/pool.js";
import { paymentRepository } from "../repositories/payment.repository.js";
import { reservationRepository } from "../repositories/reservation.repository.js";
import { stayRepository } from "../repositories/stay.repository.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { AppError } from "../utils/app-error.js";
import { optionalString, positiveId, positiveNumber, requiredString } from "../validators/common.js";

export const paymentService = {
  async create(input, actor) {
    const reservationId = input.reservationId ? positiveId(input.reservationId, "Reserva") : null;
    const stayId = input.stayId ? positiveId(input.stayId, "Hospedagem") : null;
    if (!reservationId && !stayId) throw new AppError("PAYMENT_TARGET_REQUIRED", "Informe a reserva ou hospedagem do pagamento.");
    const amount = Math.round(positiveNumber(input.amount, "Valor") * 100) / 100;
    const data = {
      reservationId,
      stayId,
      amount,
      paymentMethod: requiredString(input.paymentMethod, "Forma de pagamento", { max: 80 }),
      paidAt: input.paidAt || null,
      notes: optionalString(input.notes, "Observação", { max: 500 }),
      userId: actor.id,
    };
    return withTransaction(async (connection) => {
      let target;
      let balance;
      if (stayId) {
        target = await stayRepository.findById(stayId, connection, { forUpdate: true });
        if (!target || target.status === "completed") throw new AppError("STAY_NOT_FOUND", "Hospedagem não encontrada ou encerrada.", 404);
        balance = Number(target.lodging_amount) + Number(target.charges_amount) - Number(target.paid_amount);
        data.reservationId = data.reservationId || target.reservation_id;
      } else {
        target = await reservationRepository.findById(reservationId, connection, { forUpdate: true });
        if (!target || ["cancelled", "no_show"].includes(target.status)) throw new AppError("RESERVATION_NOT_FOUND", "Reserva não encontrada ou cancelada.", 404);
        balance = Number(target.total_amount) - Number(target.paid_amount);
      }
      if (amount > balance + 0.009) {
        throw new AppError("PAYMENT_EXCEEDS_BALANCE", `O valor excede o saldo de R$ ${balance.toFixed(2).replace(".", ",")}.`, 409);
      }
      const paymentId = await paymentRepository.create(data, connection);
      if (data.reservationId) {
        await reservationRepository.addHistory({
          reservationId: data.reservationId,
          action: "payment_registered",
          description: `Pagamento de R$ ${amount.toFixed(2).replace(".", ",")} registrado`,
          metadata: { paymentId, method: data.paymentMethod },
          userId: actor.id,
        }, connection);
      }
      await auditRepository.log({
        userId: actor.id, entityType: "payment", entityId: paymentId, action: "payment_registered",
        changes: { reservationId: data.reservationId, stayId, amount, method: data.paymentMethod }, ipAddress: actor.ipAddress,
      }, connection);
      return paymentRepository.findById(paymentId, connection);
    });
  },

  async list(query) {
    return paymentRepository.list({
      reservationId: query.reservationId ? positiveId(query.reservationId, "Reserva") : null,
      stayId: query.stayId ? positiveId(query.stayId, "Hospedagem") : null,
    });
  },
};
