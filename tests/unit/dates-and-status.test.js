import test from "node:test";
import assert from "node:assert/strict";
import { addDays, assertDateRange } from "../../src/utils/dates.js";
import { canTransitionReservation } from "../../src/services/reservation-status.js";

test("calcula diárias e avança datas sem depender do horário local", () => {
  assert.equal(assertDateRange("2026-08-13", "2026-08-16"), 3);
  assert.equal(addDays("2026-08-31", 1), "2026-09-01");
  assert.throws(() => assertDateRange("2026-08-16", "2026-08-13"), /posterior/);
});

test("mantém cinco situações de reserva e permite reabertura controlada", () => {
  assert.equal(canTransitionReservation("pending", "confirmed"), true);
  assert.equal(canTransitionReservation("confirmed", "pending"), true);
  assert.equal(canTransitionReservation("pending", "cancelled"), true);
  assert.equal(canTransitionReservation("confirmed", "no_show"), true);
  assert.equal(canTransitionReservation("cancelled", "confirmed"), true);
  assert.equal(canTransitionReservation("cancelled", "pending"), true);
  assert.equal(canTransitionReservation("no_show", "confirmed"), true);
  assert.equal(canTransitionReservation("confirmed", "checked_in"), true);
  assert.equal(canTransitionReservation("checked_in", "confirmed"), false);
  assert.equal(canTransitionReservation("cancelled", "checked_in"), false);
  assert.equal(canTransitionReservation("confirmed", "awaiting_checkin"), false);
  assert.equal(canTransitionReservation("checked_in", "completed"), false);
});
