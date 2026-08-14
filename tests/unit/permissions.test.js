import test from "node:test";
import assert from "node:assert/strict";
import { requirePermission } from "../../src/middleware/authentication.js";

test("middleware permite somente a permissão exigida", () => {
  let received;
  requirePermission("administration.write")(
    { user: { permissions: ["administration.write"] } },
    {},
    (error) => { received = error || null; },
  );
  assert.equal(received, null);

  requirePermission("administration.write")(
    { user: { permissions: ["reservations.read"] } },
    {},
    (error) => { received = error; },
  );
  assert.equal(received.code, "FORBIDDEN");
  assert.equal(received.status, 403);
});
