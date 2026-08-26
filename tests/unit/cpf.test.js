import test from "node:test";
import assert from "node:assert/strict";
import { isValidCpf, maskCpf, normalizeCpf } from "../../src/utils/cpf.js";

test("normaliza, valida e formata CPF para exibição", () => {
  assert.equal(normalizeCpf("529.982.247-25"), "52998224725");
  assert.equal(isValidCpf("529.982.247-25"), true);
  assert.equal(isValidCpf("111.111.111-11"), false);
  assert.equal(maskCpf("52998224725"), "529.982.247-25");
  assert.equal(maskCpf(""), "Não informado");
});
