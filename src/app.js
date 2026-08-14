import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { config } from "./config/app-config.js";
import { requestContext } from "./middleware/request-context.js";
import { enforceSameOrigin } from "./middleware/same-origin.js";
import { authenticate, verifyCsrf } from "./middleware/authentication.js";
import { errorHandler, notFound } from "./middleware/error-handler.js";
import { getPool } from "./database/pool.js";
import authRoutes from "./routes/auth.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import guestRoutes from "./routes/guest.routes.js";
import roomRoutes from "./routes/room.routes.js";
import reservationRoutes from "./routes/reservation.routes.js";
import stayRoutes from "./routes/stay.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import cleaningRoutes from "./routes/cleaning.routes.js";
import maintenanceRoutes from "./routes/maintenance.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import searchRoutes from "./routes/search.routes.js";
import settingsRoutes from "./routes/settings.routes.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(currentDir, "../public");
const lucideFile = path.resolve(currentDir, "../node_modules/lucide/dist/umd/lucide.min.js");

export function createApp() {
  const app = express();
  if (config.trustProxy) app.set("trust proxy", config.trustProxy);
  app.disable("x-powered-by");
  app.use(requestContext);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  if (["development", "staging"].includes(config.env)) {
    app.use((_req, res, next) => {
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
      next();
    });
  }
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use(cookieParser());
  app.use(enforceSameOrigin);

  app.get("/health", async (_req, res) => {
    try {
      await getPool().query("SELECT 1");
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "error" });
    }
  });
  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send(["User-agent: *", "Disallow: /", ""].join("\n"));
  });
  app.get("/vendor/lucide.min.js", (_req, res) => res.sendFile(lucideFile));
  app.use("/api/auth", authRoutes);
  app.use("/api", authenticate, verifyCsrf);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/guests", guestRoutes);
  app.use("/api/rooms", roomRoutes);
  app.use("/api/reservations", reservationRoutes);
  app.use("/api/stays", stayRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use("/api/cleanings", cleaningRoutes);
  app.use("/api/maintenance", maintenanceRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/search", searchRoutes);
  app.use("/api/settings", settingsRoutes);

  app.use(express.static(publicDir, { index: false, maxAge: config.env === "production" ? "1h" : 0 }));
  app.get("/login", (_req, res) => res.redirect(302, "/login.html"));
  app.get("/", (req, res) => {
    if (!req.cookies?.[config.session.cookieName]) return res.redirect(302, "/login.html");
    return res.sendFile(path.join(publicDir, "index.html"));
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
