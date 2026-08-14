import { getPool } from "../database/pool.js";

export const dashboardRepository = {
  async summary(today) {
    const [[rooms]] = await getPool().query(
      `SELECT COUNT(*) AS total,
        SUM(status='occupied') AS occupied,
        SUM(status='available') AS available,
        SUM(status NOT IN ('occupied','available')) AS unavailable
       FROM rooms WHERE active=TRUE`,
    );
    const [arrivals] = await getPool().execute(
      `SELECT r.id, r.code, r.check_in_date, r.adults, r.children, r.status,
        g.name AS guest_name, rm.number AS room_number, rc.name AS category_name
       FROM reservations r JOIN guests g ON g.id=r.guest_id
       LEFT JOIN rooms rm ON rm.id=r.room_id LEFT JOIN room_categories rc ON rc.id=rm.room_category_id
       WHERE r.check_in_date=? AND r.status IN ('pending','confirmed','awaiting_checkin')
       ORDER BY FIELD(r.status,'awaiting_checkin','confirmed','pending'), r.id LIMIT 5`,
      [today],
    );
    const [departures] = await getPool().execute(
      `SELECT s.id, s.expected_checkout_date, g.name AS guest_name, rm.number AS room_number,
        r.total_amount + COALESCE((SELECT SUM(c.total_amount) FROM charges c WHERE c.stay_id=s.id),0) AS total_amount,
        COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.status='confirmed' AND (p.stay_id=s.id OR p.reservation_id=r.id)),0) AS paid_amount
       FROM stays s JOIN guests g ON g.id=s.guest_id JOIN rooms rm ON rm.id=s.room_id
       JOIN reservations r ON r.id=s.reservation_id
       WHERE s.expected_checkout_date=? AND s.status IN ('active','extended')
       ORDER BY rm.number LIMIT 5`,
      [today],
    );
    const [roomPending] = await getPool().query(
      `SELECT rm.id, rm.number, rm.status, mr.description AS maintenance_description
       FROM rooms rm
       LEFT JOIN maintenance_records mr ON mr.id=(
         SELECT id FROM maintenance_records WHERE room_id=rm.id AND status IN ('open','in_progress') ORDER BY id DESC LIMIT 1
       )
       WHERE rm.active=TRUE AND rm.status IN ('awaiting_cleaning','cleaning','maintenance')
       ORDER BY FIELD(rm.status,'maintenance','awaiting_cleaning','cleaning') LIMIT 6`,
    );
    const [unassigned] = await getPool().query(
      `SELECT r.id, r.code, r.check_in_date, g.name AS guest_name
       FROM reservations r JOIN guests g ON g.id=r.guest_id
       WHERE r.room_id IS NULL AND r.status IN ('pending','confirmed','awaiting_checkin')
       ORDER BY r.check_in_date LIMIT 3`,
    );
    const [overdueBalances] = await getPool().query(
      `SELECT r.id, r.code, g.name AS guest_name,
        r.total_amount - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.reservation_id=r.id AND p.status='confirmed'),0) AS balance
       FROM reservations r JOIN guests g ON g.id=r.guest_id
       WHERE r.status IN ('checked_in','awaiting_checkin')
       HAVING balance > 0 ORDER BY balance DESC LIMIT 3`,
    );
    const [calendarReservations] = await getPool().execute(
      `SELECT room_id, check_in_date, check_out_date FROM reservations
       WHERE room_id IS NOT NULL AND status IN ('pending','confirmed','awaiting_checkin','checked_in')
         AND check_in_date < DATE_ADD(?, INTERVAL 7 DAY) AND check_out_date > ?`,
      [today, today],
    );
    return { rooms, arrivals, departures, roomPending, unassigned, overdueBalances, calendarReservations };
  },
};
