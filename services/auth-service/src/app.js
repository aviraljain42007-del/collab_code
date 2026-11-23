import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import pinoHttp from "pino-http";

import { config } from "./shared/config/index.js";
import { logger } from "./shared/logger.js";
import { requestId } from "./shared/middleware/requestId.js";
import { errorHandler } from "./shared/middleware/error.middleware.js";

import { TokenService } from "./modules/auth/token.service.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { AuthController } from "./modules/auth/auth.controller.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { PostgresAuthRepository } from "./modules/auth/postgres-auth.repository.js";

async function bootstrap() {

  // ── 2. Dependency graph ──
  const authRepository = new PostgresAuthRepository();
  const tokenService = new TokenService(authRepository);
  const authService = new AuthService(authRepository, tokenService);
  const authController = new AuthController(authService);

  // ── 3. Express app ──
  const app = express();

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      customProps: (req) => ({ requestId: req.id }),
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
    }),
  );
  app.use(cors({ origin: "http://localhost:5173", credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  // ── 4. Health check ──
  app.get("/health", (_req, res) =>
    res.json({ status: "ok", service: "auth" }),
  );

  // ── 5. Routes ──
  app.use("/api/v1/auth", authRouter({ authController, tokenService }));

  // ── 6. 404 + error handler ──
  app.use((_req, res) =>
    res.status(404).json({ error: { code: "NOT_FOUND" } }),
  );
  app.use(errorHandler);

  // ── 7. Listen ──
  // Make sure .env has PORT=3001
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, "Auth Service listening");
  });

  // ── 8. Graceful shutdown ──
  const shutdown = async (signal) => {
    logger.info({ signal }, "shutting down auth service");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  logger.error({ err }, "bootstrap failed");
  process.exit(1);
});
