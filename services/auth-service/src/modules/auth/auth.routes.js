import { Router } from "express";
import { validate } from "../../shared/middleware/validate.js";
import { requireAuth } from "../../shared/middleware/auth.middleware.js";
import {
  registerSchema,
  loginSchema,
  updateProfileSchema,
} from "./auth.dto.js";

export function authRouter({ authController, tokenService }) {
  const router = Router();
  const auth = requireAuth(tokenService);

  // Public routes
  router.post("/register", validate(registerSchema), authController.register);
  router.post("/login", validate(loginSchema), authController.login);
  router.post("/refresh", authController.refresh);
  router.post("/logout", authController.logout);

  // Protected routes
  router.get("/me", auth, authController.getMe);
  router.patch(
    "/me",
    auth,
    validate(updateProfileSchema),
    authController.updateMe,
  );

  return router;
}
