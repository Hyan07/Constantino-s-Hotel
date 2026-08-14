import { searchRepository } from "../repositories/search.repository.js";
import { ok } from "../utils/http.js";

export const searchController = {
  async search(req, res) {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return ok(res, []);
    return ok(res, await searchRepository.search(q.slice(0, 100)));
  },
};
