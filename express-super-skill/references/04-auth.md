# 04 · Authentication

The auth module is scaffolded complete in `src/app/module/auth/`. This file explains how it works and how to adapt it. Read the scaffolded files alongside it.

## Flows

| Flow | Endpoint | What happens |
|---|---|---|
| **Register** | `POST /api/auth/register` | Validates the form, hashes the password with bcrypt, stores the pending user **and** a 6-digit OTP in Redis for 5 minutes, emails the OTP. Nothing is written to the database yet. |
| **Verify email** | `POST /api/auth/verify-email` | Checks the OTP, creates the user (`emailVerified: true`), sends a welcome email, logs the user in. |
| **Login** | `POST /api/auth/login` | Checks status and password, returns an access and a refresh token, in httpOnly cookies and in the body. |
| **Refresh** | `POST /api/auth/refresh-token` | Reads the refresh cookie, issues a new pair. |
| **Forgot password** | `POST /api/auth/forgot-password` | Stores an OTP in Redis for 5 minutes and emails it. |
| **Reset password** | `POST /api/auth/reset-password` | Checks the OTP, saves the new hash, deletes the OTP, emails a confirmation. |
| **Change password** | `POST /api/auth/change-password` | Logged in. Checks the current password, saves the new one. |
| **Google login** | `POST /api/auth/google` | Verifies the Google ID token, then finds, links or creates the user. |
| **Me / Logout** | `GET /api/auth/me`, `POST /api/auth/logout` | Profile without the password; clears both cookies. |

Users who never verify leave nothing behind: their Redis entries simply expire.

## Where each piece lives

| Piece | File |
|---|---|
| OTP generation, Redis keys, all flows | `module/auth/auth.service.ts` |
| Token pair creation | `createAuthTokens()` in the service. Payload: `{ id, name, email, role }` |
| Cookies | `utils/authCookies.ts`. `Secure` + `SameSite=None` in production, `SameSite=Lax` in development |
| Token signing and checking | `utils/jwt.ts`, `middleware/checkAuth.ts` |
| Password rules, email normalisation | `module/auth/auth.validation.ts` |
| Emails | `utils/sendEmail.ts` + `templates/*.ejs` |
| First admin | `prisma/seed.ts` |

## Passwords (bcrypt)

- **Hash** before storing: `await bcrypt.hash(password, Number(config.bcrypt_salt_rounds))`. The plain password is never stored, logged or put in Redis; the pending registration in Redis holds the hash.
- **Compare** at login: `await bcrypt.compare(plainPassword, user.password)`.
- The hash is never returned: queries that return a user use `omit: { password: true }`.
- Login answers "Invalid credentials" for both an unknown email and a wrong password, so it doesn't reveal which emails exist.

## Redis and OTPs

```ts
await redisClient.set(key, value, {
	expiration: {
		type: "EX",
		value: 5 * 60, // seconds
	},
});

const value = await redisClient.get(key); // string | null
await redisClient.del(key);
```

- Key names are `<purpose>:<identifier>`: `registration-otp:<email>`, `registration-data:<email>`, `forgot-password-otp:<email>`.
- OTPs come from `crypto.randomInt(100000, 1000000)`, never `Math.random`.
- An OTP is deleted as soon as it has been used.
- Use the same pattern for any other short-lived value (phone verification, invite codes).

## Sending an email

```ts
await sendEmail({
	to: user.email,
	subject: "Forgot Password",
	templateName: "forgot-password",
	templateData: {
		name: user.name,
		otp,
		expirationMinutes: 5,
	},
});
```

`templateName` is the file name in `src/app/templates/` without `.ejs`. `appName` is added automatically. Emails that are not essential to the request (welcome, receipts) go in `try/catch` with `logger.error`, so a mail failure doesn't fail the request.

## Adapting it

- **Extra registration fields** (phone, address): add them to `registerUserSchema`, `IRegisterUserPayload`, the `redisUserDataPayload` object in `registerUser`, and the `prisma.user.create` call in `verifyEmail`.
- **A profile table per role** (for example a `Customer` row for every user): add a nested create to the `prisma.user.create` calls in `verifyEmail` and `googleLogin`:

  ```ts
  customer: {
  	create: {
  		name: userPayload.name,
  		email: userPayload.email,
  	},
  },
  ```

- **Accounts created by an admin** (staff, sellers): create them in that module's service with a generated password, `needPasswordChange: true` and `emailVerified: true`, and email the password. They change it through `change-password`. Login returns `needPasswordChange` so the frontend can force that.
- **Renamed default role:** if the enum's default value isn't `USER`, change `UserRole.USER` in `googleLogin`.
- **Token lifetimes:** change `JWT_*_EXPIRES_IN` in `.env` and the two `maxAge` values in `utils/authCookies.ts` together.

## Google login

1. The frontend signs the user in with Google Identity Services and receives `response.credential`, a Google **ID token**.
2. It posts `{ "idToken": "<credential>" }` to `POST /api/auth/google` with `credentials: "include"`.
3. `googleLogin` verifies the token against `GOOGLE_CLIENT_ID`, then: finds the user by `googleId` (Google's stable `sub`), or links an existing password account with the same email, or creates a new user. Only the default self-registered role may use Google; other roles are told to use their password.

The user must create an OAuth client ID of type **Web application** in Google Cloud Console, add the frontend origin (for example `http://localhost:3000`) under **Authorized JavaScript origins**, and give you the Client ID. The frontend must use the same Client ID.

A page for getting a real ID token while testing (serve it from an authorized origin, for example `npx serve -l 3000 .`):

```html
<!doctype html>
<html>
  <body>
    <script src="https://accounts.google.com/gsi/client" async></script>
    <div id="g_id_onload"
         data-client_id="YOUR_GOOGLE_CLIENT_ID"
         data-callback="handleCredential"></div>
    <div class="g_id_signin" data-type="standard"></div>
    <script>
      function handleCredential(response) {
        // response.credential is the Google ID token to send as { idToken }
        console.log(response.credential);
      }
    </script>
  </body>
</html>
```

## Protecting routes

```ts
import { UserRole } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";

categoryRoutes.get("/mine", auth(), categoryController.getMine);            // any logged-in user
adminCategoryRoutes.post("/", auth(UserRole.ADMIN), categoryController.createCategory);
```

In the controller the user is `req.user` (`{ id, name, email, role }`). Pass `req.user.id` to the service and use it in the `where`, so users reach only their own rows.

## Testing

1. `POST /api/auth/register` → `201 "Verification OTP Sent"`; the OTP arrives by email.
2. `POST /api/auth/verify-email` with email + otp → `201`, tokens in the body and two `Set-Cookie` headers.
3. `POST /api/auth/login` → `200` with tokens. A wrong password → `401 "Invalid credentials"`.
4. `GET /api/auth/me` with `Authorization: Bearer <accessToken>` → the user without `password`.
5. `POST /api/auth/forgot-password`, then `POST /api/auth/reset-password` with the emailed OTP → login works with the new password; the OTP can't be reused.
6. `npm run db:seed` creates the admin; log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
