import { Router } from "express";
import { roomController } from "../controllers/room.controller.js";
import { asyncHandler } from "../utils/async-handler.js";
import { requirePermission } from "../middleware/authentication.js";

const router = Router();
router.get("/", requirePermission("rooms.read"), asyncHandler(roomController.list));
router.get("/:id", requirePermission("rooms.read"), asyncHandler(roomController.detail));
router.post("/:id/block", requirePermission("rooms.write"), asyncHandler(roomController.block));
router.post("/:id/unblock", requirePermission("rooms.write"), asyncHandler(roomController.unblock));
router.post("/:id/cleaning/start", requirePermission("cleaning.write"), asyncHandler(roomController.startCleaning));
router.post("/:id/cleaning/complete", requirePermission("cleaning.write"), asyncHandler(roomController.completeCleaning));
router.post("/:id/maintenance", requirePermission("maintenance.write"), asyncHandler(roomController.createMaintenance));
router.post("/:id/maintenance/complete", requirePermission("maintenance.write"), asyncHandler(roomController.completeMaintenance));
export default router;
