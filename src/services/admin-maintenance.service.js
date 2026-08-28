import { withTransaction } from "../database/pool.js";
import { auditRepository } from "../repositories/audit.repository.js";
import { AppError } from "../utils/app-error.js";
import { isValidCpf, normalizeCpf } from "../utils/cpf.js";
import { positiveId } from "../validators/common.js";

const reservationStatuses = new Set(["pending", "confirmed", "awaiting_checkin", "checked_in", "completed", "cancelled", "no_show"]);
const stayStatuses = new Set(["active", "extended", "completed"]);
const paymentStatuses = new Set(["confirmed", "cancelled", "refunded"]);
const activeReservationStatuses = new Set(["pending", "confirmed", "awaiting_checkin", "checked_in"]);

function text(value, field, { required = false, max = 5000 } = {}) {
  const result = String(value ?? "").trim();
  if (required && !result) throw new AppError("VALIDATION_ERROR", `${field} é obrigatório.`);
  if (result.length > max) throw new AppError("VALIDATION_ERROR", `${field} deve possuir no máximo ${max} caracteres.`);
  return result || null;
}

function money(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new AppError("VALIDATION_ERROR", `${field} deve ser um valor igual ou maior que zero.`);
  return Math.round(number * 100) / 100;
}

function positive(value, field, { integer = false, min = 0.01, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    throw new AppError("VALIDATION_ERROR", `${field} possui um valor inválido.`);
  }
  return number;
}

function booleanValue(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["true", "1", "on", "yes"].includes(String(value).toLowerCase());
}

function dateValue(value, field) {
  const result = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T12:00:00Z`))) {
    throw new AppError("VALIDATION_ERROR", `${field} possui uma data inválida.`);
  }
  return result;
}

function dateTimeValue(value, field, { nullable = false } = {}) {
  if ((value === undefined || value === null || value === "") && nullable) return null;
  const raw = String(value || "").trim().replace("T", " ");
  const result = raw.length === 16 ? `${raw}:00` : raw.slice(0, 19);
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(result) || Number.isNaN(Date.parse(result.replace(" ", "T")))) {
    throw new AppError("VALIDATION_ERROR", `${field} possui data ou horário inválido.`);
  }
  return result;
}

function nightsBetween(checkIn, checkOut) {
  const start = new Date(`${checkIn}T12:00:00Z`);
  const end = new Date(`${checkOut}T12:00:00Z`);
  const nights = Math.round((end - start) / 86_400_000);
  if (!Number.isInteger(nights) || nights < 1) throw new AppError("VALIDATION_ERROR", "A saída deve ocorrer depois da entrada.");
  return nights;
}

function nullableId(value, field) {
  if (value === undefined || value === null || value === "") return null;
  return positiveId(value, field);
}

async function ensureGuest(id, connection) {
  const [rows] = await connection.execute("SELECT id, active FROM guests WHERE id=? LIMIT 1", [id]);
  if (!rows[0]) throw new AppError("GUEST_NOT_FOUND", "Hóspede não encontrado.", 404);
  return rows[0];
}

async function ensureRoom(id, connection) {
  const [rows] = await connection.execute(
    `SELECT rm.id, rm.number, rm.capacity, rm.status, rm.active, rc.active AS category_active
     FROM rooms rm JOIN room_categories rc ON rc.id=rm.room_category_id WHERE rm.id=? LIMIT 1 FOR UPDATE`,
    [id],
  );
  if (!rows[0] || !rows[0].active || !rows[0].category_active) throw new AppError("ROOM_NOT_FOUND", "Quarto não encontrado ou inativo.", 404);
  return rows[0];
}

async function ensureRoomAvailableForReservation({ roomId, reservationId, checkIn, checkOut, people, status }, connection) {
  if (!roomId) return null;
  const room = await ensureRoom(roomId, connection);
  if (room.capacity < people) throw new AppError("ROOM_CAPACITY_EXCEEDED", `O quarto ${room.number} não comporta essa quantidade de hóspedes.`, 409);
  if (!activeReservationStatuses.has(status)) return room;
  if (["maintenance", "blocked"].includes(room.status)) throw new AppError("ROOM_NOT_AVAILABLE", `O quarto ${room.number} está indisponível.`, 409);
  const [conflicts] = await connection.execute(
    `SELECT r.id, r.code FROM reservations r
     WHERE r.room_id=? AND r.id<>? AND r.check_in_date < ? AND r.check_out_date > ?
       AND r.status IN ('pending','confirmed','awaiting_checkin','checked_in') LIMIT 1`,
    [roomId, reservationId, checkOut, checkIn],
  );
  if (conflicts[0]) throw new AppError("ROOM_NOT_AVAILABLE", `O quarto já possui a reserva ${conflicts[0].code} nesse período.`, 409);
  const [blocks] = await connection.execute(
    `SELECT reason FROM room_blocks WHERE room_id=? AND status='active' AND start_date < ? AND end_date > ? LIMIT 1`,
    [roomId, checkOut, checkIn],
  );
  if (blocks[0]) throw new AppError("ROOM_BLOCKED", `O quarto está bloqueado nesse período: ${blocks[0].reason}.`, 409);
  return room;
}

async function editGuest(id, input, actor) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute("SELECT * FROM guests WHERE id=? LIMIT 1 FOR UPDATE", [id]);
    const current = rows[0];
    if (!current) throw new AppError("GUEST_NOT_FOUND", "Hóspede não encontrado.", 404);

    let cpf = current.cpf;
    if (booleanValue(input.clearCpf, false)) cpf = null;
    else if (String(input.cpf || "").trim()) {
      cpf = normalizeCpf(input.cpf);
      if (!isValidCpf(cpf)) throw new AppError("INVALID_CPF", "O CPF informado não é válido.");
    }

    const email = text(input.email, "E-mail", { max: 190 });
    if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new AppError("INVALID_EMAIL", "O e-mail informado não é válido.");
    const state = text(input.state, "UF", { max: 2 })?.toUpperCase() || null;
    if (state && !/^[A-Z]{2}$/.test(state)) throw new AppError("VALIDATION_ERROR", "A UF deve possuir duas letras.");
    const birthDate = input.birthDate ? dateValue(input.birthDate, "Data de nascimento") : null;

    try {
      await connection.execute(
        `UPDATE guests SET name=?, cpf=?, birth_date=?, phone=?, email=?, postal_code=?, street=?, street_number=?, complement=?,
          neighborhood=?, city=?, state=?, notes=?, active=? WHERE id=?`,
        [
          text(input.name, "Nome", { required: true, max: 180 }), cpf, birthDate,
          text(input.phone, "Telefone", { max: 30 }), email?.toLowerCase() || null,
          text(input.postalCode, "CEP", { max: 10 }), text(input.street, "Logradouro", { max: 190 }),
          text(input.streetNumber, "Número", { max: 30 }), text(input.complement, "Complemento", { max: 100 }),
          text(input.neighborhood, "Bairro", { max: 120 }), text(input.city, "Cidade", { max: 120 }), state,
          text(input.notes, "Observações", { max: 5000 }), booleanValue(input.active, current.active), id,
        ],
      );
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY") throw new AppError("DUPLICATE_RECORD", "Já existe um hóspede com este CPF.", 409);
      throw error;
    }
    await auditRepository.log({
      userId: actor.id, entityType: "guest", entityId: id, action: "admin_guest_updated",
      changes: { administrativeOverride: true }, ipAddress: actor.ipAddress,
    }, connection);
    return { id };
  });
}

async function editReservation(id, input, actor) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute("SELECT * FROM reservations WHERE id=? LIMIT 1 FOR UPDATE", [id]);
    const current = rows[0];
    if (!current) throw new AppError("RESERVATION_NOT_FOUND", "Reserva não encontrada.", 404);

    const guestId = positiveId(input.guestId ?? current.guest_id, "Hóspede");
    await ensureGuest(guestId, connection);
    const roomId = input.roomId === undefined ? current.room_id : nullableId(input.roomId, "Quarto");
    const checkIn = dateValue(input.checkIn ?? current.check_in_date, "Entrada");
    const checkOut = dateValue(input.checkOut ?? current.check_out_date, "Saída");
    const nights = nightsBetween(checkIn, checkOut);
    const adults = positive(input.adults ?? current.adults, "Adultos", { integer: true, min: 1, max: 30 });
    const children = positive(input.children ?? current.children, "Crianças", { integer: true, min: 0, max: 30 });
    const dailyRate = money(input.dailyRate ?? current.daily_rate, "Diária");
    const discount = money(input.discount ?? current.discount, "Desconto");
    const surcharge = money(input.surcharge ?? current.surcharge, "Acréscimo");
    const status = String(input.status ?? current.status);
    if (!reservationStatuses.has(status)) throw new AppError("VALIDATION_ERROR", "Situação da reserva inválida.");

    const [stayRows] = await connection.execute("SELECT id, status FROM stays WHERE reservation_id=? LIMIT 1 FOR UPDATE", [id]);
    const linkedStay = stayRows[0];
    if (linkedStay && !roomId) throw new AppError("ROOM_REQUIRED", "Uma reserva com hospedagem vinculada precisa possuir quarto.", 409);
    if (linkedStay && !["checked_in", "completed"].includes(status)) {
      throw new AppError("RESERVATION_HAS_STAY", "Esta reserva possui uma hospedagem vinculada. Para voltar a uma situação anterior, exclua a hospedagem primeiro.", 409);
    }
    if (linkedStay?.status === "completed" && status !== "completed") {
      throw new AppError("STAY_ALREADY_COMPLETED", "A hospedagem desta reserva já foi finalizada. Edite a hospedagem antes de alterar a situação da reserva.", 409);
    }

    const room = roomId ? await ensureRoomAvailableForReservation({ roomId, reservationId: id, checkIn, checkOut, people: adults + children, status }, connection) : null;
    if (!roomId && status === "checked_in") throw new AppError("ROOM_REQUIRED", "Uma reserva hospedada precisa possuir quarto.", 409);
    if (linkedStay && roomId && roomId !== current.room_id) {
      const [occupied] = await connection.execute("SELECT id FROM stays WHERE room_id=? AND id<>? AND status IN ('active','extended') LIMIT 1", [roomId, linkedStay.id]);
      if (occupied[0]) throw new AppError("ROOM_OCCUPIED", "O quarto escolhido possui outra hospedagem ativa.", 409);
    }

    const totalAmount = Math.max(0, Math.round((dailyRate * nights - discount + surcharge) * 100) / 100);
    await connection.execute(
      `UPDATE reservations SET guest_id=?, room_id=?, check_in_date=?, check_out_date=?, adults=?, children=?, nights=?, daily_rate=?,
       discount=?, surcharge=?, total_amount=?, source=?, status=?, notes=?, updated_by=?, cancelled_at=? WHERE id=?`,
      [
        guestId, roomId, checkIn, checkOut, adults, children, nights, dailyRate, discount, surcharge, totalAmount,
        text(input.source, "Origem", { max: 80 }), status, text(input.notes, "Observações", { max: 5000 }), actor.id,
        status === "cancelled" ? new Date() : null, id,
      ],
    );
    await connection.execute("DELETE FROM reservation_guests WHERE reservation_id=?", [id]);
    await connection.execute("INSERT INTO reservation_guests (reservation_id, guest_id, is_primary) VALUES (?, ?, TRUE)", [id, guestId]);

    if (linkedStay) {
      await connection.execute(
        `UPDATE stays SET guest_id=?, room_id=?, expected_checkout_date=?, status=?,
          check_out_at=IF(?='completed', COALESCE(check_out_at, NOW()), NULL),
          checkout_by=IF(?='completed', ?, NULL) WHERE id=?`,
        [guestId, roomId, checkOut, status === "completed" ? "completed" : linkedStay.status, status, status, actor.id, linkedStay.id],
      );
      await connection.execute("DELETE FROM stay_guests WHERE stay_id=?", [linkedStay.id]);
      await connection.execute("INSERT INTO stay_guests (stay_id, guest_id, is_primary) VALUES (?, ?, TRUE)", [linkedStay.id, guestId]);
    }

    if (current.room_id && current.room_id !== roomId) {
      await connection.execute("UPDATE rooms SET status='available' WHERE id=? AND status IN ('reserved','occupied')", [current.room_id]);
    }
    if (roomId) {
      if (status === "completed" && linkedStay) {
        await connection.execute("UPDATE rooms SET status='awaiting_cleaning' WHERE id=?", [roomId]);
        await connection.execute(
          `INSERT INTO cleaning_tasks (room_id, status, notes, created_by)
           SELECT ?, 'pending', 'Gerada por correção administrativa', ?
           WHERE NOT EXISTS (SELECT 1 FROM cleaning_tasks WHERE room_id=? AND status IN ('pending','in_progress'))`,
          [roomId, actor.id, roomId],
        );
      } else if (["cancelled", "no_show", "completed"].includes(status)) {
        await connection.execute("UPDATE rooms SET status=IF(status='reserved','available',status) WHERE id=?", [roomId]);
      } else if (linkedStay || status === "checked_in") {
        await connection.execute("UPDATE rooms SET status='occupied' WHERE id=?", [roomId]);
      } else if (room && ["pending", "confirmed", "awaiting_checkin"].includes(status)) {
        await connection.execute("UPDATE rooms SET status=IF(? <= CURDATE() AND ? > CURDATE() AND status='available','reserved',status) WHERE id=?", [checkIn, checkOut, roomId]);
      }
    }

    await connection.execute(
      `INSERT INTO reservation_history (reservation_id, action, from_status, to_status, description, metadata, created_by)
       VALUES (?, 'admin_updated', ?, ?, 'Reserva alterada por administrador', ?, ?)`,
      [id, current.status, status, JSON.stringify({ administrativeOverride: true, previousRoomId: current.room_id, roomId }), actor.id],
    );
    await auditRepository.log({
      userId: actor.id, entityType: "reservation", entityId: id, action: "admin_reservation_updated",
      changes: { fromStatus: current.status, toStatus: status, administrativeOverride: true }, ipAddress: actor.ipAddress,
    }, connection);
    return { id };
  });
}

async function editStay(id, input, actor) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute(
      `SELECT s.*, r.check_in_date, r.daily_rate, r.discount, r.surcharge, r.status AS reservation_status
       FROM stays s JOIN reservations r ON r.id=s.reservation_id WHERE s.id=? LIMIT 1 FOR UPDATE`,
      [id],
    );
    const current = rows[0];
    if (!current) throw new AppError("STAY_NOT_FOUND", "Hospedagem não encontrada.", 404);

    const guestId = positiveId(input.guestId ?? current.guest_id, "Hóspede");
    await ensureGuest(guestId, connection);
    const roomId = positiveId(input.roomId ?? current.room_id, "Quarto");
    const room = await ensureRoom(roomId, connection);
    const [occupied] = await connection.execute("SELECT id FROM stays WHERE room_id=? AND id<>? AND status IN ('active','extended') LIMIT 1", [roomId, id]);
    if (occupied[0]) throw new AppError("ROOM_OCCUPIED", `O quarto ${room.number} possui outra hospedagem ativa.`, 409);

    const checkInAt = dateTimeValue(input.checkInAt ?? current.check_in_at, "Check-in");
    const expectedCheckoutDate = dateValue(input.expectedCheckoutDate ?? current.expected_checkout_date, "Saída prevista");
    const checkInDate = checkInAt.slice(0, 10);
    const nights = nightsBetween(checkInDate, expectedCheckoutDate);
    const status = String(input.status ?? current.status);
    if (!stayStatuses.has(status)) throw new AppError("VALIDATION_ERROR", "Situação da hospedagem inválida.");
    const checkOutAt = status === "completed"
      ? dateTimeValue(input.checkOutAt || current.check_out_at || new Date().toISOString().slice(0, 19), "Check-out")
      : dateTimeValue(input.checkOutAt ?? current.check_out_at, "Check-out", { nullable: true });
    const totalAmount = Math.max(0, Math.round((Number(current.daily_rate) * nights - Number(current.discount) + Number(current.surcharge)) * 100) / 100);

    await connection.execute(
      `UPDATE stays SET guest_id=?, room_id=?, check_in_at=?, expected_checkout_date=?, check_out_at=?, status=?, checkout_by=? WHERE id=?`,
      [guestId, roomId, checkInAt, expectedCheckoutDate, checkOutAt, status, status === "completed" ? actor.id : null, id],
    );
    await connection.execute("DELETE FROM stay_guests WHERE stay_id=?", [id]);
    await connection.execute("INSERT INTO stay_guests (stay_id, guest_id, is_primary) VALUES (?, ?, TRUE)", [id, guestId]);
    await connection.execute("DELETE FROM reservation_guests WHERE reservation_id=?", [current.reservation_id]);
    await connection.execute("INSERT INTO reservation_guests (reservation_id, guest_id, is_primary) VALUES (?, ?, TRUE)", [current.reservation_id, guestId]);
    await connection.execute(
      `UPDATE reservations SET guest_id=?, room_id=?, check_in_date=?, check_out_date=?, nights=?, total_amount=?, status=?, updated_by=? WHERE id=?`,
      [guestId, roomId, checkInDate, expectedCheckoutDate, nights, totalAmount, status === "completed" ? "completed" : "checked_in", actor.id, current.reservation_id],
    );

    if (current.room_id !== roomId) await connection.execute("UPDATE rooms SET status='available' WHERE id=? AND status='occupied'", [current.room_id]);
    await connection.execute("UPDATE rooms SET status=? WHERE id=?", [status === "completed" ? "awaiting_cleaning" : "occupied", roomId]);
    if (status === "completed") {
      await connection.execute(
        `INSERT INTO cleaning_tasks (room_id, status, notes, created_by)
         SELECT ?, 'pending', 'Gerada por correção administrativa', ?
         WHERE NOT EXISTS (SELECT 1 FROM cleaning_tasks WHERE room_id=? AND status IN ('pending','in_progress'))`,
        [roomId, actor.id, roomId],
      );
    } else {
      await connection.execute("UPDATE cleaning_tasks SET status='cancelled' WHERE room_id=? AND status IN ('pending','in_progress')", [roomId]);
    }

    await connection.execute(
      `INSERT INTO reservation_history (reservation_id, action, description, metadata, created_by)
       VALUES (?, 'admin_stay_updated', 'Hospedagem alterada por administrador', ?, ?)`,
      [current.reservation_id, JSON.stringify({ stayId: id, administrativeOverride: true }), actor.id],
    );
    await auditRepository.log({
      userId: actor.id, entityType: "stay", entityId: id, action: "admin_stay_updated",
      changes: { status, roomId, administrativeOverride: true }, ipAddress: actor.ipAddress,
    }, connection);
    return { id };
  });
}

async function editPayment(id, input, actor) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute("SELECT * FROM payments WHERE id=? LIMIT 1 FOR UPDATE", [id]);
    const current = rows[0];
    if (!current) throw new AppError("PAYMENT_NOT_FOUND", "Pagamento não encontrado.", 404);
    const status = String(input.status ?? current.status);
    if (!paymentStatuses.has(status)) throw new AppError("VALIDATION_ERROR", "Situação do pagamento inválida.");
    const amount = positive(input.amount ?? current.amount, "Valor", { min: 0.01 });
    const method = text(input.paymentMethod ?? current.payment_method, "Forma de pagamento", { required: true, max: 80 });
    const paidAt = dateTimeValue(input.paidAt ?? current.paid_at, "Data do pagamento");
    const notes = text(input.notes ?? current.notes, "Observações", { max: 500 });
    await connection.execute("UPDATE payments SET amount=?, payment_method=?, paid_at=?, status=?, notes=? WHERE id=?", [amount, method, paidAt, status, notes, id]);
    await auditRepository.log({ userId: actor.id, entityType: "payment", entityId: id, action: "admin_payment_updated", changes: { status, amount }, ipAddress: actor.ipAddress }, connection);
    return { id };
  });
}

async function editCharge(id, input, actor) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute("SELECT * FROM charges WHERE id=? LIMIT 1 FOR UPDATE", [id]);
    const current = rows[0];
    if (!current) throw new AppError("CHARGE_NOT_FOUND", "Lançamento não encontrado.", 404);
    const quantity = positive(input.quantity ?? current.quantity, "Quantidade", { min: 0.01 });
    const unitPrice = money(input.unitPrice ?? current.unit_price, "Valor unitário");
    const description = text(input.description ?? current.description, "Descrição", { required: true, max: 190 });
    const chargedAt = dateTimeValue(input.chargedAt ?? current.charged_at, "Data do lançamento");
    const totalAmount = Math.round(quantity * unitPrice * 100) / 100;
    await connection.execute("UPDATE charges SET description=?, quantity=?, unit_price=?, total_amount=?, charged_at=? WHERE id=?", [description, quantity, unitPrice, totalAmount, chargedAt, id]);
    await auditRepository.log({ userId: actor.id, entityType: "charge", entityId: id, action: "admin_charge_updated", changes: { totalAmount }, ipAddress: actor.ipAddress }, connection);
    return { id };
  });
}

async function deleteUser(id, actor) {
  if (id === actor.id) throw new AppError("SELF_DELETE_NOT_ALLOWED", "Você não pode excluir o próprio usuário. Desative outro usuário ou use outra conta administradora.", 409);
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute("SELECT id, name, cpf FROM users WHERE id=? LIMIT 1 FOR UPDATE", [id]);
    const current = rows[0];
    if (!current) throw new AppError("USER_NOT_FOUND", "Usuário não encontrado.", 404);
    await auditRepository.log({ userId: actor.id, entityType: "user", entityId: id, action: "admin_user_delete_requested", changes: { name: current.name }, ipAddress: actor.ipAddress }, connection);
    try {
      await connection.execute("DELETE FROM users WHERE id=?", [id]);
    } catch (error) {
      if (["ER_ROW_IS_REFERENCED_2", "ER_ROW_IS_REFERENCED"].includes(error?.code)) {
        throw new AppError("USER_IN_USE", "Este usuário possui histórico operacional e não pode ser apagado. Desative-o para preservar a auditoria.", 409);
      }
      throw error;
    }
    return { id, deleted: true };
  });
}

async function deleteRoom(id, actor) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute("SELECT id, number FROM rooms WHERE id=? LIMIT 1 FOR UPDATE", [id]);
    const current = rows[0];
    if (!current) throw new AppError("ROOM_NOT_FOUND", "Quarto não encontrado.", 404);
    const [[links]] = await connection.execute(
      `SELECT
        (SELECT COUNT(*) FROM reservations WHERE room_id=?) +
        (SELECT COUNT(*) FROM stays WHERE room_id=?) +
        (SELECT COUNT(*) FROM room_blocks WHERE room_id=?) +
        (SELECT COUNT(*) FROM cleaning_tasks WHERE room_id=?) +
        (SELECT COUNT(*) FROM maintenance_records WHERE room_id=?) AS total`,
      [id, id, id, id, id],
    );
    if (Number(links.total) > 0) throw new AppError("ROOM_IN_USE", "Este quarto possui histórico, reservas, hospedagens, bloqueios ou tarefas vinculadas. Desative o quarto em vez de excluí-lo.", 409);
    await auditRepository.log({ userId: actor.id, entityType: "room", entityId: id, action: "admin_room_deleted", changes: { number: current.number }, ipAddress: actor.ipAddress }, connection);
    await connection.execute("DELETE FROM rooms WHERE id=?", [id]);
    return { id, deleted: true };
  });
}

async function deleteCategory(id, actor) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute("SELECT id, name FROM room_categories WHERE id=? LIMIT 1 FOR UPDATE", [id]);
    const current = rows[0];
    if (!current) throw new AppError("CATEGORY_NOT_FOUND", "Categoria não encontrada.", 404);
    const [[links]] = await connection.execute("SELECT COUNT(*) AS total FROM rooms WHERE room_category_id=?", [id]);
    if (Number(links.total) > 0) throw new AppError("CATEGORY_IN_USE", "Esta categoria possui quartos vinculados. Mova ou exclua os quartos antes de apagar a categoria.", 409);
    await auditRepository.log({ userId: actor.id, entityType: "room_category", entityId: id, action: "admin_category_deleted", changes: { name: current.name }, ipAddress: actor.ipAddress }, connection);
    await connection.execute("DELETE FROM room_categories WHERE id=?", [id]);
    return { id, deleted: true };
  });
}

async function deleteGuest(id, actor) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute("SELECT id, name FROM guests WHERE id=? LIMIT 1 FOR UPDATE", [id]);
    if (!rows[0]) throw new AppError("GUEST_NOT_FOUND", "Hóspede não encontrado.", 404);
    const [[links]] = await connection.execute(
      `SELECT
        (SELECT COUNT(*) FROM reservations WHERE guest_id=?) +
        (SELECT COUNT(*) FROM reservation_guests WHERE guest_id=?) +
        (SELECT COUNT(*) FROM stays WHERE guest_id=?) +
        (SELECT COUNT(*) FROM stay_guests WHERE guest_id=?) AS total`,
      [id, id, id, id],
    );
    if (Number(links.total) > 0) throw new AppError("GUEST_IN_USE", "Este hóspede possui reservas ou hospedagens vinculadas. Exclua esses registros primeiro.", 409);
    await auditRepository.log({ userId: actor.id, entityType: "guest", entityId: id, action: "admin_guest_deleted", changes: { name: rows[0].name }, ipAddress: actor.ipAddress }, connection);
    await connection.execute("DELETE FROM guests WHERE id=?", [id]);
    return { id, deleted: true };
  });
}

async function deleteReservation(id, actor) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute("SELECT * FROM reservations WHERE id=? LIMIT 1 FOR UPDATE", [id]);
    const current = rows[0];
    if (!current) throw new AppError("RESERVATION_NOT_FOUND", "Reserva não encontrada.", 404);
    const [[links]] = await connection.execute(
      `SELECT (SELECT COUNT(*) FROM stays WHERE reservation_id=?) AS stays,
              (SELECT COUNT(*) FROM payments WHERE reservation_id=?) AS payments`,
      [id, id],
    );
    if (Number(links.stays) > 0) throw new AppError("RESERVATION_HAS_STAY", "A reserva possui hospedagem vinculada. Exclua a hospedagem primeiro.", 409);
    if (Number(links.payments) > 0) throw new AppError("RESERVATION_HAS_PAYMENTS", "A reserva possui pagamentos vinculados. Exclua ou ajuste os pagamentos primeiro.", 409);
    await auditRepository.log({ userId: actor.id, entityType: "reservation", entityId: id, action: "admin_reservation_deleted", changes: { code: current.code }, ipAddress: actor.ipAddress }, connection);
    await connection.execute("DELETE FROM reservations WHERE id=?", [id]);
    if (current.room_id) await connection.execute("UPDATE rooms SET status='available' WHERE id=? AND status='reserved'", [current.room_id]);
    return { id, deleted: true };
  });
}

async function deleteStay(id, actor) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute("SELECT * FROM stays WHERE id=? LIMIT 1 FOR UPDATE", [id]);
    const current = rows[0];
    if (!current) throw new AppError("STAY_NOT_FOUND", "Hospedagem não encontrada.", 404);
    const [[links]] = await connection.execute(
      `SELECT (SELECT COUNT(*) FROM payments WHERE stay_id=?) AS payments,
              (SELECT COUNT(*) FROM charges WHERE stay_id=?) AS charges`,
      [id, id],
    );
    if (Number(links.payments) > 0) throw new AppError("STAY_HAS_PAYMENTS", "A hospedagem possui pagamentos vinculados. Exclua ou ajuste esses pagamentos primeiro.", 409);
    if (Number(links.charges) > 0) throw new AppError("STAY_HAS_CHARGES", "A hospedagem possui consumos/lançamentos vinculados. Exclua esses lançamentos primeiro.", 409);
    await connection.execute("DELETE FROM stays WHERE id=?", [id]);
    await connection.execute("UPDATE reservations SET status='confirmed', updated_by=? WHERE id=?", [actor.id, current.reservation_id]);
    await connection.execute("UPDATE rooms SET status='available' WHERE id=? AND status IN ('occupied','reserved','awaiting_cleaning','cleaning')", [current.room_id]);
    await connection.execute("UPDATE cleaning_tasks SET status='cancelled' WHERE room_id=? AND status IN ('pending','in_progress')", [current.room_id]);
    await connection.execute(
      `INSERT INTO reservation_history (reservation_id, action, description, metadata, created_by)
       VALUES (?, 'admin_stay_deleted', 'Hospedagem excluída por administrador', ?, ?)`,
      [current.reservation_id, JSON.stringify({ stayId: id, administrativeOverride: true }), actor.id],
    );
    await auditRepository.log({ userId: actor.id, entityType: "stay", entityId: id, action: "admin_stay_deleted", changes: { reservationId: current.reservation_id }, ipAddress: actor.ipAddress }, connection);
    return { id, deleted: true };
  });
}

async function deletePayment(id, actor) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute("SELECT * FROM payments WHERE id=? LIMIT 1 FOR UPDATE", [id]);
    const current = rows[0];
    if (!current) throw new AppError("PAYMENT_NOT_FOUND", "Pagamento não encontrado.", 404);
    await auditRepository.log({ userId: actor.id, entityType: "payment", entityId: id, action: "admin_payment_deleted", changes: { amount: current.amount, reservationId: current.reservation_id, stayId: current.stay_id }, ipAddress: actor.ipAddress }, connection);
    await connection.execute("DELETE FROM payments WHERE id=?", [id]);
    return { id, deleted: true };
  });
}

async function deleteCharge(id, actor) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute("SELECT * FROM charges WHERE id=? LIMIT 1 FOR UPDATE", [id]);
    const current = rows[0];
    if (!current) throw new AppError("CHARGE_NOT_FOUND", "Lançamento não encontrado.", 404);
    await auditRepository.log({ userId: actor.id, entityType: "charge", entityId: id, action: "admin_charge_deleted", changes: { stayId: current.stay_id, totalAmount: current.total_amount }, ipAddress: actor.ipAddress }, connection);
    await connection.execute("DELETE FROM charges WHERE id=?", [id]);
    return { id, deleted: true };
  });
}

async function cancelReservation(id, actor) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute("SELECT * FROM reservations WHERE id=? LIMIT 1 FOR UPDATE", [id]);
    const current = rows[0];
    if (!current) throw new AppError("RESERVATION_NOT_FOUND", "Reserva não encontrada.", 404);
    if (current.status === "completed") throw new AppError("RESERVATION_COMPLETED", "Uma reserva finalizada não pode ser cancelada. Use a edição administrativa se precisar corrigir o histórico.", 409);
    const [stays] = await connection.execute("SELECT id FROM stays WHERE reservation_id=? AND status IN ('active','extended') LIMIT 1", [id]);
    if (stays[0]) throw new AppError("RESERVATION_HAS_ACTIVE_STAY", "Esta reserva possui hospedagem ativa. Finalize ou exclua a hospedagem antes de cancelar.", 409);
    await connection.execute("UPDATE reservations SET status='cancelled', cancelled_at=NOW(), updated_by=? WHERE id=?", [actor.id, id]);
    if (current.room_id) await connection.execute("UPDATE rooms SET status='available' WHERE id=? AND status='reserved'", [current.room_id]);
    await connection.execute(
      `INSERT INTO reservation_history (reservation_id, action, from_status, to_status, description, metadata, created_by)
       VALUES (?, 'admin_cancelled', ?, 'cancelled', 'Reserva cancelada por administrador', ?, ?)`,
      [id, current.status, JSON.stringify({ administrativeOverride: true }), actor.id],
    );
    await auditRepository.log({ userId: actor.id, entityType: "reservation", entityId: id, action: "admin_reservation_cancelled", changes: { fromStatus: current.status }, ipAddress: actor.ipAddress }, connection);
    return { id, status: "cancelled" };
  });
}

export const adminMaintenanceService = {
  async edit(type, rawId, input, actor) {
    const id = positiveId(rawId, "Registro");
    switch (type) {
      case "guest": return editGuest(id, input, actor);
      case "reservation": return editReservation(id, input, actor);
      case "stay": return editStay(id, input, actor);
      case "payment": return editPayment(id, input, actor);
      case "charge": return editCharge(id, input, actor);
      default: throw new AppError("ADMIN_ENTITY_NOT_SUPPORTED", "Este tipo de registro ainda não possui edição administrativa.", 404);
    }
  },

  async remove(type, rawId, actor) {
    const id = positiveId(rawId, "Registro");
    switch (type) {
      case "user": return deleteUser(id, actor);
      case "room": return deleteRoom(id, actor);
      case "category": return deleteCategory(id, actor);
      case "guest": return deleteGuest(id, actor);
      case "reservation": return deleteReservation(id, actor);
      case "stay": return deleteStay(id, actor);
      case "payment": return deletePayment(id, actor);
      case "charge": return deleteCharge(id, actor);
      default: throw new AppError("ADMIN_ENTITY_NOT_SUPPORTED", "Este tipo de registro ainda não pode ser excluído administrativamente.", 404);
    }
  },

  async cancelReservation(rawId, actor) {
    return cancelReservation(positiveId(rawId, "Reserva"), actor);
  },
};