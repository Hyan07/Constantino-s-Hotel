export function normalizeCnpj(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function isValidCnpjFormat(value) {
  const normalized = normalizeCnpj(value);
  return /^[A-Z0-9]{12}\d{2}$/.test(normalized);
}

export function formatCnpj(value) {
  const normalized = normalizeCnpj(value);
  if (!isValidCnpjFormat(normalized)) return String(value || "");
  return normalized.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5");
}
