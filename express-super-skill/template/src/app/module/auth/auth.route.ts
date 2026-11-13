import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { authController } from "./auth.controller";
import { authValidation } from "./auth.validation";

export const authRoutes = Router();

authRoutes.post(
	"/register",
	validateRequest(authValidation.registerUserSchema),
	authController.registerUser,
);

authRoutes.post(
	"/verify-email",
	validateRequest(authValidation.verifyEmailSchema),
	authController.verifyEmail,
);

authRoutes.post(
	"/login",
	validateRequest(authValidation.loginUserSchema),
	authController.loginUser,
);

authRoutes.get("/me", auth(), authController.getMe);

authRoutes.post("/refresh-token", authController.refreshToken);

authRoutes.post("/logout", authController.logoutUser);

// @feature google
authRoutes.post(
	"/google",
	validateRequest(authValidation.googleLoginSchema),
	authController.googleLogin,
);
// @end

authRoutes.post(
	"/forgot-password",
	validateRequest(authValidation.forgotPasswordSchema),
	authController.forgotPassword,
);

authRoutes.post(
	"/reset-password",
	validateRequest(authValidation.resetPasswordSchema),
	authController.resetPassword,
);

authRoutes.post(
	"/change-password",
	auth(),
	validateRequest(authValidation.changePasswordSchema),
	authController.changePassword,
);
