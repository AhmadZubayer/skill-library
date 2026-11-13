---
name: express-super-skill
description: Build a complete Express 5 + TypeScript + Prisma 7 + PostgreSQL backend in the author's own house style, from a requirements document to a running API. Scaffolds a ready, type-checked project (config, pino logging, error handling, Zod validation, Swagger, JWT auth with email OTP, forgot/reset password, optional Google login, Redis, Nodemailer with EJS, Cloudinary uploads with in-memory Multer, PDFKit, Stripe and bKash payments behind one Strategy + Adapter interface, cron, Biome) with one command, then guides building the project's own modules. Use this skill whenever the user asks to create, scaffold, start or extend an Express, Node or Prisma backend, REST API or server, or hands over backend requirements, even if they don't name the skill.
---

# Express super skill

You are building a backend the way its author always builds one. The user hands you requirements; you scaffold the base project from the bundled template, then write the project's own modules in the same structure and style. Don't invent a different architecture, and don't swap libraries.

Stack: Express 5, TypeScript (ESM, run with `tsx`, bundled with `tsup`), Prisma 7 with the `pg` driver adapter, PostgreSQL, Zod 4, JWT, pino.

**The base code is real files in `template/`, copied by `scripts/scaffold.mjs`. Never retype template files by hand.** You write new code only for the project's own models and modules.

## Workflow

1. **Read the requirements and pick features** (section 1).
2. **Scaffold** (section 2). This copies the files and prints the install commands.
3. **Install packages** with the two printed commands.
4. **Fill in `.env`** (section 3). Ask the user for every missing value before going further.
5. **Design the models**, migrate and generate (`references/02-prisma.md`).
6. **Build one module per resource**, six files each (`references/03-module.md`), and mount it in `src/app.ts`.
7. **Adapt the scaffolded features** to the project where needed: auth (`references/04-auth.md`), uploads, PDFs and cron (`references/05-files-pdf-cron.md`), payments (`references/06-payments.md`).
8. **Verify and report** (section 6).

Read `references/01-template-tour.md` right after scaffolding, so you know what each generated file does before you change anything. Read each other reference before doing the work it covers.

---

## 1. Features

Core is always scaffolded: config, logger, error handling, validation middleware, Swagger, Prisma, the `User` model, and password auth (register with email OTP, verify, login, refresh, forgot/reset/change password), which needs Redis and a mailer.

| Feature flag | Include when | Adds |
|---|---|---|
| `google` | "sign in with Google" is required | Google ID-token login |
| `uploads` | images or files are uploaded | in-memory Multer, Cloudinary, upload helper |
| `pdf` | invoices, receipts, reports | PDFKit helper |
| `stripe` | card payments | payment module + Stripe adapter |
| `bkash` | bKash payments | payment module + bKash adapter |
| `cron` | scheduled cleanup or reminders | node-cron |
| `example` | you want a finished sample module to copy from | a complete `category` module and model |

If the requirements need payments but don't say which gateway, ask. Use bKash for Bangladesh-only products, Stripe for cards, or both.

---

## 2. Scaffold

From anywhere, pointing at the project folder (it is created if missing):

```bash
node <path-to-this-skill>/scripts/scaffold.mjs <project-folder> --features google,uploads,stripe,bkash
```

- Leave out `--features` for core only.
- Existing files are skipped and listed, never overwritten, unless `--force` is passed. In an existing project, review each skipped file and merge by hand.
- The script prints two `npm install` commands with **pinned major versions**. Use them exactly. Installing unpinned can pull an incompatible major (for example a Prisma pre-release with a different CLI).
- A feature can be added later by running the script again with the extra flag: new files are created, existing ones are skipped. Then merge the feature's blocks into the skipped shared files (`src/app.ts`, `src/server.ts`, `src/app/config/index.ts`, `.env.example`, `prisma/models/enums.prisma`, `prisma/models/user.prisma`) using the template copies as the source: the blocks are marked `// @feature <name>` ... `// @end` there.

---

## 3. `.env`

Every environment variable is read in `src/app/config/index.ts` and nowhere else; the rest of the code imports `config`.

1. Copy `.env.example` to `.env`.
2. Run the checker from the project root, naming the groups in use (the scaffold output prints this command):

   ```bash
   node <path-to-this-skill>/scripts/check-env.mjs core auth google uploads stripe bkash
   ```

   It prints each variable as `ok`, `MISSING` or `EMPTY`, and never prints values.
3. **If anything is missing or empty, stop and ask the user.** Send one message listing every missing variable with its hint from the table. Wait for the answer, then write the values to `.env`.
4. When you add a new variable for the project, add it to `config/index.ts`, `.env.example` and `.env`.

| Group | Variable | What it is / default |
|---|---|---|
| core | `NODE_ENV` | `development` |
| core | `PORT` | `5000` |
| core | `APP_NAME` | display name used in emails, PDFs and Swagger |
| core | `DATABASE_URL` | `postgresql://USER:PASSWORD@localhost:5432/DBNAME?schema=public`. Ask for user, password and database name; URL-encode special characters in the password |
| core | `SERVER_URL` | public base URL of this API, e.g. `http://localhost:5000` |
| core | `FRONTEND_URL` | allowed CORS origin, e.g. `http://localhost:3000` |
| core | `LOG_LEVEL` | `info` |
| auth | `BCRYPT_SALT_ROUNDS` | `12` |
| auth | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | two different long random strings. Offer to generate each with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| auth | `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | `1d`, `7d` |
| auth | `REDIS_USER`, `REDIS_PASSWORD`, `REDIS_HOST`, `REDIS_PORT` | from the user's Redis provider. User is usually `default` |
| auth | `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_SENDER` | Gmail address, a Gmail **App Password** (16 characters, needs 2-Step Verification), and the from-address (usually the same Gmail) |
| auth | `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | the first admin account, created by `npm run db:seed` |
| google | `GOOGLE_CLIENT_ID` | OAuth **Web application** client ID from Google Cloud Console → APIs & Services → Credentials. Must be the same ID the frontend uses |
| uploads | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | from the Cloudinary dashboard |
| stripe | `STRIPE_SECRET_KEY` | `sk_test_...` from the Stripe dashboard |
| stripe | `STRIPE_WEBHOOK_SECRET` | `whsec_...`, printed by `stripe listen --forward-to localhost:5000/api/payments/webhook` |
| bkash | `BKASH_BASE_URL`, `BKASH_USERNAME`, `BKASH_PASSWORD`, `BKASH_APP_KEY`, `BKASH_APP_SECRET` | `.env.example` already holds bKash's published **sandbox** values; keep them for development. Ask only for production credentials |

Variables with a default can be filled in without asking, but tell the user which defaults you used. Never invent secrets, keys or passwords, and never print their values in chat.

---

## 4. Folder structure and what goes where

```
project-root/
├── .env / .env.example / .gitignore / biome.json / package.json
├── prisma.config.ts / tsconfig.json / tsup.config.ts
├── prisma/
│   ├── schema.prisma         ← generator + datasource only
│   ├── models/
│   │   ├── enums.prisma      ← every enum
│   │   └── <model>.prisma    ← one file per model
│   ├── migrations/           ← created by prisma migrate; always committed
│   └── seed.ts               ← first admin
└── src/
    ├── app.ts                ← express app: middleware, routes, error handlers. Never calls listen
    ├── server.ts             ← connects database, Redis, mailer, cron; then listens
    ├── generated/prisma/     ← prisma client output; never edited, never committed
    └── app/
        ├── config/index.ts   ← the only place process.env is read
        ├── interfaces/       ← types shared by more than one module
        ├── lib/              ← one file per external service client; no business logic
        ├── middleware/       ← express middleware
        ├── utils/            ← small stateless helpers
        ├── templates/        ← EJS email templates, kebab-case names
        └── module/
            └── <name>/       ← one folder per resource, six files each
```

**Every module has exactly these six files:**

| File | Contains | Exports |
|---|---|---|
| `<name>.route.ts` | the Router: path + middleware chain + controller | named Router(s): `categoryRoutes` |
| `<name>.controller.ts` | reads the request, calls the service, sends the response | `categoryController` object |
| `<name>.service.ts` | business rules and all Prisma calls; throws `AppError` | `categoryService` object |
| `<name>.validation.ts` | Zod schemas for body, params and query | `categoryValidation` object |
| `<name>.interface.ts` | TypeScript types for payloads | `I...` interfaces |
| `<name>.docs.ts` | Swagger `@openapi` comment blocks, one per endpoint | nothing |

Where new things go:

- A new external service → one file in `lib/` that creates and exports the client, its settings in `config/index.ts`.
- A new reusable helper → `utils/`. A new middleware → `middleware/`. A new email → a template in `templates/`, sent with `sendEmail`.
- A module that talks to interchangeable providers gets a `providers/` subfolder (`references/06-payments.md`).

---

## 5. House rules

**Naming**

- Module folders are singular (`category`, `booking`). Routes are mounted under `/api/<plural>`; admin-only routers under `/api/admin/<plural>`.
- Service functions end in what they do to the database: `createCategoryIntoDB`, `getAllCategoriesFromDB`, `updateBookingStatusIntoDB`, `deleteReviewFromDB`.
- Each controller, service and validation file ends with one exported object: `export const categoryService = { ... }`.
- Interfaces start with `I`. Validation schemas end with `Schema`.

**Controllers**

- Always wrapped in `catchAsync`. Always answer with `sendResponse`. No Prisma calls and no business rules.
- Validated params are in `res.locals.validatedParams`, validated query in `res.locals.validatedQuery`, the body in `req.body`, the logged-in user in `req.user`.

**Errors**

- Throw `new AppError(httpStatus.X, "Message")` from services. Never send an error response by hand.
- 400 invalid input, 401 not logged in, 403 not allowed, 404 not found, 409 state conflict.

**Validation and sanitization**

- Every route that takes a body, params or query has a Zod schema wired in with `validateRequest`, `validateParams` or `validateQuery`.
- Sanitize in the schema: `.trim()` on every string, `.toLowerCase()` on emails and slugs, `z.coerce` for query strings and dates, `z.enum(PrismaEnum)` for enums, `z.uuid()` for ids.
- Middleware order on a route: `auth(...)` → `upload...` (if files) → `validate...` → controller.

**Logging**

- Use `logger` from `lib/logger.ts`, never `console.log`. Inside request handlers prefer `req.log`.
- Object first, message second: `logger.info({ userId }, "User registered")`, `logger.error({ err: error }, "Refund failed")`.
- Never log passwords, tokens, OTPs or full request bodies.

**Database**

- One shared `prisma` from `lib/prisma.ts`. Never return the password column: `omit: { password: true }`.
- Any write that touches more than one row or table, or that checks a condition and then writes, goes in `prisma.$transaction`, using the transaction client for every query inside. Network calls stay outside. Rules and patterns: `references/02-prisma.md`, section 6.

**Interchangeable services**

- When two external services do the same job in different ways (payment gateways, SMS senders, storage), use Strategy + Adapter: one interface, one adapter file per provider, one factory. The rest of the code never imports a provider SDK. See `references/06-payments.md`.

**Formatting**

- After writing code run `npm run format:fix`. Biome uses tabs and double quotes.

---

## 6. Verify and report

Run in order and report each result:

1. `npx prisma validate`
2. `npx prisma migrate dev --name init` (needs `DATABASE_URL` and a reachable PostgreSQL)
3. `npx prisma generate`
4. `npm run format:fix`, then `npm run lint:check`
5. `npx tsc --noEmit`
6. `npm run db:seed`
7. `npm run dev`: expect `Connected to the database successfully.` and `Server is running`
8. Open `http://localhost:<PORT>/docs` and confirm every module's endpoints are listed.

Final report: features included, modules built, env variable names added, commands run with their result, and anything the user must still do (for example creating a Google client ID, running `stripe listen`, adding Authorized JavaScript origins).
