import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authController } from "../controllers/auth.controller.js";
import { asyncHandler } from "../utils/async-handler.js";
import { authenticate, verifyCsrf } from "../middleware/authentication.js";

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Muitas tentativas. Aguarde alguns minutos." } },
});
const recoveryLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Muitas solicitações. Tente novamente mais tarde." } },
});

router.get("/environment", asyncHandler(authController.environment));
router.post("/login", loginLimiter, asyncHandler(authController.login));
router.post("/forgot-password", recoveryLimiter, asyncHandler(authController.forgotPassword));
router.post("/reset-password", recoveryLimiter, asyncHandler(authController.resetPassword));
router.get("/session", authenticate, asyncHandler(authController.session));
router.post("/logout", authenticate, verifyCsrf, asyncHandler(authController.logout));
router.post("/change-password", authenticate, verifyCsrf, asyncHandler(authController.changePassword));

export default router;
