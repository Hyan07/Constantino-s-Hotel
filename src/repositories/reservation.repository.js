import { getPool } from "../database/pool.js";

const activeReservationStatuses = "'pending','confirmed','awaiting_checkin','checked_in'";

export const reservationRepository = {
  async list(filters) {
    const clauses = ["1=1"];
    const params = [];
    if (filters.q) {
      const term = `%${filters.q}%`;
      const digits = filters.q.replace(/\D/g, "");
      clauses.push("(g.name LIKE ? OR g.cpf LIKE ? OR r.code LIKE ? OR rm.number LIKE ?)");
      params.push(term, `%${digits || filters.q}%`, term, term);
    }
    if (filters.status) {
      clauses.push("r.status = ?");
      params.push(filters.status);
    }
    if (filters.roomId) {
      clauses.push("r.room_id = ?");
      params.push(filters.roomId);
    }
    if (filters.categoryId) {
      clauses.push("rc.id = ?");
      params.push(filters.categoryId);
    }
    if (filters.from) {
      clauses.push("r.check_out_date > ?");
      params.push(filters.from);
    }
    if (filters.to) {
      clauses.push("r.check_in_date < ?");
      params.push(filters.to);
    }
    if (filters.withoutRoom) clauses.push("r.room_id IS NULL");
    if (filters.tab === "today") { clauses.push("? >= r.check_in_date AND ? < r.check_out_date"); params.push(filters.today, filters.today); }
    if (filters.tab === "upcoming") { clauses.push("r.check_in_date > ? AND r.status IN ('pending','confirmed','awaiting_checkin')"); params.push(filters.today); }
    if (filters.tab === "checked_in") clauses.push("r.status = 'checked_in'");
    if (filters.tab === "completed") clauses.push("r.status = 'completed'");
    if (filters.tab === "cancelled") clauses.push("r.status = 'cancelled'");
    const where = clauses.join(" AND ");
    const [[count]] = await getPool().execute(
      `SELECT COUNT(*) AS total FROM reservations r
       JOIN guests g ON g.id=r.guest_id
       LEFT JOIN rooms rm ON rm.id=r.room_id
       LEFT JOIN room_categories rc ON rc.id=rm.room_category_id
       WHERE ${where}`,
      params,
    );
    const [rows] = await getPool().execute(
      `SELECT r.*, g.name AS guest_name, g.cpf AS guest_cpf, g.phone AS guest_phone,
        rm.number AS room_number, rc.name AS category_name,
        COALESCE(SUM(CASE WHEN p.status='confirmed' THEN p.amount ELSE 0 END),0) AS paid_amount
       FROM reservations r
       JOIN guests g ON g.id=r.guest_id
       LEFT JOIN rooms rm ON rm.id=r.room_id
       LEFT JOIN room_categories rc ON rc.id=rm.room_category_id
       LEFT JOIN payments p ON p.reservation_id=r.id
       WHERE ${where}
       GROUP BY r.id
       ORDER BY r.check_in_date DESC, r.id DESC
       LIMIT ? OFFSET ?`,
      [...params, filters.pageSize, filters.offset],
    );
    return { rows, total: Number(count.total) };
  },

  async findById(id, connection = getPool(), { forUpdate = false } = {}) {
    if (forUpdate) await connection.execute("SELECT id FROM reservations WHERE id=? FOR UPDATE", [id]);
    const [rows] = await connection.execute(
      `SELECT r.*, g.name AS guest_name, g.cpf AS guest_cpf, g.phone AS guest_phone, g.email AS guest_email,
        rm.number AS room_number, rm.status AS room_status, rm.capacity AS room_capacity,
        rc.name AS category_name, rc.base_rate,
        COALESCE(SUM(CASE WHEN p.status='confirmed' THEN p.amount ELSE 0 END),0) AS paid_amount
       FROM reservations r
       JOIN guests g ON g.id=r.guest_id
       LEFT JOIN rooms rm ON rm.id=r.room_id
       LEFT JOIN room_categories rc ON rc.id=rm.room_category_id
       LEFT JOIN payments p ON p.reservation_id=r.id
       WHERE r.id=? GROUP BY r.id LIMIT 1`,
      [id],
    );
    return rows[0] || null;
  },

  async history(id, connection = getPool()) {
    const [rows] = await connection.execute(
      `SELECT rh.*, u.name AS user_name FROM reservation_history rh
       JOIN users u ON u.id=rh.created_by
       WHERE rh.reservation_id=? ORDER BY rh.created_at DESC, rh.id DESC`,
      [id],
    );
    return rows;
  },

  async payments(id, connection = getPool()) {
    const [rows] = await connection.execute(
      `SELECT p.*, u.name AS user_name FROM payments p JOIN users u ON u.id=p.created_by
       WHERE p.reservation_id=? ORDER BY p.paid_at DESC, p.id DESC`,
      [id],
    );
    return rows;
  },

  async lockRoom(roomId, connection) {
    const [rows] = await connection.execute(
      `SELECT rm.*, rc.name AS category_name, rc.base_rate, rc.active AS category_active
       FROM rooms rm JOIN room_categories rc ON rc.id=rm.room_category_id
       WHERE rm.id=? LIMIT 1 FOR UPDATE`,
      [roomId],
    );
    return rows[0] || null;
  },

  async findConflict({ roomId, checkIn, checkOut, excludeReservationId = null }, connection) {
    const params = [roomId, checkOut, checkIn];
    let exclusion = "";
    if (excludeReservationId) {
      exclusion = "AND r.id <> ?";
      params.push(excludeReservationId);
    }
    const [rows] = await connection.execute(
      `SELECT r.id, r.code, r.check_in_date, r.check_out_date, g.name AS guest_name
       FROM reservations r JOIN guests g ON g.id=r.guest_id
       WHERE r.room_id=? AND r.check_in_date < ? AND r.check_out_date > ?
         AND r.status IN (${activeReservationStatuses}) ${exclusion}
       ORDER BY r.check_in_date LIMIT 1`,
      params,
    );
    return rows[0] || null;
  },

  async findBlockConflict({ roomId, checkIn, checkOut }, connection) {
    const [rows] = await connection.execute(
      `SELECT id, reason, start_date, end_date FROM room_blocks
       WHERE room_id=? AND status='active' AND start_date < ? AND end_date > ? LIMIT 1`,
      [roomId, checkOut, checkIn],
    );
    return rows[0] || null;
  },

  async availableRooms({ checkIn, checkOut, people, categoryId = null, excludeReservationId = null }) {
    const params = [people, checkOut, checkIn, excludeReservationId, excludeReservationId, checkOut, checkIn];
    let categoryClause = "";
    if (categoryId) {
      categoryClause = "AND rc.id=?";
      params.push(categoryId);
    }
    const [rows] = await getPool().execute(
      `SELECT rm.id, rm.number, rm.floor, rm.capacity, rm.beds, rm.status,
        rc.id AS category_id, rc.name AS category_name, rc.base_rate
       FROM rooms rm JOIN room_categories rc ON rc.id=rm.room_category_id
       WHERE rm.active=TRUE AND rc.active=TRUE AND rm.capacity >= ?
         AND rm.status NOT IN ('maintenance','blocked')
         AND NOT EXISTS (
           SELECT 1 FROM reservations r WHERE r.room_id=rm.id
             AND r.check_in_date < ? AND r.check_out_date > ?
             AND (? IS NULL OR r.id <> ?)
             AND r.status IN (${activeReservationStatuses})
         )
         AND NOT EXISTS (
           SELECT 1 FROM room_blocks rb WHERE rb.room_id=rm.id AND rb.status='active'
             AND rb.start_date < ? AND rb.end_date > ?
         )
         ${categoryClause}
       ORDER BY rc.base_rate, rm.number`,
      params,
    );
    return rows;
  },

  async insert(data, connection) {
    const [result] = await connection.execute(
      `INSERT INTO reservations
        (code, guest_id, room_id, check_in_date, check_out_date, adults, children, nights,
         daily_rate, discount, surcharge, total_amount, source, status, notes, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.code, data.guestId, data.roomId, data.checkIn, data.checkOut, data.adults, data.children,
        data.nights, data.dailyRate, data.discount, data.surcharge, data.totalAmount, data.source,
        data.status, data.notes, data.userId, data.userId,
      ],
    );
    return result.insertId;
  },

  async setPrimaryGuest(reservationId, guestId, connection) {
    await connection.execute("DELETE FROM reservation_guests WHERE reservation_id=?", [reservationId]);
    await connection.execute(
      "INSERT INTO reservation_guests (reservation_id, guest_id, is_primary) VALUES (?, ?, TRUE)",
      [reservationId, guestId],
    );
  },

  async update(id, data, connection) {
    await connection.execute(
      `UPDATE reservations SET guest_id=?, room_id=?, check_in_date=?, check_out_date=?, adults=?, children=?, nights=?,
        daily_rate=?, discount=?, surcharge=?, total_amount=?, source=?, status=?, notes=?, updated_by=? WHERE id=?`,
      [
        data.guestId, data.roomId, data.checkIn, data.checkOut, data.adults, data.children, data.nights,
        data.dailyRate, data.discount, data.surcharge, data.totalAmount, data.source, data.status, data.notes,
        data.userId, id,
      ],
    );
  },

  async updateStatus(id, status, userId, connection) {
    await connection.execute(
      `UPDATE reservations SET status=?, updated_by=?, cancelled_at=CASE WHEN ?='cancelled' THEN NOW() ELSE cancelled_at END WHERE id=?`,
      [status, userId, status, id],
    );
  },

  async addHistory(data, connection) {
    await connection.execute(
      `INSERT INTO reservation_history
        (reservation_id, action, from_status, to_status, description, metadata, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.reservationId, data.action, data.fromStatus || null, data.toStatus || null,
        data.description, data.metadata ? JSON.stringify(data.metadata) : null, data.userId,
      ],
    );
  },

  async calendar({ from, to }) {
    const [rooms] = await getPool().query(
      `SELECT rm.id, rm.number, rm.floor, rm.capacity, rm.status,
        rc.id AS category_id, rc.name AS category_name, rc.slug AS category_slug, rc.base_rate
       FROM rooms rm JOIN room_categories rc ON rc.id=rm.room_category_id
       WHERE rm.active=TRUE AND rc.active=TRUE ORDER BY rc.base_rate, rm.number`,
    );
    const [reservations] = await getPool().execute(
      `SELECT r.id, r.code, r.room_id, r.check_in_date, r.check_out_date, r.status,
        r.adults, r.children, g.name AS guest_name, rm.number AS room_number
       FROM reservations r JOIN guests g ON g.id=r.guest_id
       LEFT JOIN rooms rm ON rm.id=r.room_id
       WHERE r.check_in_date < ? AND r.check_out_date > ? AND r.status <> 'cancelled'
       ORDER BY r.check_in_date, r.id`,
      [to, from],
    );
    return { rooms, reservations };
  },
};
