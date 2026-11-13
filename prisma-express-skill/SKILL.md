
---
name: prisma-postgres-setup
description: Set up Prisma 7 with PostgreSQL in an Express + TypeScript (ESM) backend exactly the way the PH Healthcare backend does it — packages, DATABASE_URL in .env (asking the user for it if missing), prisma.config.ts, the multi-file prisma/schema folder, the generator writing the client to src/generated/prisma, the shared PrismaClient with the @prisma/adapter-pg driver adapter in src/app/lib/prisma.ts, connecting on startup, migrations and prisma generate, importing generated enums and types, and Prisma-aware error handling. Use this skill whenever the user wants to add, install, initialise or configure Prisma, connect PostgreSQL to a Node/Express API, set up migrations, upgrade to Prisma 7, or fix errors like "Cannot find module generated/prisma" or a missing DATABASE_URL, even if they don't name the skill.
---
# Prisma 7 + PostgreSQL setup for Express + TypeScript

This skill sets up the database layer only: the Prisma tooling, config, client, migrations and conventions. It does **not** bring any domain models; the user's own models go in at step 4.7.

Every code block below is copied verbatim from the PH Healthcare backend (branch `module-42`). That project uses:

- Express 5 with TypeScript ESM, run by `tsx`;
- Prisma 7 with the new `prisma-client` generator;
- the `@prisma/adapter-pg` driver adapter;
- a multi-file schema folder.

Keep the code verbatim unless the target project forces a change. If you change something, tell the user what and why.

## Contents

0. Workflow
1. Questions to settle with the user (and when to ask)
2. Packages
3. File map
4. Steps, in order (4.1 to 4.13)
5. Everyday commands
6. Verify
7. Gotchas

---

## 0. Workflow

1. **Survey the project.** Look for:

   - `package.json`;
   - `tsconfig.json`;
   - any existing `prisma/` folder or `schema.prisma`;
   - `prisma.config.ts`;
   - `.env` and `.gitignore`;
   - an existing Prisma client file;
   - the source layout.

   This skill assumes `src/server.ts`, `src/app.ts` and `src/app/...`. If the layout differs, put each file at its equivalent location, fix relative import paths, and tell the user the mapping.
2. **Don't overwrite blindly.** If a file exists, merge in only what's missing.

   - If the project already uses Prisma 5 or 6 (`provider = "prisma-client-js"`, or `url = env("DATABASE_URL")` inside the schema's `datasource` block), tell the user. Prisma 7 needs the URL in `prisma.config.ts` and the `prisma-client` generator with an `output`.
   - Ask before restructuring their schema, for example moving a single `prisma/schema.prisma` into the `prisma/schema/` folder.
3. **Settle the questions in section 1** before running migrations.
4. Apply section 4 in order. Steps that run commands say so.
5. Run the checks in section 6.
6. Finish with a short report:

   - files created and files modified;
   - commands run and their output (success or the error);
   - env variable **names** added (never echo the connection string's password);
   - what the user still has to do.

---

## 1. Questions to settle with the user

Check each item. Ask only about what is actually missing or unclear, and put all the questions in **one** message.

1. **`DATABASE_URL`.** Read `.env`; don't print its value in chat. If it's missing or empty, ask the user for **either** a full PostgreSQL connection string, **or** these parts:

   | Part          | Default                             |
   | ------------- | ----------------------------------- |
   | user          | `postgres`                        |
   | password      | none, must ask                      |
   | host          | `localhost`                       |
   | port          | `5432`                            |
   | database name | e.g. the project name in snake_case |
   | schema        | `public`                          |

   Then build: `postgresql://USER:PASSWORD@HOST:PORT/DBNAME?schema=public`.


   - URL-encode special characters in the password (`@` → `%40`, `#` → `%23`, `/` → `%2F`, `:` → `%3A`).
   - Use `postgresql://postgres:postgres@localhost:5432/<dbname>?schema=public` only if the user confirms those are their real local credentials.
2. **Is PostgreSQL reachable?** For a local URL, check with `pg_isready -h localhost -p 5432`. If `pg_isready` isn't installed, try `psql -V` to see whether the client tools exist.

   - If Postgres isn't installed or running, tell the user, then ask whether they want to install or start it themselves or use a hosted URL instead (Neon, Supabase, Railway and so on).
   - Don't install database servers or change system services without the user's go-ahead.
   - The database itself doesn't need to exist beforehand: `prisma migrate dev` creates it, if the user has permission to create databases.
3. **Models.** If the schema folder has no models yet, ask the user which models and fields they want.

   - Don't invent domain models.
   - If they have none yet, finish the setup and skip the migration (4.8). Tell them to add model files and then run 4.8 and 4.9.
4. **Destructive commands.** `prisma migrate reset`, dropping the database, or deleting migration folders destroy data. Ask first, every time, and say exactly what will be lost.

Once you have the `DATABASE_URL` value:

1. Write it to `.env`.
2. Add the variable name with a placeholder URL to `.env.example`.
3. Make sure `.env` is git-ignored (4.4).

---

## 2. Packages

Install only what's missing.

```bash
npm install @prisma/client @prisma/adapter-pg pg dotenv
```

```bash
npm install -D prisma @types/pg typescript tsx @types/node
```

Versions in the original `package.json`:

| Package                | Version | Why                                                              |
| ---------------------- | ------- | ---------------------------------------------------------------- |
| `@prisma/client`     | ^7.9.1  | runtime the generated client imports                             |
| `@prisma/adapter-pg` | ^7.9.1  | Prisma 7 driver adapter: Prisma talks to Postgres through `pg` |
| `pg`                 | ^8.22.0 | node-postgres driver used by the adapter                         |
| `dotenv`             | ^17.4.2 | Prisma 7 does not load `.env` by itself                        |
| `prisma` (dev)       | ^7.9.1  | CLI: `migrate`, `generate`, `studio`                       |
| `@types/pg` (dev)    | ^8.20.0 | typings for `pg`                                               |
| `tsx` (dev)          | ^4.23.1 | runs the TypeScript server in dev                                |
| `typescript` (dev)   | ^7.0.2  | type-check / build                                               |
| `@types/node` (dev)  | ^26.1.2 | Node typings                                                     |

Keep `prisma` and `@prisma/client` on the same version.

---

## 3. File map

```
project-root/
├── .env                          ← 4.3  DATABASE_URL (git-ignored)
├── .env.example                  ← 4.3  variable names + placeholder URL
├── .gitignore                    ← 4.4  .env + /src/generated
├── package.json                  ← 4.1  "type": "module", scripts
├── tsconfig.json                 ← 4.2  includes prisma.config.ts
├── prisma.config.ts              ← 4.5  schema folder, migrations path, DATABASE_URL
├── prisma/
│   ├── schema/                   ← multi-file schema: every *.prisma here is one schema
│   │   ├── schema.prisma         ← 4.6  generator + datasource only
│   │   ├── enums.prisma          ← 4.7  all enums
│   │   └── <model>.prisma        ← 4.7  one file per model (user's models)
│   └── migrations/               ← 4.8  created by `prisma migrate dev`
│       ├── migration_lock.toml
│       └── <timestamp>_<name>/migration.sql
└── src/
    ├── server.ts                 ← 4.11 prisma.$connect() before listen
    ├── app.ts                    ← 4.13 mounts the error handler
    ├── generated/prisma/         ← 4.9  created by `prisma generate` (git-ignored)
    └── app/
        ├── config/index.ts       ← 4.11 env → config (node_env, port, database_url)
        ├── lib/prisma.ts         ← 4.10 the one shared PrismaClient
        ├── utils/AppError.ts     ← 4.13 (optional) used by the error handler
        └── middleware/
            └── globalErrorHandler.ts ← 4.13 (optional) maps Prisma errors to HTTP
```

---

## 4. Steps, in order

### 4.1 `package.json`: ESM and scripts

The original is an ES module project; the generated client and every import below assume it. Make sure these lines exist (merge, don't replace):

```json
    "scripts": {
        "dev": "tsx watch src/server.ts",
        "build": "tsc",
        "start": "node dist/src/server.js",
    },
    "type": "module",
```

The trailing commas follow the original file's layout: `"scripts"` is followed by other keys, and `"type"` by `"dependencies"`. Keep the JSON valid when merging.

### 4.2 `tsconfig.json` (create if missing)

`"moduleResolution": "bundler"` lets imports omit the `.js` extension under `tsx`. `"include"` lists `prisma.config.ts` so the config file is type-checked too.

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

### 4.3 `.env` and `.env.example`: `DATABASE_URL`

This is the block as it appears in the original `.env.example`. `prisma init` inserted the comment, and the comment is the reason for the `dotenv/config` imports in 4.5 and 4.10. Put the real URL from section 1 in `.env`, and this placeholder form in `.env.example`, replacing the original's database name `ph_healthcare` with the project's:

```env
# This was inserted by `prisma init`:
# Environment variables declared in this file are NOT automatically loaded by Prisma.
# Please add `import "dotenv/config";` to your `prisma.config.ts` file, or use the Prisma CLI with Bun
# to load environment variables from .env files: https://pris.ly/prisma-config-env-vars.

# Prisma supports the native connection string format for PostgreSQL, MySQL, SQLite, SQL Server, MongoDB and CockroachDB.
# See the documentation for all the connection string options: https://pris.ly/d/connection-strings

DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ph_healthcare?schema=public"
```

### 4.4 `.gitignore`

Keep secrets and the generated client out of git (excerpt from the original):

```gitignore
.env
.env.*
!.env.example

/src/generated
```

`src/generated` is rebuilt by `npx prisma generate`, so a fresh clone must run it before anything compiles.

### 4.5 `prisma.config.ts` (project root)

In Prisma 7 the CLI reads its settings from this file:

- the schema location; the folder `prisma/schema` turns on multi-file schemas;
- where migrations live;
- the database URL.

`import 'dotenv/config'` is required because Prisma 7 no longer loads `.env` automatically.

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

### 4.6 `prisma/schema/schema.prisma`: generator + datasource only

This file holds only the generator and datasource, with no models. Two things to note:

- **Generator output.** `provider = "prisma-client"` is the Prisma 7 generator, and it requires `output`. The path is relative to this file, so `../../src/generated/prisma` lands in `src/generated/prisma`.
- **Datasource.** The `datasource` block has only `provider`. The URL comes from `prisma.config.ts`.

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

### 4.7 Enums and models: one file per model

Every `.prisma` file in `prisma/schema/` is merged into one schema. Models in different files can reference each other without imports. The project layout:

- `enums.prisma` holds every enum;
- each model gets its own file named after it (`user.prisma`, `patient.prisma`, …);
- `schema.prisma` holds only generator + datasource.

Write the **user's** models, using the conventions below. The lines are copied exactly from the project; the model and field names are its own, so rename them to the user's domain.

An enum (in `enums.prisma`):

```prisma
enum UserStatus {
  ACTIVE
  BLOCKED
  DELETED
}
```

Field and attribute patterns:

```prisma
// primary key, UUID v4 (most models)
  id String @id @default(uuid())
// primary key, UUID v7 (time-ordered), used on Patient
  id String @id @default(uuid(7))

// soft delete + timestamps (on every model)
  isDeleted     Boolean   @default(false)
  deletedAt     DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

// enum field with a default
  status ScheduleStatus @default(DRAFT)
// money: fixed-point decimal
  amount   Decimal @db.Decimal(10, 2) // 100.50
// JSON column
  gatewayResponse Json?

// one-to-one: the side holding the foreign key (Patient) ...
  userId String @unique
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Cascade)
// ... and the other side (inside User)
  patient            Patient?

// one-to-many: the "many" side holding the foreign key (Schedule) ...
  doctorId String
  doctor   Doctor @relation(fields: [doctorId], references: [id], onDelete: Cascade, onUpdate: Cascade)
// ... and the "one" side (inside Doctor)
  schedules Schedule[]

// model-level: named compound unique, named index, snake_case plural table name
  @@unique([doctorId, startDateTime, endDateTime], name: "unique_schedule")
  @@index([email], name: "idx_patient_email")
  @@map("patients")
```

Conventions the project follows:

- Every model has `@@map("<plural_snake_case>")`, so the tables are `users`, `patients` and so on.
- Foreign keys use `onDelete: Cascade, onUpdate: Cascade`.
- Soft delete uses `isDeleted` + `deletedAt` rather than deleting rows.
- Index names are given explicitly (`idx_<table>_<column>`).

Run `npx prisma format` after editing schema files; it aligns columns and adds missing back-relations it can infer.

### 4.8 Create and apply the first migration (runs a command)

Do this only once `DATABASE_URL` is set and at least one model exists. **Always pass `--name`.** The original history has two unnamed migration folders (`20260820111540/`, `20260826193710/`), which are hard to tell apart later.

```bash
npx prisma migrate dev --name init
```

This command:

1. creates the database if it doesn't exist;
2. writes `prisma/migrations/<timestamp>_init/migration.sql`;
3. applies the migration;
4. records it in the `_prisma_migrations` table.

The first run also creates `prisma/migrations/migration_lock.toml`, which looks exactly like this in the original:

```toml
# Please do not edit this file manually
# It should be added in your version-control system (e.g., Git)
provider = "postgresql"
```

Commit `prisma/migrations/` (including the lock file) to git. For every later schema change, run `npx prisma migrate dev --name <what_changed>`, for example `--name add_payment_table`.

### 4.9 Generate the client (runs a command)

```bash
npx prisma generate
```

This writes the typed client into `src/generated/prisma/`. The project imports four entry points from it: `client`, `enums`, `models` and `browser` (see 4.12). Run it after **every** schema change, and after a fresh clone. Don't rely on `migrate dev` to run it for you.

### 4.10 `src/app/lib/prisma.ts`: the one shared client

This is created once and imported everywhere. The Prisma 7 `prisma-client` generator needs a driver adapter: `PrismaPg` wraps `pg` using the same `DATABASE_URL`. `import "dotenv/config"` makes sure the URL is loaded even if this file is imported before the app config.

```ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export { prisma };
```

Import it as `import { prisma } from "../../lib/prisma";`, with the relative path depending on the importing file's depth. Never create a second `PrismaClient` anywhere else.

### 4.11 Connect on startup: `src/server.ts` and `src/app/config/index.ts`

The server connects to the database before it starts listening. If the connection fails, it disconnects and exits instead of serving requests without a database.

**File:** `src/app/config/index.ts` (excerpt; merge keys if the file exists)

```ts
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export default {
	node_env: process.env.NODE_ENV,
	port: process.env.PORT,
	database_url: process.env.DATABASE_URL,
};
```

**File:** `src/server.ts` (excerpt; the original also connects Redis and verifies the mailer here)

```ts
import app from "./app";
import config from "./app/config";
import { prisma } from "./app/lib/prisma";

const PORT = config.port;

const main = async () => {
	try {
		await prisma.$connect();
		console.log("Connected to the database successfully.");

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

On success the console shows `Connected to the database successfully.`.

### 4.12 Using the generated client

Import paths are relative to `src/generated/prisma`. From `src/app/lib/` or `src/app/middleware/` that's `../../generated/prisma/...`; from `src/app/module/<name>/` it's `../../../generated/prisma/...`. These are the exact import forms the project uses:

```ts
// the client class (only in lib/prisma.ts)
import { PrismaClient } from "../../generated/prisma/client";
// the Prisma namespace: error classes, utility types
import { Prisma } from "../../generated/prisma/client";
// enums as runtime values, e.g. Role.PATIENT
import { DoctorVerificationStatus, Role } from "../../generated/prisma/enums";
// generated input types, e.g. for building dynamic where-filters
import { DoctorWhereInput } from "../../../generated/prisma/models";
// type-only import from the browser-safe entry
import type { Role } from "../../../generated/prisma/browser";
```

The names `DoctorVerificationStatus`, `Role` and `DoctorWhereInput` come from the original project's models. Use the user's own enum and model names; Prisma generates `<Model>WhereInput` for every model.

**Nested create + hiding a column + including a relation**, as written in the project:

```ts
	const createdUser = await prisma.user.create({
		data: {
			name: patientPayload.name,
			email: patientPayload.email,
			password: patientPayload.password,
			role: Role.PATIENT,
			status: UserStatus.ACTIVE,
			emailVerified: true,
			patient: {
				create: {
					name: patientPayload.name,
					email: patientPayload.email,
					contactNumber: patientPayload?.patient?.contactNumber || "",
				},
			},
		},
		omit: { password: true },
		include: { patient: true },
	});
```

**Interactive transaction**, with the original's timeout options (needed when the transaction waits on slow work such as an HTTP call):

```ts
	const transactionResult = await prisma.$transaction(async (tx) => {
		// ... every query in here must use `tx`, not `prisma` ...
	}, {
		maxWait: 10000, // default: 2000
		timeout: 30000, // default: 5000
	});
```

Inside the callback, use `tx.<model>` for **every** query. A `prisma.<model>` call inside the callback runs outside the transaction and won't be rolled back. The original code mixes the two in places; don't copy that.

### 4.13 Optional: map Prisma errors to HTTP responses

The original has a global Express error handler that turns Prisma errors into clean JSON responses:

- `P2002` (duplicate key) → 400;
- `P2003` (foreign key failure) → 400;
- `P2025` (record not found) → 400;
- validation errors → 400;
- `P1000` (bad database credentials) → 401;
- `P1001` (database unreachable) → 400;
- unknown request errors → 500.

It depends on `AppError` and the config's `node_env`. Ask the user whether they want it if the project doesn't already have an error handler. If the project has one, offer to merge in just the Prisma branches.

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

Mount it in `src/app.ts` **after** all routes, as the original does:

```ts
import { globalErrorHandler } from "./app/middleware/globalErrorHandler";
import { notFound } from "./app/middleware/notFound";

// ... app.use("/api/v1/...", SomeRoutes) for every route ...

app.use(globalErrorHandler);
app.use(notFound);
```

---

## 5. Everyday commands

| Command                                    | When                                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `npx prisma migrate dev --name <change>` | after editing schema files in development: creates and applies a migration                |
| `npx prisma generate`                    | after every schema change and after cloning: rebuilds `src/generated/prisma`            |
| `npx prisma format`                      | tidy and validate schema files                                                            |
| `npx prisma validate`                    | check the schema without touching the database                                            |
| `npx prisma migrate status`              | see which migrations are applied                                                          |
| `npx prisma migrate deploy`              | production/CI: apply committed migrations without creating new ones                       |
| `npx prisma studio`                      | browse and edit data in a local web UI                                                    |
| `npx prisma migrate reset`               | **destructive**: drops the database, re-applies all migrations. Ask the user first. |

---

## 6. Verify

Run these in order and report each result:

1. `npx prisma validate`: the schema is valid and `prisma.config.ts` loads.
2. `npx prisma migrate status`: the database is reachable and migrations are applied (if models exist).
3. `npx prisma generate`: the client is generated into `src/generated/prisma`.
4. `npx tsc --noEmit`: every import of `generated/prisma/...` resolves.
5. `npm run dev`: the console prints `Connected to the database successfully.`.

---

## 7. Gotchas

- **`Cannot find module '../../generated/prisma/client'`**: `npx prisma generate` hasn't run since cloning or since the last schema change.
- **`DATABASE_URL` resolves to empty / "Environment variable not found"**: `.env` is missing or not in the project root, or `import 'dotenv/config'` is missing from `prisma.config.ts`. Prisma 7 doesn't load `.env` by itself.
- **`P1000` authentication failed**: wrong user or password in the URL, or a password with special characters that weren't URL-encoded.
- **`P1001` can't reach database server**: Postgres isn't running, or the host or port is wrong.
- **Migration drift / "the migration was modified after it was applied"**: someone edited an applied `migration.sql`. Never edit applied migrations; create a new one. Resetting fixes it but deletes the data, so ask the user first.
- **Moving `schema.prisma`**: `output` in the generator is relative to the schema file. Moving the file changes where the client is generated.
- **Biome config in the original** ignores `!src/genrated` (a typo for `generated`). It still works only because Biome's `vcs.useIgnoreFile` reads `.gitignore`, which lists `/src/generated`. If you copy that Biome config, fix the spelling.
- **`npm start` on the `tsc` build**: imports omit `.js` extensions (`moduleResolution: "bundler"`). `npm run dev` (tsx) works, but running the compiled output with plain `node` can fail with `ERR_MODULE_NOT_FOUND`.
