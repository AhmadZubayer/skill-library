// Checks the project's .env for the variables each feature needs.
// Usage (from the project root):  node check-env.mjs core auth google uploads stripe bkash
// Prints names only, never values. Exits with code 1 if anything is missing or empty.
import fs from "node:fs";
import path from "node:path";

const REQUIRED = {
	core: ["NODE_ENV", "PORT", "APP_NAME", "DATABASE_URL", "SERVER_URL", "FRONTEND_URL", "LOG_LEVEL"],
	auth: [
		"BCRYPT_SALT_ROUNDS",
		"JWT_ACCESS_SECRET",
		"JWT_REFRESH_SECRET",
		"JWT_ACCESS_EXPIRES_IN",
		"JWT_REFRESH_EXPIRES_IN",
		"REDIS_USER",
		"REDIS_PASSWORD",
		"REDIS_HOST",
		"REDIS_PORT",
		"SMTP_USER",
		"SMTP_PASSWORD",
		"EMAIL_SENDER",
		"ADMIN_NAME",
		"ADMIN_EMAIL",
		"ADMIN_PASSWORD",
	],
	google: ["GOOGLE_CLIENT_ID"],
	uploads: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
	stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
	bkash: ["BKASH_BASE_URL", "BKASH_USERNAME", "BKASH_PASSWORD", "BKASH_APP_KEY", "BKASH_APP_SECRET"],
};

const features = process.argv.slice(2);
if (features.length === 0) {
	console.log(`Usage: node check-env.mjs <${Object.keys(REQUIRED).join("|")}> ...`);
	process.exit(2);
}

const envPath = path.join(process.cwd(), ".env");
const values = {};
if (fs.existsSync(envPath)) {
	for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
		const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
		if (match) values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
	}
} else {
	console.log(".env not found in the current folder. Every variable counts as missing.\n");
}

let problems = 0;
for (const feature of features) {
	const names = REQUIRED[feature];
	if (!names) {
		console.log(`Unknown feature "${feature}". Known: ${Object.keys(REQUIRED).join(", ")}`);
		problems++;
		continue;
	}
	console.log(`[${feature}]`);
	for (const name of names) {
		const state = !(name in values) ? "MISSING" : values[name] === "" ? "EMPTY" : "ok";
		if (state !== "ok") problems++;
		console.log(`  ${state.padEnd(8)}${name}`);
	}
}

console.log(problems ? `\n${problems} variable(s) need a value. Ask the user for them.` : "\nAll required variables are set.");
process.exit(problems ? 1 : 0);
