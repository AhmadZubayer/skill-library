---
name: google-auth-express-prisma
description: Add "Sign in with Google" (Google ID-token login) to an Express + TypeScript + Prisma + PostgreSQL backend using the exact, working code from the PH Healthcare backend — the Prisma User/Patient schema changes, lib/googleAuth.ts, config, JWT utils, error handling, the auth service/controller/route for POST /api/v1/auth/google, the welcome email, the packages, and the .env variables it needs (asking the user for any that are missing). Use this skill whenever the user wants Google login, Google sign-in, Google OAuth, "login with Gmail", social login, or to verify a Google idToken / credential on a Node or Express or Prisma API, even if they don't name the skill or the files.
---

# Google ID-token login for Express + Prisma

This skill adds a `POST /api/v1/auth/google` endpoint. The frontend signs the user in with Google (Google Identity Services), receives an **ID token** (a JWT signed by Google), and posts `{ "idToken": "..." }`. The backend then:

1. verifies the token with `google-auth-library` against `GOOGLE_CLIENT_ID`;
2. looks up the user by Google's stable `sub` claim (`googleId`). If none, it links an existing email/password **patient** with the same email. If none, it creates a new `PATIENT` user plus `Patient` row and sends a welcome email;
3. rejects blocked or deleted users;
4. issues the app's own access and refresh JWTs, as httpOnly cookies **and** in the response body.

Google login is **patient-only** in this design. Only users with role `PATIENT` are matched or created; doctors and admins keep using email and password.

All code below is copied verbatim from the PH Healthcare backend (branch `module-42`): Express 5, TypeScript ESM, Prisma 7 with the `@prisma/adapter-pg` driver adapter, multi-file Prisma schema. Keep it verbatim unless the target project forces a change. If you change something, tell the user what and why.

## Contents

0. Workflow
1. Required `.env` variables (check first, ask for missing ones)
2. Packages
3. File map
4. Code, in order (4.1 to 4.16)
5. Run and test
6. Known caveats in the original code

---

## 0. Workflow

1. **Survey the target project first.** Find the source root and any existing equivalents: a Prisma client file, an error class, a JWT helper, an auth module, a mailer, an Express app file. This skill assumes the `src/app/...` layout in section 3. If the project is laid out differently, put each piece at its equivalent location, fix the relative imports, and tell the user the mapping you used.
2. **Never blindly overwrite an existing file.** For each file in the map:
   - If it doesn't exist, create it from the snippet.
   - If it does exist, merge in only what's missing (an import, a config key, a model field, an enum, a route, an exported function).
   
   Existing auth flows such as register and login must keep working. The snippets are written so each file can be created on its own or merged.
3. **Check `.env` before writing any code** (section 1). Ask the user for anything missing, wait for the answer, then write the values to `.env`.
4. Install missing packages (section 2). Apply the code in order (section 4). Run the migration and `prisma generate` (end of 4.3). Then type-check and test (section 5).
5. Finish with a short report:
   - files created and files modified;
   - env variable **names** added (never echo secret values);
   - commands run and their result;
   - what the user still has to do themselves (for example, adding Authorized JavaScript origins in Google Cloud Console);
   - the caveats from section 6 that apply.

---

## 1. Required `.env` variables

Read `.env` in the project root, and `.env.example` if present. Report each variable below as present, missing, or empty. Don't print secret values in chat.

| Variable | Used by | What it is / default |
|---|---|---|
| `GOOGLE_CLIENT_ID` | `lib/googleAuth.ts`, the `audience` check in `verifyIdToken` | OAuth 2.0 **Web application** client ID from Google Cloud Console, ending in `.apps.googleusercontent.com`. It must be the same client ID the frontend uses, otherwise every token fails the audience check. No default. |
| `DATABASE_URL` | Prisma (`prisma.config.ts`, `lib/prisma.ts`) | `postgresql://USER:PASSWORD@localhost:5432/DBNAME?schema=public` |
| `JWT_ACCESS_SECRET` | `jwtUtils.createToken` (access token) | long random string |
| `JWT_REFRESH_SECRET` | `jwtUtils.createToken` (refresh token) | long random string, different from the access secret |
| `JWT_ACCESS_EXPIRES_IN` | access token lifetime | `1d` |
| `JWT_REFRESH_EXPIRES_IN` | refresh token lifetime | `7d` |
| `SMTP_USER` | `lib/nodemailer.ts` (Gmail transport) | the Gmail address that sends mail |
| `SMTP_PASSWORD` | `lib/nodemailer.ts` | a Gmail **App Password** (16 characters; the account needs 2-Step Verification), not the normal Gmail password |
| `EMAIL_SENDER` | `from:` of the welcome email | usually the same as `SMTP_USER` |
| `FRONTEND_URL` | CORS `origin` in `app.ts` | `http://localhost:3000` |
| `NODE_ENV` | `globalErrorHandler` (detail level) | `development` |
| `PORT` | `server.ts` | `5000` |

**If any are missing or empty, stop and ask the user before writing code.** Use one message that lists every missing name with its hint from the table. Some variables need extra handling:

- **`GOOGLE_CLIENT_ID`**: there is no default; the user has to create one. Tell them how:
  1. Open Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID → **Web application**.
  2. Under **Authorized JavaScript origins**, add the frontend origin, for example `http://localhost:3000` and `http://localhost`.
  3. Copy the Client ID.
- **JWT secrets**: ask for them, but offer to generate random ones if the user prefers, with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, run once for each secret.
- **SMTP variables**: the welcome email needs them, and so does `transporter.verify()` at startup. If the user doesn't want email, they can skip it. In that case, remove the welcome-email block inside `googleLogin` (marked in 4.11) and the `transporter.verify()` lines in `server.ts` (4.15), and don't create `lib/nodemailer.ts` or the template. Ask the user which they want rather than deciding for them.
- **`NODE_ENV`, `PORT`, `FRONTEND_URL`, `JWT_*_EXPIRES_IN`**: suggest the defaults above and use them if the user agrees.

Once you have the values:

1. Write them into `.env`.
2. Add the same variable **names** with placeholder values to `.env.example`, creating it if it doesn't exist. Real secrets never go in `.env.example`.
3. Make sure `.gitignore` contains `.env` and `/src/generated`.

Shape of the block to add to `.env`:

```env
NODE_ENV=development
PORT=5000

DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/DBNAME?schema=public"

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=1d
JWT_REFRESH_EXPIRES_IN=7d

# Allowed CORS origin for the browser client.
FRONTEND_URL=http://localhost:3000

GOOGLE_CLIENT_ID=

SMTP_USER=
SMTP_PASSWORD=
EMAIL_SENDER=
```

---

## 2. Packages

Check `package.json` and install only what's missing.

```bash
npm install google-auth-library jsonwebtoken http-status ejs nodemailer express cookie-parser cors dotenv @prisma/client @prisma/adapter-pg pg
```

```bash
npm install -D prisma typescript tsx @types/node @types/express @types/jsonwebtoken @types/ejs @types/nodemailer @types/cookie-parser @types/cors @types/pg
```

Versions the original code was built and run with:

| Package | Version | Role in Google login |
|---|---|---|
| `google-auth-library` | ^11.0.0 | `OAuth2Client.verifyIdToken()` checks the Google ID token |
| `jsonwebtoken` | ^9.0.3 | the app's own access and refresh tokens |
| `http-status` | ^2.1.0 | status code constants |
| `ejs` | ^6.0.1 | renders the welcome email template |
| `nodemailer` | ^9.0.5 | sends the welcome email |
| `express` | ^5.2.1 | HTTP server |
| `cookie-parser` | ^1.4.7 | reads token cookies |
| `cors` | ^2.8.6 | CORS with `credentials: true` so cookies cross origins |
| `dotenv` | ^17.4.2 | loads `.env` |
| `@prisma/client`, `@prisma/adapter-pg`, `prisma` | ^7.9.1 | Prisma 7 client + Postgres driver adapter + CLI |
| `pg` | ^8.22.0 | Postgres driver used by the adapter |
| `tsx` | ^4.23.1 | dev runner (`tsx watch`) |
| `typescript` | ^7.0.2 | type-check / build |
| `@types/*` | matching | typings |

`package.json` needs `"type": "module"` (the code is ESM) and these scripts:

```json
"type": "module",
"scripts": {
  "dev": "tsx watch src/server.ts",
  "build": "tsc",
  "start": "node dist/src/server.js"
}
```

---

## 3. File map

```
project-root/
├── .env                                   ← section 1
├── .env.example                           ← section 1 (names + placeholders only)
├── package.json                           ← section 2
├── tsconfig.json                          ← 4.1
├── prisma.config.ts                       ← 4.2
├── prisma/
│   ├── schema/
│   │   ├── schema.prisma                  ← 4.2  generator + datasource
│   │   ├── enums.prisma                   ← 4.3  Role, UserStatus, AuthProvider
│   │   ├── user.prisma                    ← 4.3  User (googleId, authProvider, password nullable)
│   │   └── patient.prisma                 ← 4.3  Patient (1-1 with User)
│   └── migrations/                        ← created by `prisma migrate dev`
└── src/
    ├── server.ts                          ← 4.15 boot: DB connect, mail verify, listen
    ├── app.ts                             ← 4.14 middleware + mount /api/v1/auth
    ├── generated/prisma/                  ← created by `prisma generate` (git-ignored)
    └── app/
        ├── config/index.ts                ← 4.5  env → typed config object
        ├── lib/
        │   ├── prisma.ts                  ← 4.4  PrismaClient with pg adapter
        │   ├── googleAuth.ts              ← 4.7  Google OAuth2Client  ★
        │   └── nodemailer.ts              ← 4.8  Gmail transporter
        ├── utils/
        │   ├── AppError.ts                ← 4.6
        │   ├── catchAsync.ts              ← 4.6
        │   ├── sendResponse.ts            ← 4.6
        │   └── jwt.ts                     ← 4.6
        ├── middleware/
        │   ├── globalErrorHandler.ts      ← 4.6
        │   └── notFound.ts                ← 4.6
        ├── templates/
        │   └── patient-welcome-email.ejs  ← 4.9
        └── module/auth/
            ├── auth.interface.ts          ← 4.10 IGoogleLoginPayload
            ├── auth.service.ts            ← 4.11 googleLogin()  ★
            ├── auth.controller.ts         ← 4.12 googleLogin handler (sets cookies)
            └── auth.route.ts              ← 4.13 POST /google
```

★ = the Google-specific core. Everything else is supporting infrastructure that many projects already have; reuse theirs where it exists and is equivalent.

---

## 4. Code, in order

### 4.1 `tsconfig.json` (create if missing)

`"moduleResolution": "bundler"` is what lets the imports below leave off the `.js` extension under `tsx`.

```json
{
    "compilerOptions": {
        "module": "esnext",
        "moduleResolution": "bundler",
        "target": "es2023",
        "rootDir": "./",
        "outDir": "./dist",
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true,
        "ignoreDeprecations": "5.0"
    },
    "include": ["src", "prisma.config.ts"],
    "exclude": ["node_modules", "dist"]
}
```

### 4.2 Prisma config: `prisma.config.ts` and `prisma/schema/schema.prisma`

Prisma 7 reads the connection URL from `prisma.config.ts`, not from the schema. `schema: 'prisma/schema'` turns on the multi-file schema folder. The generator writes the client to `src/generated/prisma`, which is why the app imports from `generated/prisma/...`.

**File:** `prisma.config.ts` (project root)

```ts
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
    schema: 'prisma/schema',
    migrations: {
        path: 'prisma/migrations',
    },
    datasource: {
        url: env('DATABASE_URL'),
    },
})
```

**File:** `prisma/schema/schema.prisma`

```prisma
// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

// Looking for ways to speed up your queries, or scale easily with your serverless or edge functions?
// Try Prisma Accelerate: https://pris.ly/cli/accelerate-init

generator client {
  provider = "prisma-client"
  output   = "../../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

### 4.3 Prisma models: `enums.prisma`, `user.prisma`, `patient.prisma`

Google login depends on these fields:

- `User.googleId String? @unique`: Google's `sub` claim.
- `User.authProvider AuthProvider @default(CREDENTIAL)`.
- `User.password String?`: nullable, because Google-only users have no password.
- `User.emailVerified`, `role`, `status` and `isDeleted`.
- The 1-to-1 `Patient` relation.

If the project already has a `User` model, merge these fields in rather than replacing the model.

**File:** `prisma/schema/enums.prisma` (excerpt, only the enums Google login uses)

```prisma
enum Role {
  SUPER_ADMIN
  ADMIN
  DOCTOR
  PATIENT
}

enum UserStatus {
  ACTIVE
  BLOCKED
  DELETED
}

enum AuthProvider {
  GOOGLE
  CREDENTIAL
}
```

**File:** `prisma/schema/user.prisma`

The original also has a `doctor Doctor?` relation line under `patient Patient?`. Add it back only if the project has a `Doctor` model; otherwise the schema won't validate.

```prisma
model User {
  id                 String       @id @default(uuid())
  name               String
  email              String
  password           String?
  googleId           String?      @unique
  authProvider       AuthProvider @default(CREDENTIAL)
  emailVerified      Boolean      @default(false)
  role               Role         @default(PATIENT)
  status             UserStatus   @default(ACTIVE)
  needPasswordChange Boolean      @default(false)
  imageUrl           String       @default("")
  imagePublicId      String       @default("")
  isDeleted          Boolean      @default(false)
  deletedAt          DateTime?
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt
  patient            Patient?

  @@unique([email])
  @@map("users")
}
```

**File:** `prisma/schema/patient.prisma`

The original also has `appointments Apppointment[]` above the indexes. Add it only if the project has that model.

```prisma
model Patient {
  id String @id @default(uuid(7))

  name          String
  email         String    @unique
  contactNumber String?
  address       String?
  isDeleted     Boolean   @default(false)
  deletedAt     DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  //relations
  userId String @unique
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  
  @@index([email], name: "idx_patient_email")
  @@index([isDeleted], name: "idx_patient_isDeleted")
  @@map("patients")
}
```

Then run:

```bash
npx prisma migrate dev --name google_auth
```

```bash
npx prisma generate
```

For reference, this is the migration Prisma generated when these Google fields were added to an existing `users` table:

```sql
/*
  Warnings:

  - A unique constraint covering the columns `[googleId]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE', 'CREDENTIAL');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "authProvider" "AuthProvider" NOT NULL DEFAULT 'CREDENTIAL',
ADD COLUMN     "googleId" TEXT,
ALTER COLUMN "password" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");
```

`prisma generate` must run again after any schema change. Almost every file imports from `src/generated/prisma`, so nothing compiles until it has run.

### 4.4 `src/app/lib/prisma.ts` (create if missing)

```ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export { prisma };
```

### 4.5 `src/app/config/index.ts`

This is an excerpt with only the keys Google login needs. If the file exists, add the missing keys and leave the rest alone.

```ts
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export default {
	node_env: process.env.NODE_ENV,
	port: process.env.PORT,
	database_url: process.env.DATABASE_URL,
	frontend_url: process.env.FRONTEND_URL,
	jwt_access_secret: process.env.JWT_ACCESS_SECRET!,
	jwt_refresh_secret: process.env.JWT_REFRESH_SECRET!,
	jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN!,
	jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN!,
	google_client_id: process.env.GOOGLE_CLIENT_ID!,
	smtp_user: process.env.SMTP_USER!,
	smtp_password: process.env.SMTP_PASSWORD!,
	email_sender: process.env.EMAIL_SENDER!,
};
```

### 4.6 Shared utils and middleware (create any that are missing)

`googleLogin` throws `AppError`, and the global error handler turns those errors into JSON responses. The controller relies on `catchAsync` and `sendResponse`. `jwtUtils` signs the app's own tokens.

**File:** `src/app/utils/AppError.ts`

```ts

export class AppError extends Error {

    public statusCode : number

    constructor(statusCode : number , message : string, stack = "") {
        super(message) // throw new Error(message)

        this.statusCode = statusCode

        if(stack){
            this.stack = stack
        }else{
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

//throw new AppError(404, "Not Found")
```

**File:** `src/app/utils/catchAsync.ts`

```ts
import type { NextFunction, Request, RequestHandler, Response } from "express";

export const catchAsync = (fn: RequestHandler) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		try {
			await fn(req, res, next);
		} catch (error) {
			// console.log(error);

			// res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
			//     success: false,
			//     statusCode: httpStatus.INTERNAL_SERVER_ERROR,
			//     message: "Failed to register user",
			//     error: (error as Error).message
			// })

			next(error);
		}
	};
};
```

**File:** `src/app/utils/sendResponse.ts`

```ts
import type { Response } from "express";

type TMeta = {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
};

type TResponseData<T> = {
	success: boolean;
	statusCode: number;
	message: string;
	data: T;
	meta?: TMeta;
};

export const sendResponse = <T>(res: Response, data: TResponseData<T>) => {
	res.status(data.statusCode).json({
		success: data.success,
		statusCode: data.statusCode,
		message: data.message,
		data: data.data,
		meta: data.meta,
	});
};
```

**File:** `src/app/utils/jwt.ts`

```ts
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";

const createToken = (
	payload: JwtPayload,
	secret: string,
	expiresIn: SignOptions,
) => {
	const token = jwt.sign(payload, secret, {
		expiresIn,
	} as SignOptions);

	return token;
};

const verifyToken = (token: string, secret: string) => {
	try {
		const verifiedToken = jwt.verify(token, secret);
		return {
			success: true,
			data: verifiedToken,
		};
	} catch (error: any) {
		console.log("Token verification failed:", error);
		return {
			success: false,
			error: error.message,
		};
	}
};

export const jwtUtils = {
	createToken,
	verifyToken,
};
```

**File:** `src/app/middleware/globalErrorHandler.ts`

```ts
import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { Prisma } from "../../generated/prisma/client";
import config from "../config";
import { AppError } from "../utils/AppError";

export const globalErrorHandler = async (
	err: any,
	_req: Request,
	res: Response,
	_next: NextFunction,
) => {
	if (config.node_env === "development") {
		console.log("Error from Global Error Handler", err);
	}

	let statusCode: number = httpStatus.INTERNAL_SERVER_ERROR;
	let errorMessage = err.message || "Internal Server Error";
	const errorName = err.name || "Internal Server Error";
	// let errorDetails = err.stack

	if (err instanceof Prisma.PrismaClientValidationError) {
		statusCode = httpStatus.BAD_REQUEST;
		errorMessage = "You have provided incorrect field type or missing fields";
	} else if (err instanceof Prisma.PrismaClientKnownRequestError) {
		if (err.code === "P2002") {
			(statusCode = httpStatus.BAD_REQUEST),
				(errorMessage = "Duplicate Key Error");
		} else if (err.code === "P2003") {
			(statusCode = httpStatus.BAD_REQUEST),
				(errorMessage = "Foreign key constraint failed");
		} else if (err.code === "P2025") {
			(statusCode = httpStatus.BAD_REQUEST),
				(errorMessage =
					"An operation failed because it depends on one or more records that were required but not found.");
		}
	} else if (err instanceof Prisma.PrismaClientInitializationError) {
		if (err.errorCode === "P1000") {
			statusCode = httpStatus.UNAUTHORIZED;
			errorMessage =
				"Authentication failed against database server. Please Check Your Credentials";
		} else if (err.errorCode === "P1001") {
			statusCode = httpStatus.BAD_REQUEST;
			errorMessage = "Can't reach database server";
		}
	} else if (err instanceof Prisma.PrismaClientUnknownRequestError) {
		statusCode = httpStatus.INTERNAL_SERVER_ERROR;
		errorMessage = "Error occurred during query execution";
	} else if( err instanceof AppError){
		errorMessage = err.message
		statusCode = err.statusCode

	} else if (err instanceof Error) {
		errorMessage = err.message;
	}

	res.status(statusCode).json({
		success: false,
		statusCode: statusCode || httpStatus.INTERNAL_SERVER_ERROR,
		name:
			config.node_env === "development" ? errorName : "Internal Server Error",
		message:
			config.node_env === "development"
				? errorMessage
				: "Internal Server Error",
		error: config.node_env === "development" ? err : undefined,
		stack: config.node_env === "development" ? err.stack : undefined,
	});
};
```

**File:** `src/app/middleware/notFound.ts`

```ts
import type { Request, Response } from "express";
import httpStatus from "http-status";

export const notFound = (req: Request, res: Response) => {
	res.status(httpStatus.NOT_FOUND).json({
		message: "Route not found",
		path: req.originalUrl,
		date: new Date(),
	});
};
```

### 4.7 `src/app/lib/googleAuth.ts` ★

This is one shared `OAuth2Client`, and it's the only file in `lib/` that is specific to Google. (`client_id` is a valid option in google-auth-library v11; it's an alias of `clientId`.)

```ts
import { OAuth2Client } from "google-auth-library";
import config from "../config";

export const googleClient = new OAuth2Client({
	client_id: config.google_client_id,
});
```

### 4.8 `src/app/lib/nodemailer.ts` (needed only for the welcome email)

```ts
import nodemailer from "nodemailer";
import config from "../config";

export const transporter = nodemailer.createTransport({
	service: "gmail",
	auth: {
		user: config.smtp_user,
		pass: config.smtp_password,
	},
});
```

### 4.9 `src/app/templates/patient-welcome-email.ejs` (needed only for the welcome email)

The service loads this file at runtime from `process.cwd()`. The path has to stay exactly `src/app/templates/patient-welcome-email.ejs` relative to the project root, or you have to change the path in `googleLogin` to match. Replace "PH Healthcare System" with the target project's name if the user wants.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Welcome</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f7f7f7; color: #333; }
      .container { max-width: 500px; margin: 40px auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
      .footer { margin-top: 30px; font-size: 12px; color: #888; }
    </style>
  </head>
  <body>
    <div class="container">
      <h2>Welcome to PH Healthcare System, <%= name %>!</h2>
      <p>Thanks for joining PH Healthcare System. Your account has been created successfully.</p>
      <p>You can now book appointments, consult with doctors, and manage your health records all in one place.</p>
      <div class="footer">&copy; PH Healthcare System. All rights reserved.</div>
    </div>
  </body>
</html>
```

### 4.10 `src/app/module/auth/auth.interface.ts`

Add this interface (excerpt):

```ts
export interface IGoogleLoginPayload {
	idToken: string;
}
```

### 4.11 `src/app/module/auth/auth.service.ts` ★

**Imports.** If the file already exists, merge these with its existing imports.

```ts
import ejs from "ejs";
import type { TokenPayload } from "google-auth-library";
import httpStatus from "http-status";
import type { SignOptions } from "jsonwebtoken";
import path from "path";
import { AuthProvider, Role, UserStatus } from "../../../generated/prisma/enums";
import config from "../../config";
import { googleClient } from "../../lib/googleAuth";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { jwtUtils } from "../../utils/jwt";
import type { IGoogleLoginPayload } from "./auth.interface";
```

**The function.** It resolves the user in this order:

1. existing Google patient, matched by email + `PATIENT` + `googleId`;
2. existing credential patient with the same email: checks verified, not blocked, not deleted, then links `googleId`;
3. otherwise registers a new patient.

The **welcome-email block** sits in the `else` branch. It starts at `const tempatePath = ...` and ends at the `transporter.sendMail(...)` call. If the user chose to skip email (section 1), delete that block and the `ejs`, `path` and `transporter` imports.

```ts
const googleLogin = async (payload: IGoogleLoginPayload) => {
	let googleIdTokenPayload: TokenPayload | null | undefined = null;
	try {
		const ticket = await googleClient.verifyIdToken({
			idToken: payload.idToken,
			audience: config.google_client_id,
		});

		googleIdTokenPayload = ticket.getPayload();
	} catch (error) {
		console.log("Google ID Token Verification Failed", error);
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid Or Expired Google Id Token");
	}

	if (!googleIdTokenPayload) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid Or Expired Google Id Token");
	}

	if (!googleIdTokenPayload.email) {
		throw new AppError(httpStatus.BAD_REQUEST, "Google Email Not Found");
	}
	if (!googleIdTokenPayload.name) {
		throw new AppError(httpStatus.BAD_REQUEST, "Google Email User Name Not Found");
	}

	const ifPatientExistWithGoogleAuth = await prisma.user.findUnique({
		where: {
			email: googleIdTokenPayload.email,
			role: Role.PATIENT,
			googleId: googleIdTokenPayload.sub,
		},
	});

	let user = ifPatientExistWithGoogleAuth;

	if (!ifPatientExistWithGoogleAuth) {
		const ifPatientExistWithCredentials = await prisma.user.findUnique({
			where: {
				email: googleIdTokenPayload.email,
				role: Role.PATIENT,
				authProvider: AuthProvider.CREDENTIAL,
			},
		});

		if (ifPatientExistWithCredentials) {
			if (!ifPatientExistWithCredentials.emailVerified) {
				throw new AppError(httpStatus.FORBIDDEN, "Email Not Verified");
			}

			if (ifPatientExistWithCredentials.status === UserStatus.BLOCKED) {
				throw new AppError(httpStatus.FORBIDDEN, "User Is Blocked");
			}

			if (
				ifPatientExistWithCredentials.isDeleted ||
				ifPatientExistWithCredentials.status === UserStatus.DELETED
			) {
				throw new AppError(httpStatus.FORBIDDEN, "User Is Deleted");
			}

			user = await prisma.user.update({
				where: {
					id: ifPatientExistWithCredentials.id,
				},

				data: {
					googleId: googleIdTokenPayload.sub,
				},
			});
		} else {
			// Google Register
			user = await prisma.user.create({
				data: {
					name: googleIdTokenPayload.name,
					email: googleIdTokenPayload.email,
					role: Role.PATIENT,
					googleId: googleIdTokenPayload.sub,
					authProvider: AuthProvider.GOOGLE,
					emailVerified: true,
					patient: {
						create: {
							name: googleIdTokenPayload.name,
							email: googleIdTokenPayload.email,
						},
					},
				},
			});
			const tempatePath = path.join(
				process.cwd(),
				"src/app/templates/patient-welcome-email.ejs",
			);

			const templateData = {
				name: user.name,
			};

			const html = await ejs.renderFile(tempatePath, templateData);

			await transporter.sendMail({
				from: config.email_sender,
				to: user.email,
				subject: "Welcome To PH Healthcare System",
				// text : `Your OTP is ${otp}`
				// html: `<h1>Your OTP is ${otp}</h1>`
				html,
			});
		}
	}

	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User Not Found");
	}

	if (user.status === UserStatus.BLOCKED) {
		throw new AppError(httpStatus.FORBIDDEN, "User Is Blocked");
	}

	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new AppError(httpStatus.FORBIDDEN, "User Is Deleted");
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		accessToken,
		refreshToken,
	};
};
```

**Export.** Add `googleLogin` to the service object. If the object exists, add the key; don't replace it.

```ts
export const AuthService = {
  googleLogin,
};
```

### 4.12 `src/app/module/auth/auth.controller.ts`

Imports (merge with existing ones):

```ts
import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AuthService } from "./auth.service";
```

Handler: it sets the access cookie (1 day) and the refresh cookie (7 days), and also returns both tokens in the body.

```ts
const googleLogin = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;

	const result = await AuthService.googleLogin(payload);

	const { accessToken, refreshToken } = result;

	res.cookie("accessToken", accessToken, {
		httpOnly: true,
		secure: false,
		sameSite: "none",
		maxAge: 1000 * 60 * 60 * 24, // 24 hour or 1 day
	});
	res.cookie("refreshToken", refreshToken, {
		httpOnly: true,
		secure: false,
		sameSite: "none",
		maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
	});

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "New tokens generated successfully",
		data: {
			accessToken,
			refreshToken,
		},
	});
});
```

Export (add the key if the object already exists):

```ts
export const AuthController = {
  googleLogin,
};
```

### 4.13 `src/app/module/auth/auth.route.ts`

This is the route that matters: `POST /google` with no auth middleware, since the user isn't logged in yet. If the router file exists, add only the `router.post("/google", ...)` line.

```ts
import { Router } from "express";
import { AuthController } from "./auth.controller";

const router = Router();
router.post("/google", AuthController.googleLogin);
export const AuthRoutes = router;
```

### 4.14 `src/app.ts`

Google login needs:

- CORS with `credentials: true` and `origin: FRONTEND_URL`, so the browser accepts the cookies;
- JSON body parsing;
- `cookie-parser`;
- the auth router mounted at `/api/v1/auth`;
- the global error handler after the routes.

Excerpt with only the auth-related parts:

```ts
import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
	type Application,
	type NextFunction,
	type Request,
	type Response,
} from "express";
import httpStatus from "http-status";
import config from "./app/config";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler";
import { notFound } from "./app/middleware/notFound";
import { AuthRoutes } from "./app/module/auth/auth.route";

const app: Application = express();

app.use(
	cors({
		origin: config.frontend_url,
		credentials: true,
	}),
);

// Enable URL-encoded form data parsing
app.use(express.urlencoded({ extended: true }));

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cookieParser());

app.use("/api/v1/auth", AuthRoutes);

// Basic route
app.get("/", async (req: Request, res: Response) => {
	res.status(httpStatus.OK).json({
		success: true,
		message: "Welcome to PH Healthcare System Backend",
	});
});

app.use(globalErrorHandler);
app.use(notFound);

export default app;
```

### 4.15 `src/server.ts`

This is an excerpt. The original also connects Redis and seeds admins. `transporter.verify()` fails fast at startup if the SMTP credentials are wrong; drop those two lines if email was skipped.

```ts
import app from "./app";
import config from "./app/config";
import { transporter } from "./app/lib/nodemailer";
import { prisma } from "./app/lib/prisma";

const PORT = config.port;

const main = async () => {
	try {
		await prisma.$connect();
		console.log("Connected to the database successfully.");

		await transporter.verify();
		console.log("Nodemailer Connected Successfully.");

		app.listen(PORT, () => {
			console.log(`Server is running on port ${PORT}`);
		});
	} catch (error) {
		console.error("Error starting the server:", error);
		await prisma.$disconnect();
		process.exit(1);
	}
};

main();
```

### 4.16 Guards in the password flows (only if the project has email/password auth)

A user created through Google has `password = null`. The existing password flows have to handle that case, or they will crash or mislead the user. Add these checks.

In `loginUser`, after the blocked/deleted checks and before `bcrypt.compare`:

```ts
	if (user.password === null && user.googleId !== null) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"User Already Has Account Registered With Google. Try To Login With Google.",
		);
	}
```

In `forgotPassword`, after the user lookup and status checks:

```ts
	if (isUserExist.googleId && isUserExist.authProvider === "GOOGLE") {
		throw new AppError(httpStatus.BAD_REQUEST, "User Has Account With Google");
	}
```

In `resetPassword`, at the same spot:

```ts
	if (isUserExist.googleId && isUserExist.authProvider === "GOOGLE") {
		throw new AppError(httpStatus.BAD_REQUEST, "User Has Account With Google");
	}
```

---

## 5. Run and test

1. Type-check:

   ```bash
   npx tsc --noEmit
   ```

2. Start the dev server:

   ```bash
   npm run dev
   ```

   Expected: `Connected to the database successfully.`, `Nodemailer Connected Successfully.` (if email is on), and `Server is running on port 5000`.

3. **Get a real Google ID token.** The backend can't be tested with a made-up token, because Google signs it and the code checks the audience.
   1. Save the page below as `google-test.html`, replacing `YOUR_GOOGLE_CLIENT_ID`.
   2. Serve it from an origin listed under the client's Authorized JavaScript origins, for example with `npx serve -l 3000 .`.
   3. Open the page, click the button, and copy the token printed in the browser console.
   
   ID tokens expire after about an hour.

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

4. Call the endpoint:

   ```bash
   curl -i -X POST http://localhost:5000/api/v1/auth/google -H "Content-Type: application/json" -d "{\"idToken\":\"PASTE_ID_TOKEN_HERE\"}"
   ```

   - **Success:** `200` with `{"success":true,"statusCode":200,"message":"New tokens generated successfully","data":{"accessToken":"...","refreshToken":"..."}}` plus two `Set-Cookie` headers. On first login a `users` row (authProvider `GOOGLE`, `emailVerified` true, `password` null) and a `patients` row are created, and the welcome email is sent.
   - **Bad or expired token, or wrong client ID:** `401` with `"Invalid Or Expired Google Id Token"`.

5. A real frontend posts the credential with cookies enabled:

   ```js
   await fetch("http://localhost:5000/api/v1/auth/google", {
     method: "POST",
     credentials: "include",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ idToken: response.credential }),
   });
   ```

Postman: `POST {{baseUrl}}/auth/google` with raw JSON body `{ "idToken": "<google-id-token-from-frontend-sign-in>" }`. The original collection's test script saves `data.accessToken` and `data.refreshToken` into collection variables.

---

## 6. Known caveats in the original code

Copy the code as-is, but tell the user about each of these. Change them only if the user asks.

1. **Cookie flags.** The cookies use `sameSite: "none"` with `secure: false`. Browsers reject `SameSite=None` cookies that lack `Secure`, so the cookies may silently not be stored. The tokens still come back in the response body.
   - Production over HTTPS: use `secure: true`.
   - Same-site local development: use `sameSite: "lax"`.
2. **Non-patient email.** If the Google email already belongs to a non-patient account (`DOCTOR` or `ADMIN`), neither lookup matches. The code then tries to create a new user, the unique email constraint fails, and the client gets `400 "Duplicate Key Error"` instead of a clear message.
3. **Unverified credential patient.** If the matching email/password patient never verified their email, Google login returns `403 "Email Not Verified"` instead of linking the account, even though Google has already verified the email.
4. **No validation on the route.** `POST /google` has no Zod schema. A missing `idToken` reaches Google verification and comes back as `401`. If the project uses `validateRequest`, you can offer `z.object({ idToken: z.string().min(1) })`; the original doesn't have it.
5. **Welcome email failures.** If SMTP fails on a first-time Google login, the user row is already created but the request returns `500`. The next attempt succeeds, because the user now exists.
6. **Response message.** The success message reads "New tokens generated successfully"; it was copied from the refresh-token handler.
7. **`npm start` on the build.** Imports omit `.js` extensions (`moduleResolution: "bundler"`). `npm run dev` (tsx) works, but running the plain `tsc` output with `node` can fail with `ERR_MODULE_NOT_FOUND`.
