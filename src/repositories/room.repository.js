import { getPool } from "../database/pool.js";
import { toSqlDate } from "../utils/dates.js";

const roomSelect = `
  SELECT rm.id, rm.number, rm.floor, rm.capacity, rm.beds,
    CASE WHEN rm.status='available' AND nr.check_in_date=? THEN 'reserved' ELSE rm.status END AS status,
    rm.notes, rm.active,
    rc.id AS category_id, rc.name AS category_name, rc.slug AS category_slug, rc.base_rate,
    s.id AS current_stay_id, g.id AS current_guest_id, g.name AS current_guest_name,
    nr.id AS next_reservation_id, nr.code AS next_reservation_code,
    nr.check_in_date AS next_check_in, nr.check_out_date AS next_check_out,
    (SELECT MAX(s2.check_out_at) FROM stays s2 WHERE s2.room_id=rm.id AND s2.status='completed') AS last_check_out_at,
    ct.id AS cleaning_task_id, ct.status AS cleaning_status, ct.started_at AS cleaning_started_at,
    mr.id AS maintenance_id, mr.description AS maintenance_description, mr.priority AS maintenance_priority
  FROM rooms rm
  JOIN room_categories rc ON rc.id = rm.room_category_id
  LEFT JOIN stays s ON s.room_id = rm.id AND s.status IN ('active','extended')
  LEFT JOIN guests g ON g.id = s.guest_id
  LEFT JOIN reservations nr ON nr.id = (
    SELECT r2.id FROM reservations r2
    WHERE r2.room_id = rm.id AND r2.check_in_date >= ?
      AND r2.status IN ('pending','confirmed','awaiting_checkin')
    ORDER BY r2.check_in_date, r2.id LIMIT 1
  )
  LEFT JOIN cleaning_tasks ct ON ct.id = (
    SELECT c2.id FROM cleaning_tasks c2 WHERE c2.room_id = rm.id AND c2.status IN ('pending','in_progress')
    ORDER BY c2.id DESC LIMIT 1
  )
  LEFT JOIN maintenance_records mr ON mr.id = (
    SELECT m2.id FROM maintenance_records m2 WHERE m2.room_id = rm.id AND m2.status IN ('open','in_progress')
    ORDER BY m2.id DESC LIMIT 1
  )
`;

export const roomRepository = {
  async list({ status, q }) {
    const clauses = ["rm.active = TRUE"];
    const today = toSqlDate();
    const params = [today, today];
    if (status) {
      clauses.push("CASE WHEN rm.status='available' AND nr.check_in_date=? THEN 'reserved' ELSE rm.status END = ?");
      params.push(today, status);
    }
    if (q) {
      clauses.push("(rm.number LIKE ? OR rc.name LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }
    const [rows] = await getPool().execute(
      `${roomSelect} WHERE ${clauses.join(" AND ")} ORDER BY rm.floor, rm.number`,
      params,
    );
    return rows;
  },

  async findById(id, connection = getPool(), { forUpdate = false } = {}) {
    if (forUpdate) await connection.execute("SELECT id FROM rooms WHERE id=? FOR UPDATE", [id]);
    const [rows] = await connection.execute(
      `${roomSelect} WHERE rm.id = ? LIMIT 1`,
      [toSqlDate(), toSqlDate(), id],
    );
    return rows[0] || null;
  },

  async history(id) {
    const [cleaning] = await getPool().execute(
      `SELECT 'cleaning' AS type, id, status, started_at AS event_at, completed_at, notes, employee_name AS responsible
       FROM cleaning_tasks WHERE room_id = ? ORDER BY id DESC LIMIT 20`,
      [id],
    );
    const [maintenance] = await getPool().execute(
      `SELECT 'maintenance' AS type, id, status, started_at AS event_at, completed_at, description, responsible, priority
       FROM maintenance_records WHERE room_id = ? ORDER BY id DESC LIMIT 20`,
      [id],
    );
    return [...cleaning, ...maintenance].sort((a, b) => String(b.event_at).localeCompare(String(a.event_at))).slice(0, 30);
  },

  async updateStatus(id, status, connection = getPool()) {
    await connection.execute("UPDATE rooms SET status = ? WHERE id = ?", [status, id]);
  },

  async createCleaningTask({ roomId, status = "pending", employeeName = null, notes = null, userId }, connection = getPool()) {
    const startedAt = status === "in_progress" ? new Date() : null;
    const [result] = await connection.execute(
      `INSERT INTO cleaning_tasks (room_id, status, employee_name, started_at, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [roomId, status, employeeName, startedAt, notes, userId],
    );
    return result.insertId;
  },

  async startCleaning(taskId, { employeeName, notes }, connection = getPool()) {
    await connection.execute(
      `UPDATE cleaning_tasks SET status='in_progress', employee_name=?, notes=?, started_at=NOW()
       WHERE id=? AND status='pending'`,
      [employeeName, notes, taskId],
    );
  },

  async completeCleaning(taskId, { notes }, connection = getPool()) {
    await connection.execute(
      `UPDATE cleaning_tasks SET status='completed', notes=COALESCE(?, notes), completed_at=NOW()
       WHERE id=? AND status='in_progress'`,
      [notes, taskId],
    );
  },

  async createMaintenance(data, connection = getPool()) {
    const [result] = await connection.execute(
      `INSERT INTO maintenance_records
        (room_id, type, description, priority, status, expected_at, responsible, notes, created_by)
       VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
      [data.roomId, data.type, data.description, data.priority, data.expectedAt, data.responsible, data.notes, data.userId],
    );
    return result.insertId;
  },

  async completeMaintenance(id, userId, notes, connection = getPool()) {
    await connection.execute(
      `UPDATE maintenance_records SET status='completed', completed_at=NOW(), completed_by=?, notes=COALESCE(?, notes)
       WHERE id=? AND status IN ('open','in_progress')`,
      [userId, notes, id],
    );
  },

  async createBlock(roomId, reason, userId, connection = getPool()) {
    const [result] = await connection.execute(
      `INSERT INTO room_blocks (room_id, start_date, end_date, reason, created_by)
       VALUES (?, ?, '9999-12-31', ?, ?)`,
      [roomId, toSqlDate(), reason, userId],
    );
    return result.insertId;
  },

  async releaseBlock(roomId, userId, connection = getPool()) {
    await connection.execute(
      `UPDATE room_blocks SET status='released', released_by=?, released_at=NOW()
       WHERE room_id=? AND status='active'`,
      [userId, roomId],
    );
  },

  async listCleaning({ status = null }) {
    const params = [];
    const where = status ? "WHERE ct.status = ?" : "";
    if (status) params.push(status);
    const [rows] = await getPool().execute(
      `SELECT ct.*, rm.number AS room_number, rc.name AS category_name
       FROM cleaning_tasks ct JOIN rooms rm ON rm.id=ct.room_id
       JOIN room_categories rc ON rc.id=rm.room_category_id
       ${where} ORDER BY FIELD(ct.status,'in_progress','pending','completed'), ct.id DESC LIMIT 100`,
      params,
    );
    return rows;
  },

  async listMaintenance({ status = null }) {
    const params = [];
    const where = status ? "WHERE mr.status = ?" : "";
    if (status) params.push(status);
    const [rows] = await getPool().execute(
      `SELECT mr.*, rm.number AS room_number, rc.name AS category_name
       FROM maintenance_records mr JOIN rooms rm ON rm.id=mr.room_id
       JOIN room_categories rc ON rc.id=rm.room_category_id
       ${where} ORDER BY FIELD(mr.priority,'urgent','high','normal','low'), mr.id DESC LIMIT 100`,
      params,
    );
    return rows;
  },
};
