import { Router } from "express";
import { guestController } from "../controllers/guest.controller.js";
import { asyncHandler } from "../utils/async-handler.js";
import { requirePermission } from "../middleware/authentication.js";

const router = Router();
router.get("/", requirePermission("guests.read"), asyncHandler(guestController.list));
router.get("/:id", requirePermission("guests.read"), asyncHandler(guestController.detail));
router.post("/", requirePermission("guests.write"), asyncHandler(guestController.create));
router.put("/:id", requirePermission("guests.write"), asyncHandler(guestController.update));
export default router;
