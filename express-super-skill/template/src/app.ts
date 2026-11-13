import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Application, type Request, type Response } from "express";
import httpStatus from "http-status";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import config from "./app/config";
import { logger } from "./app/lib/logger";
import { swaggerDocument } from "./app/lib/swagger";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler";
import { notFound } from "./app/middleware/notFound";
import { authRoutes } from "./app/module/auth/auth.route";
// @feature example
import { adminCategoryRoutes, categoryRoutes } from "./app/module/category/category.route";
// @end
// @feature stripe|bkash
import { paymentRoutes } from "./app/module/payment/payment.route";
// @end
// @feature bkash
import { bkashRoutes } from "./app/module/payment/providers/bkash/bkash.route";
// @end
// @feature stripe
import {
	stripeReturnRoutes,
	stripeWebhookRoutes,
} from "./app/module/payment/providers/stripe/stripe.route";
// @end

const app: Application = express();

app.use(
	cors({
		origin: config.frontend_url,
		credentials: true,
	}),
);

// @feature stripe
// Stripe needs the raw body, so this route is mounted before express.json()
app.use("/api/payments/webhook", stripeWebhookRoutes);
// @end

// Middleware to parse JSON bodies
app.use(express.json());
// Enable URL-encoded form data parsing
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(pinoHttp({ logger }));

// Basic route
app.get("/", (req: Request, res: Response) => {
	res.status(httpStatus.OK).json({
		success: true,
		message: `Welcome to ${config.app_name}. Navigate to /docs for API documentation`,
	});
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use("/api/auth", authRoutes);
// @feature example
app.use("/api/admin/categories", adminCategoryRoutes);
app.use("/api/categories", categoryRoutes);
// @end
// @feature stripe
app.use("/api/payments/return", stripeReturnRoutes);
// @end
// @feature bkash
app.use("/api/payments/bkash", bkashRoutes);
// @end
// @feature stripe|bkash
app.use("/api/payments", paymentRoutes);
// @end

app.use(notFound);
app.use(globalErrorHandler);

export default app;
