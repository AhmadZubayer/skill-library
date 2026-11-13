import httpStatus from "http-status";
import config from "../../../../config";
import { bkashRequest } from "../../../../lib/bkash";
import { AppError } from "../../../../utils/AppError";
import { ICreateCheckoutPayload, IPaymentProvider, IRefundPayment } from "../../payment.interface";

const createCheckoutSession = async (payload: ICreateCheckoutPayload) => {
    if (!config.server_url) {
        throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, "SERVER_URL is not configured");
    }

    if (payload.currency.toLowerCase() !== "bdt") {
        throw new AppError(httpStatus.BAD_REQUEST, "Only BDT payments are supported");
    }

    const serverUrl = config.server_url.replace(/\/$/, "");

    const result = await bkashRequest("/tokenized/checkout/create", {
        mode: "0011",
        payerReference: payload.customerEmail,
        callbackURL: `${serverUrl}/api/payments/bkash/callback`,
        amount: payload.amount,
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: payload.paymentId
    });

    if (result.statusCode !== "0000" || !result.paymentID || !result.bkashURL) {
        throw new AppError(
            httpStatus.BAD_GATEWAY,
            result.statusMessage || "bKash payment could not be created"
        );
    }

    return {
        providerTransactionId: result.paymentID as string,
        checkoutUrl: result.bkashURL as string
    };
}

const refundPayment = async (payload: IRefundPayment) => {
    const paymentStatus = await bkashRequest("/tokenized/checkout/payment/status", {
        paymentID: payload.providerTransactionId
    });

    if (!paymentStatus.trxID || !paymentStatus.amount) {
        throw new AppError(httpStatus.CONFLICT, "bKash payment was not found");
    }

    const refund = await bkashRequest("/tokenized/checkout/payment/refund", {
        paymentID: payload.providerTransactionId,
        trxID: paymentStatus.trxID,
        amount: paymentStatus.amount,
        sku: payload.paymentId,
        reason: "Requested by customer"
    });

    if (!refund.refundTrxID) {
        throw new AppError(
            httpStatus.BAD_GATEWAY,
            refund.statusMessage || "bKash refund failed"
        );
    }

    return {
        providerRefundId: refund.refundTrxID as string,
        status: "succeeded"
    };
}

export const bkashPaymentProvider: IPaymentProvider = {
    createCheckoutSession,
    refundPayment
}
