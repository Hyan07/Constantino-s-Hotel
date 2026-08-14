import { Router } from "express";
import { dashboardController } from "../controllers/dashboard.controller.js";
import { asyncHandler } from "../utils/async-handler.js";

const router = Router();
router.get("/", asyncHandler(dashboardController.get));
export default router;
