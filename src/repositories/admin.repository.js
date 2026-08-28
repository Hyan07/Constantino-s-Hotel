import { getPool } from "../database/pool.js";

export const adminRepository = {
  async listRooms() {
    const [rows] = await getPool().query(
      `SELECT rm.id, rm.number, rm.floor, rm.capacity, rm.beds, rm.status, rm.notes, rm.active,
        rc.id AS category_id, rc.name AS category_name, rc.active AS category_active
       FROM rooms rm JOIN room_categories rc ON rc.id=rm.room_category_id
       ORDER BY rm.floor, rm.number`,
    );
    return rows;
  },

  async listUsers() {
    const [rows] = await getPool().query(
      `SELECT u.id, u.name, u.cpf, u.email, u.active, u.last_login_at, u.created_at,
        GROUP_CONCAT(DISTINCT r.slug ORDER BY r.slug SEPARATOR ',') AS roles,
        GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ', ') AS role_names
       FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id
       GROUP BY u.id ORDER BY u.name`,
    );
    return rows;
  },

  async listRoles() {
    const [rows] = await getPool().query("SELECT id, name, slug, description FROM roles WHERE active=TRUE ORDER BY name");
    return rows;
  },

  async findRoleBySlug(slug, connection = getPool()) {
    const [rows] = await connection.execute("SELECT * FROM roles WHERE slug=? AND active=TRUE LIMIT 1", [slug]);
    return rows[0] || null;
  },

  async createUser(data, connection) {
    const [result] = await connection.execute(
      "INSERT INTO users (name, cpf, email, password_hash, active) VALUES (?, ?, ?, ?, TRUE)",
      [data.name, data.cpf, data.email, data.passwordHash],
    );
    await connection.execute("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [result.insertId, data.roleId]);
    return result.insertId;
  },

  async updateUser(id, data, connection) {
    await connection.execute("UPDATE users SET name=?, email=?, active=? WHERE id=?", [data.name, data.email, data.active, id]);
    await connection.execute("DELETE FROM user_roles WHERE user_id=?", [id]);
    await connection.execute("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [id, data.roleId]);
  },

  async listCategories({ includeInactive = true } = {}) {
    const [rows] = await getPool().query(
      `SELECT rc.*, COUNT(rm.id) AS room_count FROM room_categories rc
       LEFT JOIN rooms rm ON rm.room_category_id=rc.id
       ${includeInactive ? "" : "WHERE rc.active=TRUE"}
       GROUP BY rc.id ORDER BY rc.base_rate, rc.name`,
    );
    return rows;
  },

  async findCategoryById(id, connection = getPool()) {
    const [rows] = await connection.execute("SELECT * FROM room_categories WHERE id=? LIMIT 1", [id]);
    return rows[0] || null;
  },

  async countActiveRoomsByCategory(id, connection = getPool()) {
    const [[row]] = await connection.execute("SELECT COUNT(*) AS total FROM rooms WHERE room_category_id=? AND active=TRUE", [id]);
    return Number(row.total);
  },

  async createCategory(data, connection) {
    const [result] = await connection.execute(
      `INSERT INTO room_categories (name, slug, capacity, base_rate, description, active) VALUES (?, ?, ?, ?, ?, ?)`,
      [data.name, data.slug, data.capacity, data.baseRate, data.description, data.active],
    );
    return result.insertId;
  },

  async updateCategory(id, data, connection) {
    await connection.execute(
      `UPDATE room_categories SET name=?, slug=?, capacity=?, base_rate=?, description=?, active=? WHERE id=?`,
      [data.name, data.slug, data.capacity, data.baseRate, data.description, data.active, id],
    );
  },

  async listSettings() {
    const [rows] = await getPool().query("SELECT setting_key, setting_value, updated_at FROM settings ORDER BY setting_key");
    return Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
  },

  async setSetting(key, value, userId, connection) {
    await connection.execute(
      `INSERT INTO settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value), updated_by=VALUES(updated_by)`,
      [key, JSON.stringify(value), userId],
    );
  },

  async listAudit({ q, pageSize, offset }) {
    const params = [];
    const where = q ? "WHERE al.action LIKE ? OR al.entity_type LIKE ? OR u.name LIKE ?" : "";
    if (q) params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    const [[count]] = await getPool().execute(
      `SELECT COUNT(*) AS total FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id ${where}`,
      params,
    );
    const [rows] = await getPool().execute(
      `SELECT al.*, CONVERT_TZ(al.created_at, '+00:00', '-03:00') AS created_at, u.name AS user_name
       FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id
       ${where} ORDER BY al.created_at DESC, al.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    return { rows, total: Number(count.total) };
  },

  async createRoom(data, connection) {
    const [result] = await connection.execute(
      `INSERT INTO rooms (number, room_category_id, floor, capacity, beds, status, notes, active)
       VALUES (?, ?, ?, ?, ?, 'available', ?, ?)`,
      [data.number, data.categoryId, data.floor, data.capacity, data.beds, data.notes, data.active],
    );
    return result.insertId;
  },

  async updateRoom(id, data, connection) {
    await connection.execute(
      `UPDATE rooms SET number=?, room_category_id=?, floor=?, capacity=?, beds=?, notes=?, active=? WHERE id=?`,
      [data.number, data.categoryId, data.floor, data.capacity, data.beds, data.notes, data.active, id],
    );
  },
};
