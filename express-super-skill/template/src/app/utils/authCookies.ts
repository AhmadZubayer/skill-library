import type { CookieOptions, Response } from "express";
import config from "../config";

const isProduction = config.node_env === "production";

const cookieOptions: CookieOptions = {
	httpOnly: true,
	secure: isProduction,
	sameSite: isProduction ? "none" : "lax",
};

export const setAuthCookies = (
	res: Response,
	accessToken: string,
	refreshToken: string,
) => {
	res.cookie("accessToken", accessToken, {
		...cookieOptions,
		maxAge: 1000 * 60 * 60 * 24, // 24 hour or 1 day
	});
	res.cookie("refreshToken", refreshToken, {
		...cookieOptions,
		maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
	});
};

export const clearAuthCookies = (res: Response) => {
	res.clearCookie("accessToken", cookieOptions);
	res.clearCookie("refreshToken", cookieOptions);
};
