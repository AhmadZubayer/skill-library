import cron from "node-cron";
// @feature stripe|bkash
import { PaymentStatus } from "../../generated/prisma/enums";
// @end
import { logger } from "./logger";
// @feature stripe|bkash
import { prisma } from "./prisma";
// @end

// @feature stripe|bkash
// every 10 minutes: close payments that were started but never finished
const cancelStalePendingPayments = () => {
	cron.schedule("*/10 * * * *", async () => {
		try {
			const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

			const cancelledPayments = await prisma.payment.updateMany({
				where: {
					status: PaymentStatus.PENDING,
					createdAt: { lt: oneHourAgo },
				},
				data: {
					status: PaymentStatus.CANCELLED,
				},
			});

			if (cancelledPayments.count > 0) {
				logger.info(
					{ count: cancelledPayments.count },
					"Cron: Cancelled stale pending payments older than 1 hour",
				);
			}
		} catch (error) {
			logger.error({ err: error }, "Cron: Failed to cancel stale pending payments");
		}
	});
};
// @end

export const startCronJobs = () => {
	// @feature stripe|bkash
	cancelStalePendingPayments();
	// @end

	logger.info("Cron jobs scheduled");
};
