import { paymentService } from "../services/payment.service.js";
import { ok } from "../utils/http.js";

const actor = (req) => ({ id: req.user.id, ipAddress: req.ip });

export const paymentController = {
  async list(req, res) { return ok(res, await paymentService.list(req.query)); },
  async create(req, res) { return ok(res, await paymentService.create(req.body, actor(req)), 201); },
};
