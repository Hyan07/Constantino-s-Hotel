import { getPool } from "../database/pool.js";

const staySelect = `
  SELECT s.*, r.code AS reservation_code, r.total_amount AS lodging_amount, r.status AS reservation_status,
    r.check_in_date, r.check_out_date, r.adults, r.children, r.nights, r.daily_rate, r.discount, r.surcharge,
    g.name AS guest_name, g.cpf AS guest_cpf, g.phone AS guest_phone, g.email AS guest_email,
    g.postal_code AS guest_postal_code, g.street AS guest_street, g.street_number AS guest_street_number,
    g.complement AS guest_complement, g.neighborhood AS guest_neighborhood, g.city AS guest_city, g.state AS guest_state,
    rm.number AS room_number, rm.status AS room_status, rc.name AS category_name,
    checkin_user.name AS checkin_operator_name, checkout_user.name AS checkout_operator_name,
    COALESCE((SELECT SUM(c.total_amount) FROM charges c WHERE c.stay_id=s.id),0) AS charges_amount,
    COALESCE((SELECT SUM(p.amount) FROM payments p
      WHERE p.status='confirmed' AND (p.stay_id=s.id OR p.reservation_id=s.reservation_id)),0) AS paid_amount
  FROM stays s
  JOIN reservations r ON r.id=s.reservation_id
  JOIN guests g ON g.id=s.guest_id
  JOIN rooms rm ON rm.id=s.room_id
  JOIN room_categories rc ON rc.id=rm.room_category_id
  LEFT JOIN users checkin_user ON checkin_user.id=s.created_by
  LEFT JOIN users checkout_user ON checkout_user.id=s.checkout_by
`;

export const stayRepository = {
  async list({ tab, q, today }) {
    const clauses = [tab === "completed" ? "s.status='completed'" : "s.status IN ('active','extended')"];
    const params = [];
    if (tab === "departures") { clauses.push("s.expected_checkout_date=?"); params.push(today); }
    if (tab === "extended") clauses.push("s.status='extended'");
    if (q) {
      clauses.push("(g.name LIKE ? OR g.cpf LIKE ? OR rm.number LIKE ? OR r.code LIKE ?)");
      const term = `%${q}%`;
      params.push(term, term, term, term);
    }
    const order = tab === "completed" ? "s.check_out_at DESC, s.id DESC" : "s.expected_checkout_date, rm.number";
    const [rows] = await getPool().execute(
      `${staySelect} WHERE ${clauses.join(" AND ")} ORDER BY ${order}`,
      params,
    );
    return rows;
  },

  async findById(id, connection = getPool(), { forUpdate = false } = {}) {
    if (forUpdate) await connection.execute("SELECT id FROM stays WHERE id=? FOR UPDATE", [id]);
    const [rows] = await connection.execute(`${staySelect} WHERE s.id=? LIMIT 1`, [id]);
    return rows[0] || null;
  },

  async findActiveByRoom(roomId, connection = getPool()) {
    const [rows] = await connection.execute(
      "SELECT id FROM stays WHERE room_id=? AND status IN ('active','extended') LIMIT 1 FOR UPDATE",
      [roomId],
    );
    return rows[0] || null;
  },

  async create(data, connection) {
    const [result] = await connection.execute(
      `INSERT INTO stays (reservation_id, guest_id, room_id, check_in_at, expected_checkout_date, created_by)
       VALUES (?, ?, ?, NOW(), ?, ?)`,
      [data.reservationId, data.guestId, data.roomId, data.expectedCheckoutDate, data.userId],
    );
    await connection.execute(
      `INSERT INTO stay_guests (stay_id, guest_id, is_primary)
       SELECT ?, rg.guest_id, rg.is_primary FROM reservation_guests rg WHERE rg.reservation_id=?`,
      [result.insertId, data.reservationId],
    );
    await connection.execute(
      `INSERT IGNORE INTO stay_guests (stay_id, guest_id, is_primary) VALUES (?, ?, TRUE)`,
      [result.insertId, data.guestId],
    );
    return result.insertId;
  },

  async complete(id, userId, connection) {
    await connection.execute(
      "UPDATE stays SET status='completed', check_out_at=NOW(), checkout_by=? WHERE id=?",
      [userId, id],
    );
  },

  async extend(id, newCheckoutDate, connection) {
    await connection.execute(
      "UPDATE stays SET expected_checkout_date=?, status='extended' WHERE id=?",
      [newCheckoutDate, id],
    );
  },

  async addCharge(data, connection = getPool()) {
    const [result] = await connection.execute(
      `INSERT INTO charges (stay_id, description, quantity, unit_price, total_amount, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.stayId, data.description, data.quantity, data.unitPrice, data.totalAmount, data.userId],
    );
    return result.insertId;
  },

  async charges(stayId) {
    const [rows] = await getPool().execute(
      `SELECT c.*, u.name AS user_name FROM charges c JOIN users u ON u.id=c.created_by
       WHERE c.stay_id=? ORDER BY c.charged_at DESC, c.id DESC`,
      [stayId],
    );
    return rows;
  },

  async payments(stay) {
    const [rows] = await getPool().execute(
      `SELECT p.*, u.name AS user_name FROM payments p JOIN users u ON u.id=p.created_by
       WHERE p.stay_id=? OR p.reservation_id=? ORDER BY p.paid_at DESC, p.id DESC`,
      [stay.id, stay.reservation_id],
    );
    return rows;
  },

  async updateReservationDatesAndAmount(reservationId, newCheckout, nights, totalAmount, userId, connection) {
    await connection.execute(
      `UPDATE reservations SET check_out_date=?, nights=?, total_amount=?, updated_by=? WHERE id=?`,
      [newCheckout, nights, totalAmount, userId, reservationId],
    );
  },
};
