export function parsePagination(query) {
  const page = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);
  const requested = Number.parseInt(query.pageSize || query.limit || "20", 10) || 20;
  const pageSize = [20, 50, 100].includes(requested) ? requested : 20;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function paginationMeta(total, page, pageSize) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
