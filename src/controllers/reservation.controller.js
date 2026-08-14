import { reservationService } from "../services/reservation.service.js";
import { ok } from "../utils/http.js";

const actor = (req) => ({ id: req.user.id, ipAddress: req.ip });

export const reservationController = {
  async list(req, res) { return ok(res, await reservationService.list(req.query)); },
  async detail(req, res) { return ok(res, await reservationService.detail(req.params.id)); },
  async available(req, res) { return ok(res, await reservationService.available(req.query)); },
  async calendar(req, res) { return ok(res, await reservationService.calendar(req.query)); },
  async create(req, res) { return ok(res, await reservationService.create(req.body, actor(req)), 201); },
  async update(req, res) { return ok(res, await reservationService.update(req.params.id, req.body, actor(req))); },
  async cancel(req, res) { return ok(res, await reservationService.cancel(req.params.id, req.body, actor(req))); },
  async noShow(req, res) { return ok(res, await reservationService.noShow(req.params.id, actor(req))); },
};
