import bcrypt from "bcryptjs";
import crypto from "crypto";
// @feature google
import type { TokenPayload } from "google-auth-library";
// @end
import httpStatus from "http-status";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
// @feature google
import { AuthProvider } from "../../../generated/prisma/enums";
// @end
import { UserRole, UserStatus } from "../../../generated/prisma/enums";
import config from "../../config";
// @feature google
import { googleClient } from "../../lib/googleAuth";
// @end
import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { redisClient } from "../../lib/redis";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { jwtUtils } from "../../utils/jwt";
import { sendEmail } from "../../utils/sendEmail";
import type {
	IChangePasswordPayload,
	IForgotPasswordPayload,
	// @feature google
	IGoogleLoginPayload,
	// @end
	ILoginUserPayload,
	IRegisterUserPayload,
	IResetPasswordPayload,
	IVerifyEmailPayload,
} from "./auth.interface";

const OTP_EXPIRATION_SECONDS = 5 * 60;

const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

const createAuthTokens = (user: {
	id: string;
	name: string;
	email: string;
	role: UserRole;
}) => {
	const jwtPayload = {
		id: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions["expiresIn"],
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions["expiresIn"],
	);

	return {
		accessToken,
		refreshToken,
	};
};

const checkUserCanLogin = (user: { status: UserStatus; isDeleted: boolean }) => {
	if (user.status === UserStatus.BLOCKED) {
		throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
	}

	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
	}
};

const registerUser = async (payload: IRegisterUserPayload) => {
	const { name, email, password } = payload;

	const isUserExists = await prisma.user.findUnique({
		where: { email },
	});

	if (isUserExists) {
		throw new AppError(httpStatus.CONFLICT, "User with this email already exists");
	}

	const hashedPassword = await bcrypt.hash(
		password,
		Number(config.bcrypt_salt_rounds),
	);

	const otpKey = `registration-otp:${email}`;
	const otpValue = generateOtp();

	await redisClient.set(otpKey, otpValue, {
		expiration: {
			type: "EX",
			value: OTP_EXPIRATION_SECONDS,
		},
	});

	const registrationKey = `registration-data:${email}`;
	const redisUserDataPayload = {
		name,
		email,
		password: hashedPassword,
	};

	await redisClient.set(registrationKey, JSON.stringify(redisUserDataPayload), {
		expiration: {
			type: "EX",
			value: OTP_EXPIRATION_SECONDS,
		},
	});

	await sendEmail({
		to: email,
		subject: "Email Verification",
		templateName: "registration-otp",
		templateData: {
			name,
			email,
			otp: otpValue,
			expirationMinutes: OTP_EXPIRATION_SECONDS / 60,
		},
	});
};

const verifyEmail = async (payload: IVerifyEmailPayload) => {
	const { email, otp } = payload;

	const isUserExist = await prisma.user.findUnique({
		where: { email },
	});

	if (isUserExist) {
		throw new AppError(httpStatus.CONFLICT, "Email Already Verified");
	}

	const otpKey = `registration-otp:${email}`;

	const redisOtp = await redisClient.get(otpKey);

	if (!redisOtp) {
		throw new AppError(httpStatus.BAD_REQUEST, "OTP Expired. Please register again");
	}

	if (redisOtp !== otp) {
		throw new AppError(httpStatus.BAD_REQUEST, "OTP Does Not Match");
	}

	const registrationKey = `registration-data:${email}`;

	const redisUserData = await redisClient.get(registrationKey);

	if (!redisUserData) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Registration Expired. Please register again",
		);
	}

	const userPayload: IRegisterUserPayload = JSON.parse(redisUserData);

	const user = await prisma.user.create({
		data: {
			name: userPayload.name,
			email: userPayload.email,
			password: userPayload.password,
			status: UserStatus.ACTIVE,
			emailVerified: true,
		},
		omit: { password: true },
	});

	await redisClient.del([otpKey, registrationKey]);

	try {
		await sendEmail({
			to: user.email,
			subject: `Welcome To ${config.app_name}`,
			templateName: "welcome",
			templateData: {
				name: user.name,
			},
		});
	} catch (error) {
		// the account exists; a failed welcome email must not fail the request
		logger.error({ err: error, userId: user.id }, "Failed to send welcome email");
	}

	const { accessToken, refreshToken } = createAuthTokens(user);

	return {
		user,
		accessToken,
		refreshToken,
	};
};

const loginUser = async (payload: ILoginUserPayload) => {
	const { email, password } = payload;

	const user = await prisma.user.findUnique({
		where: { email },
	});

	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid credentials");
	}

	checkUserCanLogin(user);

	if (user.password === null) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"User Already Has Account Registered With Google. Try To Login With Google.",
		);
	}

	const isPasswordMatched = await bcrypt.compare(password, user.password);

	if (!isPasswordMatched) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid credentials");
	}

	const { accessToken, refreshToken } = createAuthTokens(user);

	return {
		accessToken,
		refreshToken,
		needPasswordChange: user.needPasswordChange,
	};
};

const getMe = async (user: RequestUser) => {
	const isUserExists = await prisma.user.findUnique({
		where: {
			id: user.id,
		},
		omit: {
			password: true,
		},
	});

	if (!isUserExists) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	return isUserExists;
};

const refreshToken = async (token: string) => {
	const verifiedRefreshToken = jwtUtils.verifyToken(
		token,
		config.jwt_refresh_secret,
	);

	if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid refresh token");
	}

	const data = verifiedRefreshToken.data as JwtPayload;

	const user = await prisma.user.findUnique({
		where: { id: data.id },
	});

	if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
		throw new AppError(httpStatus.UNAUTHORIZED, "User is inactive or not found");
	}

	return createAuthTokens(user);
};

const forgotPassword = async (payload: IForgotPasswordPayload) => {
	const { email } = payload;

	const isUserExist = await prisma.user.findUnique({
		where: {
			email,
		},
	});

	if (!isUserExist) {
		throw new AppError(httpStatus.NOT_FOUND, "User Does Not Exist!");
	}

	checkUserCanLogin(isUserExist);

	if (isUserExist.password === null) {
		throw new AppError(httpStatus.BAD_REQUEST, "User Has Account With Google");
	}

	const otp = generateOtp();

	const key = `forgot-password-otp:${isUserExist.email}`;

	await redisClient.set(key, otp, {
		expiration: {
			type: "EX",
			value: OTP_EXPIRATION_SECONDS,
		},
	});

	await sendEmail({
		to: isUserExist.email,
		subject: "Forgot Password",
		templateName: "forgot-password",
		templateData: {
			name: isUserExist.name,
			otp,
			expirationMinutes: OTP_EXPIRATION_SECONDS / 60,
		},
	});
};

const resetPassword = async (payload: IResetPasswordPayload) => {
	const { email, otp, newPassword } = payload;

	const isUserExist = await prisma.user.findUnique({
		where: {
			email,
		},
	});

	if (!isUserExist) {
		throw new AppError(httpStatus.NOT_FOUND, "User Does Not Exist!");
	}

	checkUserCanLogin(isUserExist);

	const key = `forgot-password-otp:${isUserExist.email}`;

	const redisOtp = await redisClient.get(key);

	if (!redisOtp) {
		throw new AppError(httpStatus.BAD_REQUEST, "OTP Expired. Please request a new one");
	}

	if (redisOtp !== otp) {
		throw new AppError(httpStatus.BAD_REQUEST, "OTP Does Not Match");
	}

	const hashedNewPassword = await bcrypt.hash(
		newPassword,
		Number(config.bcrypt_salt_rounds),
	);

	await prisma.user.update({
		where: {
			id: isUserExist.id,
		},
		data: {
			password: hashedNewPassword,
			needPasswordChange: false,
		},
	});

	await redisClient.del(key);

	await sendEmail({
		to: isUserExist.email,
		subject: "Password Changed",
		templateName: "reset-password-success",
		templateData: {
			name: isUserExist.name,
		},
	});
};

const changePassword = async (
	user: RequestUser,
	payload: IChangePasswordPayload,
) => {
	const isUserExist = await prisma.user.findUnique({
		where: {
			id: user.id,
		},
	});

	if (!isUserExist) {
		throw new AppError(httpStatus.NOT_FOUND, "User Does Not Exist!");
	}

	if (isUserExist.password === null) {
		throw new AppError(httpStatus.BAD_REQUEST, "User Has Account With Google");
	}

	const isPasswordMatched = await bcrypt.compare(
		payload.currentPassword,
		isUserExist.password,
	);

	if (!isPasswordMatched) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Current password is incorrect");
	}

	const hashedNewPassword = await bcrypt.hash(
		payload.newPassword,
		Number(config.bcrypt_salt_rounds),
	);

	await prisma.user.update({
		where: {
			id: isUserExist.id,
		},
		data: {
			password: hashedNewPassword,
			needPasswordChange: false,
		},
	});
};

// @feature google
const googleLogin = async (payload: IGoogleLoginPayload) => {
	let googleIdTokenPayload: TokenPayload | null | undefined = null;
	try {
		const ticket = await googleClient.verifyIdToken({
			idToken: payload.idToken,
			audience: config.google_client_id,
		});

		googleIdTokenPayload = ticket.getPayload();
	} catch (error) {
		logger.warn({ err: error }, "Google ID Token Verification Failed");
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid Or Expired Google Id Token");
	}

	if (!googleIdTokenPayload) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid Or Expired Google Id Token");
	}

	if (!googleIdTokenPayload.email || !googleIdTokenPayload.email_verified) {
		throw new AppError(httpStatus.BAD_REQUEST, "Google Email Not Found");
	}
	if (!googleIdTokenPayload.name) {
		throw new AppError(httpStatus.BAD_REQUEST, "Google Email User Name Not Found");
	}

	const email = googleIdTokenPayload.email.toLowerCase();

	// 1. already linked to this Google account
	let user = await prisma.user.findUnique({
		where: {
			googleId: googleIdTokenPayload.sub,
		},
	});

	if (!user) {
		const isUserExistWithEmail = await prisma.user.findUnique({
			where: {
				email,
			},
		});

		if (isUserExistWithEmail) {
			// 2. same email registered with a password: link the Google account
			// Google login is only for the default self-registered role.
			if (isUserExistWithEmail.role !== UserRole.USER) {
				throw new AppError(
					httpStatus.FORBIDDEN,
					"This account must log in with email and password",
				);
			}

			checkUserCanLogin(isUserExistWithEmail);

			user = await prisma.user.update({
				where: {
					id: isUserExistWithEmail.id,
				},
				data: {
					googleId: googleIdTokenPayload.sub,
					emailVerified: true,
				},
			});
		} else {
			// 3. Google Register
			user = await prisma.user.create({
				data: {
					name: googleIdTokenPayload.name,
					email,
					googleId: googleIdTokenPayload.sub,
					authProvider: AuthProvider.GOOGLE,
					emailVerified: true,
				},
			});

			try {
				await sendEmail({
					to: user.email,
					subject: `Welcome To ${config.app_name}`,
					templateName: "welcome",
					templateData: {
						name: user.name,
					},
				});
			} catch (error) {
				logger.error({ err: error, userId: user.id }, "Failed to send welcome email");
			}
		}
	}

	checkUserCanLogin(user);

	return createAuthTokens(user);
};
// @end

export const authService = {
	registerUser,
	verifyEmail,
	loginUser,
	getMe,
	refreshToken,
	forgotPassword,
	resetPassword,
	changePassword,
	// @feature google
	googleLogin,
	// @end
};
