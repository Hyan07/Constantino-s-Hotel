import { stayService } from "../services/stay.service.js";
import { ok } from "../utils/http.js";

const actor = (req) => ({ id: req.user.id, ipAddress: req.ip });

export const stayController = {
  async list(req, res) { return ok(res, await stayService.list(req.query)); },
  async detail(req, res) { return ok(res, await stayService.detail(req.params.id)); },
  async checkIn(req, res) { return ok(res, await stayService.checkIn(req.params.id, actor(req)), 201); },
  async charge(req, res) { return ok(res, await stayService.addCharge(req.params.id, req.body, actor(req)), 201); },
  async extend(req, res) { return ok(res, await stayService.extend(req.params.id, req.body, actor(req))); },
  async checkout(req, res) { return ok(res, await stayService.checkout(req.params.id, req.body, actor(req))); },
};
