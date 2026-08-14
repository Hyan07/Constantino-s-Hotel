import { getPool } from "../database/pool.js";

export const searchRepository = {
  async search(q) {
    const term = `%${q}%`;
    const digits = q.replace(/\D/g, "");
    const cpfTerm = `%${digits || q}%`;
    const [guests] = await getPool().execute(
      `SELECT id, name AS title,
        CONCAT_WS(' · ', NULLIF(cpf,''), NULLIF(phone,''), NULLIF(email,''), NULLIF(city,'')) AS subtitle,
        'guest' AS type
       FROM guests
       WHERE active=TRUE AND (name LIKE ? OR cpf LIKE ? OR phone LIKE ? OR email LIKE ?)
       ORDER BY name LIMIT 6`,
      [term, cpfTerm, term, term],
    );
    const [reservations] = await getPool().execute(
      `SELECT r.id, CONCAT(r.code,' · ',g.name) AS title,
        CONCAT(r.check_in_date,' → ',r.check_out_date, CASE WHEN rm.number IS NULL THEN ' · sem quarto' ELSE CONCAT(' · quarto ',rm.number) END) AS subtitle,
        'reservation' AS type
       FROM reservations r JOIN guests g ON g.id=r.guest_id LEFT JOIN rooms rm ON rm.id=r.room_id
       WHERE r.code LIKE ? OR g.name LIKE ? OR g.cpf LIKE ? OR g.phone LIKE ? OR g.email LIKE ?
       ORDER BY r.id DESC LIMIT 6`,
      [term, term, cpfTerm, term, term],
    );
    const [stays] = await getPool().execute(
      `SELECT s.id, CONCAT(g.name,' · Quarto ',rm.number) AS title,
        CONCAT('Hospedagem ', s.status, ' · entrada ', DATE(s.check_in_at), ' · saída prevista ', s.expected_checkout_date) AS subtitle,
        'stay' AS type
       FROM stays s
       JOIN guests g ON g.id=s.guest_id
       JOIN rooms rm ON rm.id=s.room_id
       LEFT JOIN reservations r ON r.id=s.reservation_id
       WHERE g.name LIKE ? OR g.cpf LIKE ? OR g.phone LIKE ? OR g.email LIKE ? OR rm.number LIKE ? OR COALESCE(r.code,'') LIKE ?
       ORDER BY s.id DESC LIMIT 6`,
      [term, cpfTerm, term, term, term, term],
    );
    const [rooms] = await getPool().execute(
      `SELECT rm.id, CONCAT('Quarto ',rm.number) AS title, CONCAT(rc.name,' · ',rm.status) AS subtitle, 'room' AS type
       FROM rooms rm JOIN room_categories rc ON rc.id=rm.room_category_id
       WHERE rm.active=TRUE AND (rm.number LIKE ? OR rc.name LIKE ?) ORDER BY rm.number LIMIT 6`,
      [term, term],
    );
    return [...guests, ...reservations, ...stays, ...rooms].slice(0, 16);
  },
};
