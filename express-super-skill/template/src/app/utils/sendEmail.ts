import ejs from "ejs";
import type { Attachment } from "nodemailer/lib/mailer";
import path from "path";
import config from "../config";
import { transporter } from "../lib/nodemailer";

interface ISendEmailPayload {
	to: string;
	subject: string;
	templateName: string;
	templateData?: Record<string, unknown>;
	attachments?: Attachment[];
}

export const sendEmail = async (payload: ISendEmailPayload) => {
	const templatePath = path.join(
		process.cwd(),
		`src/app/templates/${payload.templateName}.ejs`,
	);

	const html = await ejs.renderFile(templatePath, {
		appName: config.app_name,
		...payload.templateData,
	});

	await transporter.sendMail({
		from: config.email_sender,
		to: payload.to,
		subject: payload.subject,
		html,
		attachments: payload.attachments,
	});
};
