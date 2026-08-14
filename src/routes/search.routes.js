import { Router } from "express";
import { searchController } from "../controllers/search.controller.js";
import { asyncHandler } from "../utils/async-handler.js";

const router = Router();
router.get("/", asyncHandler(searchController.search));
export default router;
