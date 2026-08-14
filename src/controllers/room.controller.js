import { roomService } from "../services/room.service.js";
import { roomRepository } from "../repositories/room.repository.js";
import { ok } from "../utils/http.js";

const actor = (req) => ({ id: req.user.id, ipAddress: req.ip });

export const roomController = {
  async list(req, res) { return ok(res, await roomService.list(req.query)); },
  async detail(req, res) { return ok(res, await roomService.detail(req.params.id)); },
  async block(req, res) { return ok(res, await roomService.block(req.params.id, req.body, actor(req))); },
  async unblock(req, res) { return ok(res, await roomService.unblock(req.params.id, actor(req))); },
  async startCleaning(req, res) { return ok(res, await roomService.startCleaning(req.params.id, req.body, actor(req))); },
  async completeCleaning(req, res) { return ok(res, await roomService.completeCleaning(req.params.id, req.body, actor(req))); },
  async createMaintenance(req, res) { return ok(res, await roomService.createMaintenance(req.params.id, req.body, actor(req)), 201); },
  async completeMaintenance(req, res) { return ok(res, await roomService.completeMaintenance(req.params.id, req.body, actor(req))); },
  async cleaningList(req, res) { return ok(res, await roomRepository.listCleaning(req.query)); },
  async maintenanceList(req, res) { return ok(res, await roomRepository.listMaintenance(req.query)); },
};
