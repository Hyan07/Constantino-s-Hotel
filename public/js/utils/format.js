export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function currency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

export function shortDate(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date).replace(".", "");
}

export function longDate(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

export function dateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value.replace?.(" ", "T") || value));
}

export function isoDate(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  return formatter.format(date);
}

export function addDays(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function initials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "CH";
}

export const statusLabels = {
  pending: "Pendente",
  confirmed: "Confirmada",
  awaiting_checkin: "Aguardando check-in",
  checked_in: "Hospedado",
  completed: "Finalizada",
  cancelled: "Cancelada",
  no_show: "Não compareceu",
  available: "Disponível",
  reserved: "Reservado",
  occupied: "Ocupado",
  awaiting_cleaning: "Aguardando limpeza",
  cleaning: "Em limpeza",
  maintenance: "Manutenção",
  blocked: "Bloqueado",
  active: "Hospedado",
  extended: "Estendida",
  in_progress: "Em andamento",
  open: "Aberta",
};

export function statusLabel(status) {
  return statusLabels[status] || String(status || "—");
}

export function debounce(fn, wait = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
