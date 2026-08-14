import { config } from "../../config/app-config.js";
import { getPool, withTransaction } from "../pool.js";
import { addDays, toSqlDate } from "../../utils/dates.js";

export async function seedDevelopment() {
  if (!["development", "test"].includes(config.env)) {
    throw new Error("O seed de desenvolvimento só pode rodar com APP_ENV=development ou test.");
  }
  const [[user]] = await getPool().query("SELECT id FROM users ORDER BY id LIMIT 1");
  if (!user) throw new Error("Crie o administrador inicial antes de executar o seed.");

  await withTransaction(async (connection) => {
    const categories = [
      ["Standard", "standard", 2, 220, "Acomodação confortável para até duas pessoas."],
      ["Superior", "superior", 3, 320, "Mais espaço e flexibilidade para famílias pequenas."],
      ["Luxo", "luxo", 4, 480, "Suíte ampla com comodidades premium."],
    ];
    for (const category of categories) {
      await connection.execute(
        `INSERT INTO room_categories (name, slug, capacity, base_rate, description)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), capacity=VALUES(capacity), base_rate=VALUES(base_rate), description=VALUES(description)`,
        category,
      );
    }
    const [categoryRows] = await connection.query("SELECT id, slug, capacity FROM room_categories");
    const bySlug = Object.fromEntries(categoryRows.map((row) => [row.slug, row]));
    for (const floor of [1, 2, 3]) {
      const slug = floor === 1 ? "standard" : floor === 2 ? "superior" : "luxo";
      const category = bySlug[slug];
      for (let index = 1; index <= 8; index += 1) {
        const number = `${floor}0${index}`;
        const beds = floor === 1 ? "1 cama de casal" : floor === 2 ? "1 cama de casal + 1 solteiro" : "Suíte king";
        await connection.execute(
          `INSERT INTO rooms (number, room_category_id, floor, capacity, beds)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE room_category_id=VALUES(room_category_id), floor=VALUES(floor), capacity=VALUES(capacity), beds=VALUES(beds)`,
          [number, category.id, floor, category.capacity, beds],
        );
      }
    }

    const guests = [
      ["Mariana Costa (Fictícia)", "11144477735", "(35) 90000-1001", "mariana@example.test", "Passos", "MG"],
      ["Rafael Ferreira (Fictício)", null, "(35) 90000-1002", "rafael@example.test", "Franca", "SP"],
      ["Beatriz Nogueira (Fictícia)", null, "(35) 90000-1003", "beatriz@example.test", "Ribeirão Preto", "SP"],
      ["Lucas Ribeiro (Fictício)", null, "(35) 90000-1004", "lucas@example.test", "Belo Horizonte", "MG"],
    ];
    for (const guest of guests) {
      await connection.execute(
        `INSERT INTO guests (name, cpf, phone, email, city, state)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), phone=VALUES(phone), city=VALUES(city), state=VALUES(state)`,
        guest,
      );
    }

    const [guestRows] = await connection.query("SELECT id, email FROM guests WHERE email LIKE '%@example.test'");
    const [roomRows] = await connection.query("SELECT id, number FROM rooms WHERE number IN ('103','203','302','303')");
    const guestByEmail = Object.fromEntries(guestRows.map((row) => [row.email, row.id]));
    const roomByNumber = Object.fromEntries(roomRows.map((row) => [row.number, row.id]));
    const today = toSqlDate();
    const samples = [
      ["DEV-0001", guestByEmail["mariana@example.test"], roomByNumber["103"], today, addDays(today, 2), 2, 1, 220, 440, "confirmed"],
      ["DEV-0002", guestByEmail["rafael@example.test"], roomByNumber["203"], addDays(today, 1), addDays(today, 4), 2, 0, 320, 960, "confirmed"],
      ["DEV-0003", guestByEmail["beatriz@example.test"], roomByNumber["302"], addDays(today, 2), addDays(today, 4), 2, 0, 480, 960, "confirmed"],
      ["DEV-0004", guestByEmail["lucas@example.test"], null, addDays(today, 3), addDays(today, 6), 1, 0, 480, 1440, "pending"],
    ];
    for (const sample of samples) {
      const nights = Math.round((new Date(`${sample[4]}T12:00:00Z`) - new Date(`${sample[3]}T12:00:00Z`)) / 86_400_000);
      await connection.execute(
        `INSERT INTO reservations
          (code, guest_id, room_id, check_in_date, check_out_date, adults, children, nights, daily_rate, total_amount, status, source, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Seed fictício', ?, ?)
         ON DUPLICATE KEY UPDATE check_in_date=VALUES(check_in_date), check_out_date=VALUES(check_out_date), room_id=VALUES(room_id), updated_by=VALUES(updated_by)`,
        [...sample.slice(0, 7), nights, ...sample.slice(7), user.id, user.id],
      );
    }
  });
  return { seeded: true };
}
