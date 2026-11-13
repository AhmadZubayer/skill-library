import { Router } from "express";
import { UserRole } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { paymentController } from "./payment.controller";
import { paymentValidation } from "./payment.validation";
import { validateParams } from "../../middleware/validateParams";

export const paymentRoutes = Router();

paymentRoutes.post(
    "/create",
    auth(UserRole.USER),
    validateRequest(paymentValidation.createPaymentSchema),
    paymentController.createPayment
);

paymentRoutes.get(
    "/",
    auth(UserRole.USER),
    paymentController.getMyPayments
);

paymentRoutes.get(
    "/:id",
    auth(UserRole.USER),
    validateParams(paymentValidation.getPaymentParamsSchema),
    paymentController.getPaymentById
);
