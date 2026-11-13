import httpStatus from "http-status";
import { PaymentProvider } from "../../../../generated/prisma/enums";
import { AppError } from "../../../utils/AppError";
import { IPaymentProvider } from "../payment.interface";
// @feature bkash
import { bkashPaymentProvider } from "./bkash/bkash.provider";
// @end
// @feature stripe
import { stripePaymentProvider } from "./stripe/stripe.provider";
// @end

export const getPaymentProvider = (provider: PaymentProvider): IPaymentProvider => {
    switch (provider) {
        // @feature stripe
        case PaymentProvider.STRIPE:
            return stripePaymentProvider;
        // @end

        // @feature bkash
        case PaymentProvider.BKASH:
            return bkashPaymentProvider;
        // @end

        default:
            throw new AppError(httpStatus.NOT_IMPLEMENTED, "Payment provider is not supported");
    }
}
