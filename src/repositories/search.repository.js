import { getPool } from "../database/pool.js";

export const searchRepository = {
  async search(q) {
    const term = `%${q}%`;
    const digits = q.replace(/\D/g, "");
    const cpfTerm = `%${digits || q}%`;
    const [guests] = await getPool().execute(
      `SELECT id, name AS title, CONCAT(COALESCE(phone,''), CASE WHEN city IS NULL THEN '' ELSE CONCAT(' · ',city) END) AS subtitle,
        'guest' AS type FROM guests WHERE active=TRUE AND (name LIKE ? OR cpf LIKE ? OR phone LIKE ?) ORDER BY name LIMIT 6`,
      [term, cpfTerm, term],
    );
    const [reservations] = await getPool().execute(
      `SELECT r.id, CONCAT(r.code,' · ',g.name) AS title,
        CONCAT(r.check_in_date,' → ',r.check_out_date, CASE WHEN rm.number IS NULL THEN ' · sem quarto' ELSE CONCAT(' · quarto ',rm.number) END) AS subtitle,
        'reservation' AS type
       FROM reservations r JOIN guests g ON g.id=r.guest_id LEFT JOIN rooms rm ON rm.id=r.room_id
       WHERE r.code LIKE ? OR g.name LIKE ? ORDER BY r.id DESC LIMIT 6`,
      [term, term],
    );
    const [rooms] = await getPool().execute(
      `SELECT rm.id, CONCAT('Quarto ',rm.number) AS title, CONCAT(rc.name,' · ',rm.status) AS subtitle, 'room' AS type
       FROM rooms rm JOIN room_categories rc ON rc.id=rm.room_category_id
       WHERE rm.active=TRUE AND (rm.number LIKE ? OR rc.name LIKE ?) ORDER BY rm.number LIMIT 6`,
      [term, term],
    );
    return [...guests, ...reservations, ...rooms].slice(0, 12);
  },
};
