export interface IRegisterUserPayload {
	name: string;
	email: string;
	password: string;
}

export interface IVerifyEmailPayload {
	email: string;
	otp: string;
}

export interface ILoginUserPayload {
	email: string;
	password: string;
}

// @feature google
export interface IGoogleLoginPayload {
	idToken: string;
}
// @end

export interface IForgotPasswordPayload {
	email: string;
}

export interface IResetPasswordPayload {
	email: string;
	newPassword: string;
	otp: string;
}

export interface IChangePasswordPayload {
	currentPassword: string;
	newPassword: string;
}
