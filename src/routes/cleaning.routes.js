import { Router } from "express";
import { roomController } from "../controllers/room.controller.js";
import { asyncHandler } from "../utils/async-handler.js";
import { requirePermission } from "../middleware/authentication.js";

const router = Router();
router.get("/", requirePermission("rooms.read"), asyncHandler(roomController.cleaningList));
export default router;
