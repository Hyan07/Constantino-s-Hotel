import { Router } from "express";
import { stayController } from "../controllers/stay.controller.js";
import { asyncHandler } from "../utils/async-handler.js";
import { requirePermission } from "../middleware/authentication.js";

const router = Router();
router.get("/", requirePermission("stays.read"), asyncHandler(stayController.list));
router.get("/:id", requirePermission("stays.read"), asyncHandler(stayController.detail));
router.post("/:id/charges", requirePermission("stays.write"), asyncHandler(stayController.charge));
router.post("/:id/extend", requirePermission("stays.write"), asyncHandler(stayController.extend));
router.post("/:id/check-out", requirePermission("stays.write"), asyncHandler(stayController.checkout));
export default router;
