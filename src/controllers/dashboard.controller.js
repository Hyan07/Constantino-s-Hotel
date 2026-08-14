import { dashboardService } from "../services/dashboard.service.js";
import { ok } from "../utils/http.js";

export const dashboardController = {
  async get(_req, res) { return ok(res, await dashboardService.get()); },
};
