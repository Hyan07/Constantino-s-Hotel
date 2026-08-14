import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../src/app.js";
import { closePool } from "../../src/database/pool.js";

const enabled = process.env.RUN_E2E === "true";

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function addDay(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function cpfFromPrefix(prefix) {
  const digits = String(prefix).replace(/\D/g, "").padStart(9, "1").slice(-9).split("").map(Number);
  for (let length = 9; length <= 10; length += 1) {
    const factor = length + 1;
    const sum = digits.slice(0, length).reduce((total, digit, index) => total + digit * (factor - index), 0);
    const rest = (sum * 10) % 11;
    digits.push(rest === 10 ? 0 : rest);
  }
  return digits.join("");
}

test("fluxo completo do hotel", { skip: !enabled }, async () => {
  const appServer = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => appServer.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${appServer.address().port}`;
  let cookies = "";
  let csrf = "";

  async function rawRequest(path, { method = "GET", body } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(cookies ? { Cookie: cookies } : {}),
        ...(!["GET", "HEAD"].includes(method) && csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookies = response.headers.getSetCookie?.() || [];
    if (setCookies.length) {
      cookies = setCookies.map((entry) => entry.split(";", 1)[0]).join("; ");
      const csrfCookie = setCookies.find((entry) => entry.split("=", 1)[0].endsWith("_csrf"));
      if (csrfCookie) csrf = decodeURIComponent(csrfCookie.split(";", 1)[0].split("=").slice(1).join("="));
    }
    const payload = await response.json();
    return { response, payload };
  }

  async function request(path, options = {}) {
    const { response, payload } = await rawRequest(path, options);
    const method = options.method || "GET";
    assert.equal(payload.success, true, `${method} ${path}: ${payload.error?.message || response.status}`);
    return payload.data;
  }

  try {
    await request("/api/auth/login", { method: "POST", body: { cpf: process.env.INITIAL_ADMIN_CPF, password: process.env.INITIAL_ADMIN_PASSWORD } });
    assert.ok(csrf, "cookie CSRF ausente");

    const suffix = String(Date.now()).slice(-8);
    const category = await request("/api/admin/categories", { method: "POST", body: { name: `E2E ${suffix}`, slug: `e2e-${suffix}`, capacity: 3, baseRate: 180, active: true } });
    const room = await request("/api/admin/rooms", { method: "POST", body: { number: `T${suffix}`, categoryId: category.id, floor: 9, capacity: 3, beds: "1 cama queen", active: true } });
    const guest = await request("/api/guests", { method: "POST", body: { name: `Hóspede E2E ${suffix}`, cpf: cpfFromPrefix(suffix), phone: "11999999999", active: true } });
    const checkIn = today();
    const checkOut = addDay(checkIn, 1);
    const reservation = await request("/api/reservations", { method: "POST", body: { guestId: guest.id, roomId: room.id, checkIn, checkOut, adults: 1, children: 0, status: "confirmed", dailyRate: 180, discount: 0, surcharge: 0, source: "Teste E2E" } });

    const concurrentRoom = await request("/api/admin/rooms", { method: "POST", body: { number: `C${suffix}`, categoryId: category.id, floor: 9, capacity: 3, beds: "1 cama queen", active: true } });
    const [guestA, guestB] = await Promise.all([
      request("/api/guests", { method: "POST", body: { name: `Concorrente A ${suffix}`, phone: "11999999991", active: true } }),
      request("/api/guests", { method: "POST", body: { name: `Concorrente B ${suffix}`, phone: "11999999992", active: true } }),
    ]);
    const concurrentBody = (guestId) => ({ guestId, roomId: concurrentRoom.id, checkIn, checkOut, adults: 1, children: 0, status: "confirmed", dailyRate: 180, discount: 0, surcharge: 0, source: "Teste de concorrência" });
    const concurrentResults = await Promise.all([
      rawRequest("/api/reservations", { method: "POST", body: concurrentBody(guestA.id) }),
      rawRequest("/api/reservations", { method: "POST", body: concurrentBody(guestB.id) }),
    ]);
    assert.deepEqual(concurrentResults.map((result) => result.response.status).sort(), [201, 409]);
    assert.equal(concurrentResults.find((result) => result.response.status === 409).payload.error.code, "ROOM_NOT_AVAILABLE");

    const calendar = await request(`/api/reservations/calendar?from=${checkIn}&days=7`);
    assert.ok(calendar.reservations.some((item) => item.id === reservation.id));

    const stay = await request(`/api/reservations/${reservation.id}/check-in`, { method: "POST", body: {} });
    await request(`/api/stays/${stay.id}/charges`, { method: "POST", body: { description: "Água", quantity: 1, unitPrice: 12 } });
    const account = await request(`/api/stays/${stay.id}`);
    assert.equal(account.balance, 192);
    await request("/api/payments", { method: "POST", body: { stayId: stay.id, amount: account.balance, paymentMethod: "Pix" } });
    await request(`/api/stays/${stay.id}/check-out`, { method: "POST", body: { notes: "Teste automatizado" } });
    assert.equal((await request(`/api/rooms/${room.id}`)).status, "awaiting_cleaning");
    await request(`/api/rooms/${room.id}/cleaning/start`, { method: "POST", body: { employeeName: "Equipe E2E" } });
    await request(`/api/rooms/${room.id}/cleaning/complete`, { method: "POST", body: {} });
    assert.equal((await request(`/api/rooms/${room.id}`)).status, "available");
  } finally {
    await new Promise((resolve) => appServer.close(resolve));
    await closePool();
  }
});
