import test from "node:test";
import assert from "node:assert/strict";
import { normalizeReservationSources, normalizeStayPrint } from "../../src/services/configuration-options.js";

test("normaliza e remove duplicidades das origens de reserva", () => {
  assert.deepEqual(normalizeReservationSources(["Direta", " WhatsApp ", "Direta"]), ["Direta", "WhatsApp"]);
});

test("rejeita lista vazia de origens", () => {
  assert.throws(() => normalizeReservationSources([]), /1 a 40 origens/);
});

test("normaliza preferências do termo de hospedagem", () => {
  const value = normalizeStayPrint({
    institutionalLabel: "Documento do hotel",
    documentTitle: "Termo",
    documentSubtitle: "Hospedagem",
    declaration: "Declaração de ciência suficientemente completa.",
    footerNote: "Uso interno.",
    showValues: false,
    showCharges: "true",
  });
  assert.equal(value.showValues, false);
  assert.equal(value.showCharges, true);
  assert.equal(value.showPayments, true);
});
