# 01 · Tour of the scaffolded project

What each generated file does, and which ones you are expected to edit. Read this once after scaffolding.

## Root files

| File | Purpose | Edit? |
|---|---|---|
| `package.json` | `"type": "module"` and the scripts (`dev`, `build`, `start`, `db:*`, `format:*`, `lint:*`) | rarely |
| `tsconfig.json` | `moduleResolution: "bundler"` lets imports omit `.js` | no |
| `tsup.config.ts` | bundles `src/server.ts` and `src/app.ts` into `dist/` for production | no |
| `biome.json` | formatter and linter: tabs, double quotes, organised imports; skips generated code and templates | no |
| `prisma.config.ts` | Prisma 7 settings: schema folder, migrations path, `DATABASE_URL` | no |
| `.env.example` | variable names with placeholders | add new variables |
| `.gitignore` | ignores `.env`, `dist`, `src/generated` | rarely |

## `src/app.ts`: edit for every new module

The order in this file matters:

1. CORS with `credentials: true`, so the browser accepts the auth cookies.
2. The Stripe webhook route, **before** `express.json()`, because Stripe signatures need the raw body.
3. Body parsers, cookie parser, `pino-http` request logger.
4. Swagger UI at `/docs`.
5. One `app.use("/api/<plural>", <name>Routes)` per module. **Add yours here.** More specific paths go above less specific ones.
6. `notFound`, then `globalErrorHandler`, last.

## `src/server.ts`

Connects to the database, Redis and the mailer (and starts cron) before listening. If any connection fails it logs, disconnects and exits, so the server never runs half-working. Add a connect step here when you add a service that needs one.

## `src/app/config/index.ts`: edit for every new variable

Loads `.env` and exports a plain object with snake_case keys (`config.jwt_access_secret`). No other file reads `process.env`, apart from `lib/prisma.ts` and `lib/logger.ts`, which must work before config loads.

## `src/app/lib/`

| File | Exports | Notes |
|---|---|---|
| `prisma.ts` | `prisma` | the one shared client |
| `logger.ts` | `logger` | pino; pretty output in development, JSON in production; redacts auth headers and cookies; level from `LOG_LEVEL` |
| `swagger.ts` | `swaggerDocument` | built from every `src/app/module/**/*.docs.ts` |
| `redis.ts` | `redisClient` | connected in `server.ts` |
| `nodemailer.ts` | `transporter` | Gmail transport; verified at startup |
| `googleAuth.ts` | `googleClient` | Google login |
| `multer.ts` | `upload` | in-memory storage |
| `cloudinary.ts` | `cloudinary` | uploads |
| `stripe.ts` | `stripe` | Stripe |
| `bkash.ts` | `getBkashIdToken`, `bkashRequest` | bKash; token cached in Redis |
| `cron.ts` | `startCronJobs` | scheduled jobs |

## `src/app/utils/`

| File | Use |
|---|---|
| `AppError.ts` | `throw new AppError(httpStatus.NOT_FOUND, "Category not found")`. An optional third argument carries details |
| `catchAsync.ts` | wraps every controller so rejections reach the error handler |
| `sendResponse.ts` | the one success shape: `{ success, statusCode, message, data, meta? }` |
| `jwt.ts` | `jwtUtils.createToken`, `jwtUtils.verifyToken` |
| `sendEmail.ts` | renders an EJS template and sends it: `sendEmail({ to, subject, templateName, templateData, attachments? })` |
| `authCookies.ts` | `setAuthCookies(res, accessToken, refreshToken)`, `clearAuthCookies(res)` |
| `uploadToCloudinary.ts` | `uploadToCloudinary(buffer, options?)`, `deleteFromCloudinary(publicId)` |
| `generatePdf.ts` | `generatePdf((pdfDocument) => { ... })` returns a `Buffer` |

## `src/app/middleware/`

| File | Use |
|---|---|
| `checkAuth.ts` | `auth()` for any logged-in user, `auth(UserRole.ADMIN)` for roles. Reads the `accessToken` cookie or `Authorization: Bearer`, loads the user from the database on every request (so blocking takes effect at once), sets `req.user = { id, name, email, role }` |
| `validateRequest.ts` | validates `req.body` with a Zod schema and replaces it with the parsed data |
| `validateParams.ts` | validates `req.params`; result in `res.locals.validatedParams` |
| `validateQuery.ts` | validates `req.query`; result in `res.locals.validatedQuery` |
| `globalErrorHandler.ts` | maps `AppError`, Prisma errors, bad JSON and Multer errors to one JSON shape; logs server errors |
| `notFound.ts` | 404 for unknown routes |

Express 5 makes `req.params` and `req.query` read-only, which is why their validated values live in `res.locals`.

Error responses always look like this:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errorDetails": [{ "field": "email", "message": "Invalid email address" }]
}
```

In production, unexpected errors return `"Internal Server Error"` with no stack.

## `src/app/interfaces/index.ts`

`IQuery`: the query type for list endpoints (search, pagination, sorting, plus filter fields).

## `src/app/templates/`

`registration-otp.ejs`, `forgot-password.ejs`, `reset-password-success.ejs`, `welcome.ejs`. `appName` is available in every template. New templates copy the same layout. The files are read from disk at runtime, so `src/app/templates/` must be deployed along with the build, and so must the `*.docs.ts` files for Swagger.

## `src/app/module/`

- `auth/`: complete. See `references/04-auth.md` before changing it.
- `payment/` (with `stripe` or `bkash`): complete, built around an example `Booking`. See `references/06-payments.md` for what to rename.
- `category/` (with `example`): a finished sample module. Delete it and its model once the project's own modules exist, and remove its lines from `app.ts`.

## Logging

```ts
import { logger } from "../../lib/logger";

logger.info({ userId: user.id }, "User registered");
logger.warn({ paymentId }, "Payment callback arrived twice");
logger.error({ err: error }, "Failed to send email");

// inside a controller or middleware: carries the request id
req.log.info({ bookingId }, "Booking created");
```

- Data goes in the first argument as an object; a short fixed message goes second. Don't build messages with template strings.
- Pass errors as `{ err: error }` so the stack is serialised.
- `debug` for development detail, `info` for normal events, `warn` for unexpected but handled situations, `error` for failures.
- Request logging is automatic. Never use `console.log` in `src/`.
