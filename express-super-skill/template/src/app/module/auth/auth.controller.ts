import type { Request, Response } from "express";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { clearAuthCookies, setAuthCookies } from "../../utils/authCookies";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { authService } from "./auth.service";

const registerUser = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;

	await authService.registerUser(payload);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Verification OTP Sent",
		data: null,
	});
});

const verifyEmail = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;

	const result = await authService.verifyEmail(payload);

	const { accessToken, refreshToken, user } = result;

	setAuthCookies(res, accessToken, refreshToken);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Email Verified Successfully",
		data: {
			accessToken,
			refreshToken,
			user,
		},
	});
});

const loginUser = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;

	const result = await authService.loginUser(payload);

	const { accessToken, refreshToken, needPasswordChange } = result;

	setAuthCookies(res, accessToken, refreshToken);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User logged in successfully",
		data: {
			accessToken,
			refreshToken,
			needPasswordChange,
		},
	});
});

const getMe = catchAsync(async (req: Request, res: Response) => {
	if (!req.user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "User information is missing in the request");
	}

	const result = await authService.getMe(req.user);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User profile fetched successfully",
		data: result,
	});
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
	if (!req.cookies.refreshToken) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Refresh token is missing");
	}

	const result = await authService.refreshToken(req.cookies.refreshToken);

	const { accessToken, refreshToken: newRefreshToken } = result;

	setAuthCookies(res, accessToken, newRefreshToken);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "New tokens generated successfully",
		data: {
			accessToken,
			refreshToken: newRefreshToken,
		},
	});
});

// @feature google
const googleLogin = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;

	const result = await authService.googleLogin(payload);

	const { accessToken, refreshToken } = result;

	setAuthCookies(res, accessToken, refreshToken);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User logged in successfully",
		data: {
			accessToken,
			refreshToken,
		},
	});
});
// @end

const forgotPassword = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;

	await authService.forgotPassword(payload);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: `OTP Sent To Email : ${payload.email}`,
		data: null,
	});
});

const resetPassword = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;

	await authService.resetPassword(payload);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Password Changed Successfully",
		data: null,
	});
});

const changePassword = catchAsync(async (req: Request, res: Response) => {
	if (!req.user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "User information is missing in the request");
	}

	await authService.changePassword(req.user, req.body);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Password Changed Successfully",
		data: null,
	});
});

const logoutUser = catchAsync(async (req: Request, res: Response) => {
	clearAuthCookies(res);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User logged out successfully",
		data: null,
	});
});

export const authController = {
	registerUser,
	verifyEmail,
	loginUser,
	getMe,
	refreshToken,
	// @feature google
	googleLogin,
	// @end
	forgotPassword,
	resetPassword,
	changePassword,
	logoutUser,
};
