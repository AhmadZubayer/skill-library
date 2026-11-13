import z from "zod";

const passwordSchema = z
	.string()
	.min(8, "Password Must Minimum 8 Characters Long.")
	.regex(/[a-z]/, "Password must contain atleast 1 Lowercase Letter")
	.regex(/[A-Z]/, "Password must contain atleast 1 Uppercase Letter")
	.regex(/[0-9]/, "Password must contain atleast 1 Number")
	.regex(/[^A-Za-z0-9]/, "Password must contain atleast 1 Special Character");

const emailSchema = z.email("Invalid email address").trim().toLowerCase();

const registerUserSchema = z.object({
	name: z
		.string("Name must be a string")
		.trim()
		.min(3, "Name must be atleast 3 characters long")
		.max(50, "Name cannot exceed 50 characters"),
	email: emailSchema,
	password: passwordSchema,
});

const verifyEmailSchema = z.object({
	email: emailSchema,
	otp: z.string().length(6, "OTP must be 6 digits"),
});

const loginUserSchema = z.object({
	email: emailSchema,
	password: z.string().min(1, "Password is required"),
});

// @feature google
const googleLoginSchema = z.object({
	idToken: z.string().min(1, "Google ID token is required"),
});
// @end

const forgotPasswordSchema = z.object({
	email: emailSchema,
});

const resetPasswordSchema = z.object({
	email: emailSchema,
	newPassword: passwordSchema,
	otp: z.string().length(6, "OTP must be 6 digits"),
});

const changePasswordSchema = z.object({
	currentPassword: z.string().min(1, "Current password is required"),
	newPassword: passwordSchema,
});

export const authValidation = {
	registerUserSchema,
	verifyEmailSchema,
	loginUserSchema,
	// @feature google
	googleLoginSchema,
	// @end
	forgotPasswordSchema,
	resetPasswordSchema,
	changePasswordSchema,
};
