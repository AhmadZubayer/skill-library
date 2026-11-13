# 03 · Building a module

Every resource in the requirements becomes one folder in `src/app/module/`, with exactly six files. This file shows a complete example module (`category`) and then the variations.

Build order for a new module: **model → interface → validation → service → controller → route → docs → mount in `app.ts`**.

## Contents

1. The six files, with the full example
2. Mounting the routes
3. Variations: params, query, logged-in user, role-based routers
4. Validation and sanitization cookbook
5. Swagger docs cookbook
6. Checklist

---

## 1. The six files

### `category.interface.ts`: payload types

One interface per request payload. Names start with `I`.

```ts
export interface ICreateCategory {
    name: string;
    slug: string;
    description?: string;
}
```

### `category.validation.ts`: Zod schemas

One schema per payload, named `...Schema`, exported together in one `<name>Validation` object. Sanitize here: trim strings, lower-case slugs and emails, give every rule a human message.

```ts
import { z } from "zod";

const createCategorySchema = z.object({
    name: z.string().trim().min(2, "Name must contain at least 2 characters"),
    slug: z.string().trim().toLowerCase().regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Slug must contain letters, numbers, and single hyphens"
    ),
    description: z.string().trim().optional()
});

export const categoryValidation = {
    createCategorySchema
}
```

### `category.service.ts`: business rules and database

Only services touch Prisma. Each function is named for what it does to the database (`...IntoDB`, `...FromDB`), throws `AppError` when a rule is broken, and returns plain data. All functions are exported in one `<name>Service` object.

```ts
import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { ICreateCategory } from "./category.interface";

const createCategoryIntoDB = async (payload: ICreateCategory) => {
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

    const category = await prisma.category.create({
        data: payload
    });

    return category;
}

const getAllCategoriesFromDB = async () => {
    const categories = await prisma.category.findMany({
        where: {
            isActive: true
        },
        orderBy: {
            name: "asc"
        }
    });

    return categories;
}

const getAllCategoriesForAdminFromDB = async () => {
    const categories = await prisma.category.findMany({
        orderBy: {
            name: "asc"
        }
    });

    return categories;
}

export const categoryService = {
    createCategoryIntoDB,
    getAllCategoriesFromDB,
    getAllCategoriesForAdminFromDB
}
```

### `category.controller.ts`: HTTP in, HTTP out

Each handler is wrapped in `catchAsync`, reads the request, calls one service function, and answers with `sendResponse`. No Prisma and no business rules here.

```ts
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { categoryService } from "./category.service";

const createCategory = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const payload = req.body;

    const category = await categoryService.createCategoryIntoDB(payload);

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.CREATED,
        message: "Category created successfully",
        data: category
    });
});

const getAllCategories = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const categories = await categoryService.getAllCategoriesFromDB();

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "Categories retrieved successfully",
        data: categories
    });
});

const getAllCategoriesForAdmin = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const categories = await categoryService.getAllCategoriesForAdminFromDB();

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "Categories retrieved successfully",
        data: categories
    });
});

export const categoryController = {
    createCategory,
    getAllCategories,
    getAllCategoriesForAdmin
}
```

### `category.route.ts`: paths and middleware chains

A module exports one named Router per audience. Here the public router and the admin router are separate, so they can be mounted at different base paths. Chain order: `auth` → `validate...` → controller.

```ts
import { Router } from "express";
import { UserRole } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { categoryController } from "./category.controller";
import { categoryValidation } from "./category.validation";

export const adminCategoryRoutes = Router();
export const categoryRoutes = Router();

adminCategoryRoutes.post(
    "/",
    auth(UserRole.ADMIN),
    validateRequest(categoryValidation.createCategorySchema),
    categoryController.createCategory
);

categoryRoutes.get(
    "/",
    categoryController.getAllCategories
);

adminCategoryRoutes.get(
    "/",
    auth(UserRole.ADMIN),
    categoryController.getAllCategoriesForAdmin
);
```

### `category.docs.ts`: Swagger

One `@openapi` block per endpoint. The file has no code; `swagger-jsdoc` reads the comments. Protected endpoints add `security: - bearerAuth: []`. List every status code the endpoint can return.

```ts
/**
 * @openapi
 * /api/categories:
 *   get:
 *     tags:
 *       - Category
 *     summary: List active categories
 *     responses:
 *       200:
 *         description: Returns active categories sorted by name
 */

/**
 * @openapi
 * /api/admin/categories:
 *   post:
 *     tags:
 *       - Category
 *     summary: Create a category (admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, slug]
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *               slug:
 *                 type: string
 *                 pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$'
 *                 example: home-repair
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Category created successfully
 *       400:
 *         description: Invalid category data
 *       401:
 *         description: Access token is missing or invalid
 *       403:
 *         description: User is not an admin or account is blocked
 *       409:
 *         description: Category name or slug already exists
 */

/**
 * @openapi
 * /api/admin/categories:
 *   get:
 *     tags:
 *       - Category
 *     summary: List all categories (admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Returns all categories, including inactive ones, sorted by name
 *       401:
 *         description: Access token is missing or invalid
 *       403:
 *         description: User is not an admin or account is blocked
 */
```

---

## 2. Mounting the routes

In `src/app.ts`, import the router(s) and mount them under `/api/<plural>`:

```ts
import { adminCategoryRoutes, categoryRoutes } from "./app/module/category/category.route";

app.use("/api/admin/categories", adminCategoryRoutes);
app.use("/api/categories", categoryRoutes);
```

The full path in the docs file (`/api/admin/categories`) must match the mount path plus the route path.

---

## 3. Variations

### Route with URL params and the logged-in user

```ts
paymentRoutes.get(
    "/:id",
    auth(UserRole.USER),
    validateParams(paymentValidation.getPaymentParamsSchema),
    paymentController.getPaymentById
);
```

Validation schema for the params:

```ts
const getPaymentParamsSchema = z.object({
    id: z.uuid("A valid payment ID is required")
});
```

Controller: validated params come from `res.locals.validatedParams`, the user from `req.user`:

```ts
const getPaymentById = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
        throw new AppError(httpStatus.UNAUTHORIZED, "Please log in to access this resource");
    }

    const { id } = res.locals.validatedParams as { id: string };

    const payment = await paymentService.getPaymentByIdFromDB(
        id,
        req.user.id
    );

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "Payment retrieved successfully",
        data: payment
    });
});
```

The service receives the user's id and uses it in the `where`, so users can only reach their own rows:

```ts
const payment = await prisma.payment.findFirst({
    where: {
        id,
        booking: {
            customerId
        }
    }
});

if (!payment) {
    throw new AppError(httpStatus.NOT_FOUND, "Payment not found");
}
```

### Route with a validated query string

```ts
categoryRoutes.get(
    "/",
    validateQuery(categoryValidation.getCategoriesQuerySchema),
    categoryController.getAllCategories
);
```

```ts
const getCategoriesQuerySchema = z.object({
    searchTerm: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sortBy: z.enum(["createdAt", "name"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
    isActive: z.enum(["true", "false"]).optional()
});
```

```ts
const getAllCategories = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const query = res.locals.validatedQuery;

    const { data, meta } = await categoryService.getAllCategoriesFromDB(query);

    sendResponse(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: "Categories retrieved successfully",
        data,
        meta
    });
});
```

The matching service function is in `references/02-prisma.md`, section 7.

### Update and delete

```ts
const updateCategoryIntoDB = async (id: string, payload: IUpdateCategory) => {
    const isCategoryExist = await prisma.category.findUnique({
        where: {
            id
        }
    });

    if (!isCategoryExist) {
        throw new AppError(httpStatus.NOT_FOUND, "Category not found");
    }

    const category = await prisma.category.update({
        where: {
            id
        },
        data: payload
    });

    return category;
}
```

- Update routes use `PATCH /:id`, and the update schema makes every field `.optional()`.
- Prefer soft delete (`isDeleted: true, deletedAt: new Date()` or `isActive: false`) for anything other records point to. Filter soft-deleted rows out in every read.
- If the write touches more than one table, or checks state first, use a transaction (`references/02-prisma.md`, section 6).

---

## 4. Validation and sanitization cookbook

```ts
import { z } from "zod";
import { UserRole } from "../../../generated/prisma/enums";

// text: always trim; give min/max with a message
name: z.string().trim().min(2, "Name must contain at least 2 characters").max(100),

// optional text
description: z.string().trim().max(1000).optional(),

// email: trim + lower-case so "A@B.com " and "a@b.com" are the same account
email: z.email("Invalid email address").trim().toLowerCase(),

// strong password
password: z
    .string()
    .min(8, "Password Must Minimum 8 Characters Long.")
    .regex(/[a-z]/, "Password must contain atleast 1 Lowercase Letter")
    .regex(/[A-Z]/, "Password must contain atleast 1 Uppercase Letter")
    .regex(/[0-9]/, "Password must contain atleast 1 Number")
    .regex(/[^A-Za-z0-9]/, "Password must contain atleast 1 Special Character"),

// ids
id: z.uuid("A valid ID is required"),

// numbers: coerce in query strings and multipart forms, plain in JSON bodies
price: z.number().min(0, "Price cannot be negative"),
page: z.coerce.number().int().min(1).optional(),

// dates
startAt: z.coerce.date("Invalid Start Date Time"),

// Prisma enums and fixed choices
role: z.enum(UserRole),
status: z.enum(["ONGOING", "COMPLETED"], "Status Must Be Either ONGOING Or COMPLETED"),

// urls, slugs, otp
link: z.url("Invalid Link").trim(),
slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain letters, numbers, and single hyphens"),
otp: z.string().length(6),

// arrays of objects
items: z.array(z.object({
    name: z.string().trim().min(1, "Name Is Required"),
    quantity: z.number().int().min(1)
})).min(1, "At Least One Item Is Required"),
```

Rules:

- `z.object` drops keys that aren't in the schema, so clients can't sneak in fields like `role` or `isDeleted`. Never add those fields to a public schema.
- Cross-field rules use `.refine` on the object: `.refine((data) => data.endAt > data.startAt, { message: "End must be after start", path: ["endAt"] })`.
- Multipart forms send JSON as a string field named `data`. Validate it in the controller: `schema.safeParse(JSON.parse(req.body.data))`, and throw `AppError(400, issues[0].message)` on failure (`references/05-files-pdf-cron.md`).

---

## 5. Swagger docs cookbook

A protected endpoint with a body, path parameter and query parameter:

```ts
/**
 * @openapi
 * /api/categories/{id}:
 *   patch:
 *     tags:
 *       - Category
 *     summary: Update a category (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: notify
 *         schema:
 *           type: boolean
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *     responses:
 *       200:
 *         description: Category updated successfully
 *       400:
 *         description: Invalid category data
 *       401:
 *         description: Access token is missing or invalid
 *       403:
 *         description: User is not an admin or account is blocked
 *       404:
 *         description: Category not found
 */
```

- One tag per module, capitalised singular.
- For file uploads use `multipart/form-data` as the content type, with `type: string, format: binary` for each file field.
- Keep the docs in step with the Zod schema: same required fields, same limits.

---

## 6. Checklist for every module

- [ ] Model file in `prisma/models/`, enums in `enums.prisma`, migration created, client generated
- [ ] Six files, named `<name>.<kind>.ts`
- [ ] Every body, params and query has a Zod schema wired into the route
- [ ] Controllers use `catchAsync` and `sendResponse` only
- [ ] Services throw `AppError` with the right status code
- [ ] Multi-step writes use a transaction
- [ ] Users can reach only their own rows (owner id in the `where`)
- [ ] Routes mounted in `app.ts`
- [ ] One `@openapi` block per endpoint, visible at `/docs`
