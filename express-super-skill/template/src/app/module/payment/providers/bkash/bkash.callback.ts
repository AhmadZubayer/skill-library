import httpStatus from "http-status";
import {
  PaymentProvider,
  PaymentStatus,
} from "../../../../../generated/prisma/enums";
import config from "../../../../config";
import { bkashRequest } from "../../../../lib/bkash";
import { prisma } from "../../../../lib/prisma";
import { AppError } from "../../../../utils/AppError";
import { paymentService } from "../../payment.service";

const getRedirectUrl = (status: "success" | "failed" | "cancelled") => {
  return `${config.frontend_url}/payment/${status}`;
};

const handleCallback = async (query: Record<string, unknown>) => {
  const paymentID = query.paymentID;
  const status = query.status;

  if (typeof paymentID !== "string" || typeof status !== "string") {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid bKash callback request");
  }

  const payment = await prisma.payment.findUnique({
    where: {
      providerTransactionId: paymentID,
    },
    select: {
      id: true,
      bookingId: true,
      provider: true,
      status: true,
    },
  });

  if (!payment || payment.provider !== PaymentProvider.BKASH) {
    throw new AppError(httpStatus.NOT_FOUND, "Payment not found");
  }

  // the callback can arrive twice (refresh, back button)
  if (payment.status === PaymentStatus.COMPLETED) {
    return { redirectUrl: getRedirectUrl("success") };
  }

  const paymentInfo = {
    paymentId: payment.id,
    bookingId: payment.bookingId,
    provider: PaymentProvider.BKASH,
    providerTransactionId: paymentID,
  };

  if (status !== "success") {
    await paymentService.closePendingPaymentIntoDB({
      ...paymentInfo,
      status:
        status === "cancel" ? PaymentStatus.CANCELLED : PaymentStatus.FAILED,
    });

    return {
      redirectUrl: getRedirectUrl(status === "cancel" ? "cancelled" : "failed"),
    };
  }

  const executedPayment = await bkashRequest("/tokenized/checkout/execute", {
    paymentID,
  });

  if (
    executedPayment.statusCode !== "0000" ||
    executedPayment.transactionStatus !== "Completed"
  ) {
    await paymentService.closePendingPaymentIntoDB({
      ...paymentInfo,
      status: PaymentStatus.FAILED,
    });

    return { redirectUrl: getRedirectUrl("failed") };
  }

  const paidPayment = {
    ...paymentInfo,
    amount: executedPayment.amount as string,
    currency: executedPayment.currency as string,
  };

  try {
    await paymentService.completePaymentIntoDB(paidPayment);
  } catch (error) {
    if (
      !(error instanceof AppError) ||
      error.statusCode !== httpStatus.CONFLICT
    ) {
      throw error;
    }

    // the booking was cancelled while the customer was paying
    await paymentService.refundCancelledBookingPaymentIntoDB(paidPayment);

    return { redirectUrl: getRedirectUrl("cancelled") };
  }

  return { redirectUrl: getRedirectUrl("success") };
};

export const bkashCallback = {
  handleCallback,
};
