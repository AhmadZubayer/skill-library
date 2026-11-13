import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { Prisma } from "../../generated/prisma/client";
import config from "../config";
import { logger } from "../lib/logger";
import { AppError } from "../utils/AppError";

export const globalErrorHandler = (
	err: any,
	req: Request,
	res: Response,
	_next: NextFunction,
) => {
	let statusCode: number = httpStatus.INTERNAL_SERVER_ERROR;
	let errorMessage = "Internal Server Error";
	let errorDetails: unknown = null;

	if (err instanceof AppError) {
		statusCode = err.statusCode;
		errorMessage = err.message;
		errorDetails = err.errorDetails ?? null;
	} else if (err instanceof Prisma.PrismaClientValidationError) {
		statusCode = httpStatus.BAD_REQUEST;
		errorMessage = "You have provided incorrect field type or missing fields";
	} else if (err instanceof Prisma.PrismaClientKnownRequestError) {
		if (err.code === "P2002") {
			statusCode = httpStatus.CONFLICT;
			errorMessage = "Duplicate Key Error";
			errorDetails = err.meta ?? null;
		} else if (err.code === "P2003") {
			statusCode = httpStatus.BAD_REQUEST;
			errorMessage = "Foreign key constraint failed";
		} else if (err.code === "P2025") {
			statusCode = httpStatus.NOT_FOUND;
			errorMessage =
				"An operation failed because it depends on one or more records that were required but not found.";
		} else if (err.code === "P2034") {
			statusCode = httpStatus.CONFLICT;
			errorMessage = "Request conflicted with another request. Please try again";
		}
	} else if (err instanceof Prisma.PrismaClientInitializationError) {
		if (err.errorCode === "P1000") {
			errorMessage =
				"Authentication failed against database server. Please Check Your Credentials";
		} else if (err.errorCode === "P1001") {
			errorMessage = "Can't reach database server";
		}
	} else if (err instanceof Prisma.PrismaClientUnknownRequestError) {
		errorMessage = "Error occurred during query execution";
	} else if (err?.type === "entity.parse.failed") {
		statusCode = httpStatus.BAD_REQUEST;
		errorMessage = "Request body is not valid JSON";
	} else if (err?.name === "MulterError") {
		statusCode = httpStatus.BAD_REQUEST;
		errorMessage = err.message;
	} else if (err instanceof Error && config.node_env !== "production") {
		errorMessage = err.message;
	}

	if (statusCode >= httpStatus.INTERNAL_SERVER_ERROR) {
		// req.log is missing on routes mounted before pino-http (the Stripe webhook)
		(req.log ?? logger).error({ err }, "Request failed");
	}

	res.status(statusCode).json({
		success: false,
		statusCode,
		message: errorMessage,
		errorDetails:
			errorDetails ?? (config.node_env === "production" ? null : err?.stack),
	});
};
