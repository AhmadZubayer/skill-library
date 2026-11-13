import "dotenv/config";
import config from "./app/config";
// @feature cron
import { startCronJobs } from "./app/lib/cron";
// @end
import { logger } from "./app/lib/logger";
import { transporter } from "./app/lib/nodemailer";
import { prisma } from "./app/lib/prisma";
import { redisClient } from "./app/lib/redis";

const PORT = config.port;

const main = async () => {
	try {
		const { default: app } = await import("./app");

		await prisma.$connect();
		logger.info("Connected to the database successfully.");

		await redisClient.connect();
		logger.info("Redis Connected Successfully.");

		await transporter.verify();
		logger.info("Nodemailer Connected Successfully.");

		// @feature cron
		// cron
		startCronJobs();
		// @end

		app.listen(PORT, () => {
			logger.info({ port: PORT }, "Server is running");
		});
	} catch (error) {
		logger.error({ err: error }, "Error starting the server");
		await prisma.$disconnect();
		process.exit(1);
	}
};

main();
