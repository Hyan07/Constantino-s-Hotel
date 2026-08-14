import { getPool } from "../database/pool.js";

export const paymentRepository = {
  async create(data, connection = getPool()) {
    const [result] = await connection.execute(
      `INSERT INTO payments (reservation_id, stay_id, amount, payment_method, paid_at, status, notes, created_by)
       VALUES (?, ?, ?, ?, COALESCE(?, NOW()), 'confirmed', ?, ?)`,
      [data.reservationId, data.stayId, data.amount, data.paymentMethod, data.paidAt, data.notes, data.userId],
    );
    return result.insertId;
  },

  async findById(id, connection = getPool()) {
    const [rows] = await connection.execute("SELECT * FROM payments WHERE id=? LIMIT 1", [id]);
    return rows[0] || null;
  },

  async list({ reservationId = null, stayId = null }) {
    const clauses = [];
    const params = [];
    if (reservationId) { clauses.push("p.reservation_id=?"); params.push(reservationId); }
    if (stayId) { clauses.push("p.stay_id=?"); params.push(stayId); }
    const where = clauses.length ? `WHERE ${clauses.join(" OR ")}` : "";
    const [rows] = await getPool().execute(
      `SELECT p.*, u.name AS user_name, r.code AS reservation_code, s.room_id
       FROM payments p JOIN users u ON u.id=p.created_by
       LEFT JOIN reservations r ON r.id=p.reservation_id LEFT JOIN stays s ON s.id=p.stay_id
       ${where} ORDER BY p.paid_at DESC LIMIT 100`,
      params,
    );
    return rows;
  },
};
