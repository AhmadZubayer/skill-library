# 02 · Prisma and the database

## Contents

1. `prisma.config.ts`
2. `prisma/schema.prisma`
3. Models: `prisma/models/`
4. Migrate and generate
5. `src/app/lib/prisma.ts` and `prisma/seed.ts`
6. Transactions
7. Query patterns
8. Commands and gotchas

---

## 1. `prisma.config.ts` (project root)

Already in the template. Prisma 7 reads its settings from this file. `schema: "prisma"` points at the whole `prisma/` folder, so `schema.prisma` and every file in `prisma/models/` are merged into one schema. `import "dotenv/config"` is there because Prisma 7 does not load `.env` by itself.

---

## 2. `prisma/schema.prisma`

Already in the template. It holds the generator and datasource only; no models. The client is generated into `src/generated/prisma`. The datasource has no `url`; that comes from `prisma.config.ts`.

---

## 3. Models: `prisma/models/`

- `enums.prisma` holds every enum.
- Each model has its own file, named after the model in camelCase (`user.prisma`, `orderItem.prisma`).
- Models in different files reference each other without imports.

Design the models from the requirements. If the requirements don't describe the data clearly enough, ask the user rather than guessing.

The template already has `enums.prisma` (`UserRole`, `UserStatus`, and `AuthProvider` with Google login) and `user.prisma`. Rename or add roles to match the requirements (for example `CUSTOMER`, `SELLER`, `ADMIN`); the role given to self-registered users is the `@default` on `User.role`. If you rename `USER`, also change `UserRole.USER` wherever the code uses it. `User.password` is nullable because Google-only users have none.

**Example model** showing the conventions (relations, money, indexes, table name):

```prisma
model Booking {
  id             String        @id @default(uuid())
  status         BookingStatus @default(REQUESTED)
  startAt        DateTime
  endAt          DateTime
  priceAtBooking Decimal       @db.Decimal(10, 2)

  customerId String
  customer   User   @relation(fields: [customerId], references: [id], onDelete: Restrict)

  serviceId String
  service   Service @relation(fields: [serviceId], references: [id], onDelete: Restrict)

  availabilitySlotId String
  availabilitySlot   AvailabilitySlot @relation(fields: [availabilitySlotId], references: [id], onDelete: Restrict)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  payments Payment[]
  review Review?

  @@index([customerId])
  @@index([serviceId])
  @@index([availabilitySlotId])
  @@map("bookings")
}
```

**Field and attribute patterns:**

```prisma
// primary key
  id String @id @default(uuid())

// timestamps (every model)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

// soft delete (models whose rows must never disappear)
  isDeleted Boolean   @default(false)
  deletedAt DateTime?

// enum field with a default
  status         BookingStatus @default(REQUESTED)
// money: fixed-point decimal, never Float
  priceAtBooking Decimal       @db.Decimal(10, 2)
// long text
  comment String? @db.Text
// JSON column
  gatewayResponse Json?

// one-to-many: the "many" side holds the foreign key ...
  customerId String
  customer   User   @relation(fields: [customerId], references: [id], onDelete: Restrict)
// ... and the "one" side lists them
  payments Payment[]

// one-to-one: the foreign key is @unique ...
  userId String @unique
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
// ... and the other side is optional
  review Review?

// model-level: index every foreign key, named compound unique, plural snake_case table name
  @@index([customerId])
  @@unique([customerId, serviceId, startAt], name: "unique_booking")
  @@map("bookings")
```

Conventions:

- Every model ends with `@@map("<plural_snake_case>")`.
- Every foreign key column gets an `@@index`.
- `onDelete: Restrict` for records that carry money or history (orders, payments, reviews). `onDelete: Cascade` only for rows that are part of their parent (a profile of a user).
- Money is `Decimal @db.Decimal(10, 2)`. Copy the price onto the order row at purchase time so later price changes don't rewrite history.
- Run `npx prisma format` after editing.

---

## 4. Migrate and generate

Needs `DATABASE_URL` in `.env` and at least one model. Always pass `--name`.

```bash
npx prisma migrate dev --name init
```

```bash
npx prisma generate
```

- `migrate dev` creates the database if it doesn't exist, writes `prisma/migrations/<timestamp>_<name>/migration.sql`, and applies it.
- Run `prisma generate` after every schema change and after cloning. Nothing compiles until `src/generated/prisma` exists.
- Commit `prisma/migrations/`. Never edit a migration that has been applied; make a new one.
- For later changes: `npx prisma migrate dev --name add_review_table`.

---

## 5. `src/app/lib/prisma.ts` and `prisma/seed.ts`

Both are in the template.

- `lib/prisma.ts` exports the one shared client, built with the `PrismaPg` driver adapter. Never create a second `PrismaClient`.
- `prisma/seed.ts` creates the first admin from `ADMIN_NAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD`. It is safe to run more than once: `npm run db:seed`.

---

## 6. Transactions

Use `prisma.$transaction(async (transaction) => { ... })` whenever:

- one operation writes to more than one row or table and they must all succeed or all fail;
- the code reads a condition and then writes based on it (check a slot is free, then book it).

Rules:

1. **Use the transaction client for every query inside the callback.** A call on the global `prisma` inside the callback runs outside the transaction and is not rolled back.
2. **No network calls inside the callback.** Payment gateways, emails, uploads and PDF generation go before or after it. A transaction holds a database connection open, and the default timeout is 5 seconds.
3. **Throw to roll back.** Throwing `AppError` inside the callback cancels every write in it.
4. **Re-check state inside the transaction.** What was read before the transaction may have changed.
5. **Guard status changes with `updateMany` and check `count`.** Put the expected current status in the `where`; if `count` is 0, another request got there first.
6. **Use `Serializable` isolation for "only one may win" checks**, and turn the resulting `P2034` conflict into a 409.
7. Raise `maxWait` / `timeout` only when the transaction really needs longer, and say why in a comment.

**Pattern A: check, then create, with Serializable isolation.** Two simultaneous requests can't both pass the check.

```ts
  try {
    payment = await prisma.$transaction(
      async (transaction) => {
        const acceptedBooking = await transaction.booking.findFirst({
          where: {
            id: booking.id,
            status: BookingStatus.ACCEPTED,
          },
          select: {
            id: true,
          },
        });

        if (!acceptedBooking) {
          throw new AppError(
            httpStatus.CONFLICT,
            "Booking is no longer accepted",
          );
        }

        const pendingPayment = await transaction.payment.findFirst({
          where: {
            bookingId: booking.id,
            status: PaymentStatus.PENDING,
          },
          select: {
            id: true,
          },
        });

        if (pendingPayment) {
          throw new AppError(
            httpStatus.CONFLICT,
            "A payment is already in progress for this booking",
          );
        }

        return transaction.payment.create({
          data: {
            bookingId: booking.id,
            amount: booking.priceAtBooking,
            provider: selectedProvider,
            status: PaymentStatus.PENDING,
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      throw new AppError(
        httpStatus.CONFLICT,
        "Payment request conflicted. Please try again",
      );
    }

    throw error;
  }
```

**Pattern B: guarded status changes across two tables.** Each `updateMany` only succeeds if the row is still in the expected state; otherwise the whole transaction rolls back.

```ts
    const updatedPayment = await transaction.payment.updateMany({
      where: {
        id: payment.id,
        status: PaymentStatus.PENDING,
        OR: [
          { providerTransactionId: null },
          { providerTransactionId: payload.providerTransactionId },
        ],
      },
      data: {
        status: PaymentStatus.COMPLETED,
        providerTransactionId: payload.providerTransactionId,
        paidAt: new Date(),
      },
    });

    if (updatedPayment.count === 0) {
      throw new AppError(
        httpStatus.CONFLICT,
        "Payment status changed. Please try again",
      );
    }

    const updatedBooking = await transaction.booking.updateMany({
      where: {
        id: payment.bookingId,
        status: BookingStatus.ACCEPTED,
      },
      data: {
        status: BookingStatus.PAID,
      },
    });

    if (updatedBooking.count === 0) {
      throw new AppError(
        httpStatus.CONFLICT,
        "Booking status changed. Please try again",
      );
    }

    return transaction.payment.findUniqueOrThrow({
      where: {
        id: payment.id,
      },
    });
  });
```

**Pattern C: changing a counter.** Never read a number and write back `number - 1`. Let the database do it, guarded by a condition:

```ts
const updatedSlot = await transaction.slot.updateMany({
    where: {
        id: slotId,
        availableSeats: { gt: 0 }
    },
    data: {
        availableSeats: { decrement: 1 }
    }
});

if (updatedSlot.count === 0) {
    throw new AppError(httpStatus.CONFLICT, "No seats left");
}
```

**Options** (third pattern, only when needed):

```ts
	}, {
		maxWait: 10000, // default: 2000
		timeout: 30000, // default: 5000
	});
```

**Work around a network call** in three steps, as the payment flow does: (1) transaction: create the row as `PENDING`; (2) outside: call the external service; (3) update the row with the result, or mark it `FAILED` if the call threw.

---

## 7. Query patterns

**Imports from the generated client.** From `src/app/module/<name>/` the path is `../../../generated/prisma/...`; from `src/app/lib/`, `middleware/` or `utils/` it is `../../generated/prisma/...`.

```ts
// enums as runtime values, e.g. UserRole.ADMIN
import { UserRole, UserStatus } from "../../../generated/prisma/enums";
// the Prisma namespace: error classes, Decimal, isolation levels
import { Prisma } from "../../../generated/prisma/client";
// generated input types, e.g. for building dynamic where-filters
import type { CategoryWhereInput } from "../../../generated/prisma/models";
```

**Never return the password:**

```ts
const user = await prisma.user.findUnique({
    where: { id },
    omit: { password: true }
});
```

**Check for a duplicate before creating** (gives a clear 409 instead of a raw database error):

```ts
    const isCategoryExist = await prisma.category.findFirst({
        where: {
            OR: [
                { name: payload.name },
                { slug: payload.slug }
            ]
        }
    });

    if (isCategoryExist) {
        throw new AppError(httpStatus.CONFLICT, "Category name or slug already exists");
    }
```

**Paginated list with search, filters and sorting.** The controller passes `res.locals.validatedQuery` (or `req.query`) as `query`.

```ts
const getAllCategoriesFromDB = async (query: IQuery) => {
    const limit = query.limit ? Number(query.limit) : 10;
    const page = query.page ? Number(query.page) : 1;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ? query.sortBy : "createdAt";
    const sortOrder = query.sortOrder ? query.sortOrder : "desc";

    const andConditions: CategoryWhereInput[] = [];

    //Searching
    if (query.searchTerm) {
        andConditions.push({
            OR: [
                { name: { contains: query.searchTerm, mode: "insensitive" } },
                { description: { contains: query.searchTerm, mode: "insensitive" } }
            ]
        });
    }

    //filtering
    if (query.isActive !== undefined) {
        andConditions.push({ isActive: query.isActive === "true" });
    }

    const categories = await prisma.category.findMany({
        where: {
            AND: andConditions
        },
        take: limit,
        skip,
        orderBy: {
            [sortBy]: sortOrder
        }
    });

    const total = await prisma.category.count({
        where: {
            AND: andConditions
        }
    });

    return {
        data: categories,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
}
```

In the controller: `const { data, meta } = await categoryService.getAllCategoriesFromDB(query);` then `sendResponse(res, { ..., data, meta })`. Validate `sortBy` with `z.enum([...])` in the query schema so only real column names reach Prisma.

---

## 8. Commands and gotchas

| Command | When |
|---|---|
| `npx prisma migrate dev --name <change>` | after editing models in development |
| `npx prisma generate` | after every schema change and after cloning |
| `npx prisma format` / `npx prisma validate` | tidy / check the schema |
| `npx prisma migrate status` | see what is applied |
| `npx prisma migrate deploy` | production: apply committed migrations |
| `npx prisma studio` | browse data |
| `npx prisma migrate reset` | **destroys all data.** Ask the user first, every time |

- `Cannot find module '.../generated/prisma/client'`: run `npx prisma generate`.
- `DATABASE_URL` empty: `.env` is missing, or `import "dotenv/config"` is missing from `prisma.config.ts`.
- `P1000`: wrong database user or password, or special characters in the password that weren't URL-encoded. `P1001`: PostgreSQL isn't running or the host/port is wrong.
- If PostgreSQL isn't installed or reachable, tell the user and ask how they want to proceed (local install or a hosted database). Don't install database servers without their go-ahead.
