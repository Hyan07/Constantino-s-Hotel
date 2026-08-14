import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../src/app.js";

async function withServer(work) {
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const { port } = server.address();
    await work(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("API protegida recusa acesso sem sessão", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/dashboard`);
    const payload = await response.json();
    assert.equal(response.status, 401);
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "AUTHENTICATION_REQUIRED");
  });
});

test("respostas aplicam cabeçalhos de segurança e bloqueio de indexação local", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/login.html`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
    assert.match(response.headers.get("x-robots-tag"), /noindex/);
    assert.equal(response.headers.get("x-powered-by"), null);
  });
});
