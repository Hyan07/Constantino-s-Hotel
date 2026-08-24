import test from "node:test";
import assert from "node:assert/strict";
import { addDays, assertDateRange } from "../../src/utils/dates.js";
import { canTransitionReservation } from "../../src/services/reservation-status.js";

test("calcula diárias e avança datas sem depender do horário local", () => {
  assert.equal(assertDateRange("2026-08-13", "2026-08-16"), 3);
  assert.equal(addDays("2026-08-31", 1), "2026-09-01");
  assert.throws(() => assertDateRange("2026-08-16", "2026-08-13"), /posterior/);
});

test("mantém fluxo operacional da reserva até a finalização", () => {
  assert.equal(canTransitionReservation("pending", "confirmed"), true);
  assert.equal(canTransitionReservation("confirmed", "pending"), true);
  assert.equal(canTransitionReservation("pending", "cancelled"), true);
  assert.equal(canTransitionReservation("pending", "no_show"), false);
  assert.equal(canTransitionReservation("confirmed", "cancelled"), true);
  assert.equal(canTransitionReservation("confirmed", "no_show"), true);
  assert.equal(canTransitionReservation("confirmed", "checked_in"), true);
  assert.equal(canTransitionReservation("checked_in", "completed"), true);
  assert.equal(canTransitionReservation("completed", "confirmed"), false);
  assert.equal(canTransitionReservation("cancelled", "confirmed"), false);
  assert.equal(canTransitionReservation("cancelled", "pending"), false);
  assert.equal(canTransitionReservation("no_show", "confirmed"), false);
  assert.equal(canTransitionReservation("checked_in", "confirmed"), false);
  assert.equal(canTransitionReservation("confirmed", "awaiting_checkin"), false);
});
