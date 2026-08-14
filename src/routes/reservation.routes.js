import { Router } from "express";
import { reservationController } from "../controllers/reservation.controller.js";
import { asyncHandler } from "../utils/async-handler.js";
import { requirePermission } from "../middleware/authentication.js";
import { stayController } from "../controllers/stay.controller.js";

const router = Router();
router.get("/available", requirePermission("reservations.read"), asyncHandler(reservationController.available));
router.get("/calendar", requirePermission("reservations.read"), asyncHandler(reservationController.calendar));
router.get("/", requirePermission("reservations.read"), asyncHandler(reservationController.list));
router.get("/:id", requirePermission("reservations.read"), asyncHandler(reservationController.detail));
router.post("/", requirePermission("reservations.write"), asyncHandler(reservationController.create));
router.put("/:id", requirePermission("reservations.write"), asyncHandler(reservationController.update));
router.post("/:id/cancel", requirePermission("reservations.write"), asyncHandler(reservationController.cancel));
router.post("/:id/no-show", requirePermission("reservations.write"), asyncHandler(reservationController.noShow));
router.post("/:id/check-in", requirePermission("stays.write"), asyncHandler(stayController.checkIn));
export default router;
