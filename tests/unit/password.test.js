import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../../src/security/password.js";

test("hash de senha é salgado e verificável", async () => {
  const password = "SenhaForte!2026";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("senha-incorreta", first), false);
});

test("política de senha rejeita valor fraco", async () => {
  await assert.rejects(() => hashPassword("123456"), /12 caracteres/);
});
