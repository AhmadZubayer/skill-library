export class AppError extends Error {
	public statusCode: number;
	public errorDetails?: unknown;

	constructor(statusCode: number, message: string, errorDetails?: unknown) {
		super(message); // throw new Error(message)

		this.statusCode = statusCode;
		this.errorDetails = errorDetails;

		Error.captureStackTrace(this, this.constructor);
	}
}

//throw new AppError(404, "Not Found")
