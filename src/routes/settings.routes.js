import { Router } from "express";
import { settingsController } from "../controllers/settings.controller.js";
import { asyncHandler } from "../utils/async-handler.js";

const router = Router();
router.get("/", asyncHandler(settingsController.get));
export default router;
