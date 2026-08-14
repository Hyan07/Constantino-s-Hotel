import { getPool } from "../database/pool.js";

export const guestRepository = {
  async list({ q, pageSize, offset }) {
    const term = `%${q || ""}%`;
    const digits = String(q || "").replace(/\D/g, "");
    const cpfTerm = `%${digits || q || ""}%`;
    const where = q
      ? "WHERE g.active = TRUE AND (g.name LIKE ? OR g.cpf LIKE ? OR g.phone LIKE ? OR g.email LIKE ?)"
      : "WHERE g.active = TRUE";
    const params = q ? [term, cpfTerm, term, term] : [];
    const [[count]] = await getPool().execute(`SELECT COUNT(*) AS total FROM guests g ${where}`, params);
    const [rows] = await getPool().execute(
      `SELECT g.id, g.name, g.cpf, g.phone, g.email,
        MAX(r.check_in_date) AS last_stay,
        COUNT(DISTINCT r.id) AS reservation_count,
        COALESCE(SUM(CASE WHEN r.status IN ('checked_in','completed') THEN r.nights ELSE 0 END), 0) AS total_nights
       FROM guests g
       LEFT JOIN reservations r ON r.guest_id = g.id
       ${where}
       GROUP BY g.id
       ORDER BY g.name
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    return { rows, total: Number(count.total) };
  },

  async findById(id, connection = getPool()) {
    const [rows] = await connection.execute(
      `SELECT g.*,
        COUNT(DISTINCT s.id) AS stay_count,
        COALESCE(SUM(CASE WHEN r.status IN ('checked_in','completed') THEN r.nights ELSE 0 END), 0) AS total_nights,
        MAX(s.check_in_at) AS last_stay
       FROM guests g
       LEFT JOIN reservations r ON r.guest_id = g.id
       LEFT JOIN stays s ON s.reservation_id = r.id
       WHERE g.id = ?
       GROUP BY g.id
       LIMIT 1`,
      [id],
    );
    return rows[0] || null;
  },

  async findByCpf(cpf, connection = getPool()) {
    const [rows] = await connection.execute("SELECT * FROM guests WHERE cpf = ? LIMIT 1", [cpf]);
    return rows[0] || null;
  },

  async history(id) {
    const [rows] = await getPool().execute(
      `SELECT r.id, r.code, r.check_in_date, r.check_out_date, r.nights, r.status,
        r.total_amount, rm.number AS room_number, rc.name AS category_name
       FROM reservations r
       LEFT JOIN rooms rm ON rm.id = r.room_id
       LEFT JOIN room_categories rc ON rc.id = rm.room_category_id
       WHERE r.guest_id = ?
       ORDER BY r.check_in_date DESC, r.id DESC
       LIMIT 100`,
      [id],
    );
    return rows;
  },

  async create(data, connection = getPool()) {
    const [result] = await connection.execute(
      "INSERT INTO guests (name, cpf, phone, email) VALUES (?, ?, ?, ?)",
      [data.name, data.cpf, data.phone, data.email],
    );
    return result.insertId;
  },

  async update(id, data, connection = getPool()) {
    await connection.execute(
      "UPDATE guests SET name=?, cpf=?, phone=?, email=? WHERE id=?",
      [data.name, data.cpf, data.phone, data.email, id],
    );
  },
};
