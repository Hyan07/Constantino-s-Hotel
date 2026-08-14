import { guestService } from "../services/guest.service.js";
import { ok } from "../utils/http.js";

const actor = (req) => ({ id: req.user.id, ipAddress: req.ip });

export const guestController = {
  async list(req, res) {
    return ok(res, await guestService.list(req.query));
  },
  async detail(req, res) {
    return ok(res, await guestService.detail(req.params.id));
  },
  async create(req, res) {
    return ok(res, await guestService.create(req.body, actor(req)), 201);
  },
  async update(req, res) {
    return ok(res, await guestService.update(req.params.id, req.body, actor(req)));
  },
};
