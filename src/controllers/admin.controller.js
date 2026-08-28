import { adminService } from "../services/admin.service.js";
import { adminMaintenanceService } from "../services/admin-maintenance.service.js";
import { ok } from "../utils/http.js";

const actor = (req) => ({ id: req.user.id, ipAddress: req.ip });

export const adminController = {
  async rooms(_req, res) { return ok(res, await adminService.rooms()); },
  async users(_req, res) { return ok(res, await adminService.users()); },
  async roles(_req, res) { return ok(res, await adminService.roles()); },
  async createUser(req, res) { return ok(res, await adminService.createUser(req.body, actor(req)), 201); },
  async updateUser(req, res) { return ok(res, await adminService.updateUser(req.params.id, req.body, actor(req))); },
  async resetUserPassword(req, res) { return ok(res, await adminService.resetUserPassword(req.params.id, req.body, actor(req))); },
  async categories(_req, res) { return ok(res, await adminService.categories()); },
  async createCategory(req, res) { return ok(res, await adminService.saveCategory(null, req.body, actor(req)), 201); },
  async updateCategory(req, res) { return ok(res, await adminService.saveCategory(req.params.id, req.body, actor(req))); },
  async settings(_req, res) { return ok(res, await adminService.settings()); },
  async updateSettings(req, res) { return ok(res, await adminService.updateSettings(req.body, actor(req))); },
  async audit(req, res) { return ok(res, await adminService.audit(req.query)); },
  async createRoom(req, res) { return ok(res, await adminService.saveRoom(null, req.body, actor(req)), 201); },
  async updateRoom(req, res) { return ok(res, await adminService.saveRoom(req.params.id, req.body, actor(req))); },
  async maintenanceEdit(req, res) { return ok(res, await adminMaintenanceService.edit(req.params.type, req.params.id, req.body, actor(req))); },
  async maintenanceDelete(req, res) { return ok(res, await adminMaintenanceService.remove(req.params.type, req.params.id, actor(req))); },
  async maintenanceCancelReservation(req, res) { return ok(res, await adminMaintenanceService.cancelReservation(req.params.id, actor(req))); },
};
