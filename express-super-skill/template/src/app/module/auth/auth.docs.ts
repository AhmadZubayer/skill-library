/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Register and receive an email OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 3
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 description: Needs a lowercase letter, an uppercase letter, a number and a special character
 *     responses:
 *       201:
 *         description: Verification OTP sent to the email
 *       400:
 *         description: Validation failed
 *       409:
 *         description: User with this email already exists
 */

/**
 * @openapi
 * /api/auth/verify-email:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Verify the email OTP, create the account and log in
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               otp:
 *                 type: string
 *                 minLength: 6
 *                 maxLength: 6
 *     responses:
 *       201:
 *         description: Email verified; returns the user and both tokens, and sets the auth cookies
 *       400:
 *         description: OTP expired, OTP does not match, or validation failed
 *       409:
 *         description: Email already verified
 */

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Log in with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Returns the access and refresh tokens and sets the auth cookies
 *       400:
 *         description: Validation failed, or the account uses Google login
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: User is blocked or deleted
 */

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Get the profile of the logged-in user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile fetched successfully
 *       401:
 *         description: Access token is missing or invalid
 *       403:
 *         description: Account is blocked
 */

/**
 * @openapi
 * /api/auth/refresh-token:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Get a new access and refresh token using the refresh token cookie
 *     responses:
 *       200:
 *         description: New tokens generated successfully
 *       401:
 *         description: Refresh token is missing or invalid, or the user is inactive
 */

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Log out by clearing the auth cookies
 *     responses:
 *       200:
 *         description: User logged out successfully
 */

// @feature google
/**
 * @openapi
 * /api/auth/google:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Log in or register with a Google ID token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idToken]
 *             properties:
 *               idToken:
 *                 type: string
 *                 description: The credential returned by Google Identity Services on the frontend
 *     responses:
 *       200:
 *         description: Returns the access and refresh tokens and sets the auth cookies
 *       401:
 *         description: Invalid or expired Google ID token
 *       403:
 *         description: User is blocked or deleted, or the account must use email and password
 */
// @end

/**
 * @openapi
 * /api/auth/forgot-password:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Send a password reset OTP to the email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: OTP sent to the email
 *       400:
 *         description: Validation failed, or the account uses Google login
 *       403:
 *         description: User is blocked or deleted
 *       404:
 *         description: User does not exist
 */

/**
 * @openapi
 * /api/auth/reset-password:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Set a new password using the emailed OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp, newPassword]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               otp:
 *                 type: string
 *                 minLength: 6
 *                 maxLength: 6
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: OTP expired, OTP does not match, or validation failed
 *       404:
 *         description: User does not exist
 */

/**
 * @openapi
 * /api/auth/change-password:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Change the password while logged in
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Validation failed, or the account uses Google login
 *       401:
 *         description: Not logged in, or the current password is incorrect
 */
