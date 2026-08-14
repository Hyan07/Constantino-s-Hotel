import { Router } from "express";
import { paymentController } from "../controllers/payment.controller.js";
import { asyncHandler } from "../utils/async-handler.js";
import { requirePermission } from "../middleware/authentication.js";

const router = Router();
router.get("/", requirePermission("stays.read"), asyncHandler(paymentController.list));
router.post("/", requirePermission("payments.write"), asyncHandler(paymentController.create));
export default router;
