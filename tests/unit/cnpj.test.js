import test from "node:test";
import assert from "node:assert/strict";
import { formatCnpj, isValidCnpjFormat, normalizeCnpj } from "../../src/utils/cnpj.js";

test("normaliza CNPJ numérico e alfanumérico", () => {
  assert.equal(normalizeCnpj("12.345.678/0001-95"), "12345678000195");
  assert.equal(normalizeCnpj("ab.c12.3d4/ef56-78"), "ABC123D4EF5678");
});

test("aceita 12 posições alfanuméricas e dois dígitos finais", () => {
  assert.equal(isValidCnpjFormat("12345678000195"), true);
  assert.equal(isValidCnpjFormat("ABC123D4EF5678"), true);
  assert.equal(isValidCnpjFormat("ABC123D4EF56ZZ"), false);
  assert.equal(isValidCnpjFormat("123"), false);
});

test("formata CNPJ sem restringir o novo padrão alfanumérico", () => {
  assert.equal(formatCnpj("12345678000195"), "12.345.678/0001-95");
  assert.equal(formatCnpj("ABC123D4EF5678"), "AB.C12.3D4/EF56-78");
});
