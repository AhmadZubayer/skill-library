import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { type UserRole, UserStatus } from "../../generated/prisma/enums";
import config from "../config";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import { jwtUtils } from "../utils/jwt";

export interface RequestUser {
	id: string;
	name: string;
	email: string;
	role: UserRole;
}

declare global {
	namespace Express {
		interface Request {
			user?: RequestUser;
		}
	}
}

// auth(UserRole.ADMIN, UserRole.USER)
// auth() => any logged-in user
export const auth = (...requiredRoles: UserRole[]) => {
	return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
		const authorization = req.headers.authorization;
		const token =
			req.cookies?.accessToken ||
			(authorization?.startsWith("Bearer ")
				? authorization.split(" ")[1]
				: authorization);

		if (typeof token !== "string" || !token) {
			throw new AppError(
				httpStatus.UNAUTHORIZED,
				"You are not logged in. Please log in to access this resource.",
			);
		}

		const verifiedToken = jwtUtils.verifyToken(token, config.jwt_access_secret);
		const decoded = verifiedToken.data;

		if (
			!verifiedToken.success ||
			typeof decoded !== "object" ||
			decoded === null ||
			typeof decoded.id !== "string"
		) {
			throw new AppError(httpStatus.UNAUTHORIZED, "Invalid or expired access token");
		}

		const user = await prisma.user.findUnique({
			where: {
				id: decoded.id,
			},
		});

		if (!user || user.isDeleted || user.status === UserStatus.DELETED) {
			throw new AppError(httpStatus.UNAUTHORIZED, "User not found. Please log in again.");
		}

		if (user.status === UserStatus.BLOCKED) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"Your account has been blocked. Please contact support.",
			);
		}

		if (requiredRoles.length && !requiredRoles.includes(user.role)) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"Forbidden. You don't have permission to access this resource.",
			);
		}

		req.user = {
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role,
		};

		next();
	});
};
