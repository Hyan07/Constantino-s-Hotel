import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../../src/security/password.js";

test("hash de senha é salgado e verificável", async () => {
  const password = "654321";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("123456", first), false);
});

test("política de senha aceita apenas seis dígitos", async () => {
  await assert.rejects(() => hashPassword("12345"), /6 dígitos/);
  await assert.rejects(() => hashPassword("1234567"), /6 dígitos/);
  await assert.rejects(() => hashPassword("abc123"), /6 dígitos/);
});
