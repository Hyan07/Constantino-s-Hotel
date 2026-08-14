import { settingsService } from "../services/settings.service.js";
import { ok } from "../utils/http.js";

export const settingsController = {
  async get(_req, res) { return ok(res, await settingsService.getPublic()); },
};
