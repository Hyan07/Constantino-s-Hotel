import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml } from "../../src/utils/html.js";

test("escapa conteúdo usado em e-mails HTML", () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert('x')"> & teste`),
    "&lt;img src=x onerror=&quot;alert(&#039;x&#039;)&quot;&gt; &amp; teste",
  );
});
