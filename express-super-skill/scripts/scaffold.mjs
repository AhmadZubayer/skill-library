// Copies the project template into a target folder, keeping only the chosen features.
//
// Usage:  node scaffold.mjs <target-folder> [--features google,uploads,pdf,stripe,bkash,cron,example] [--force]
//
// Core (config, logger, error handling, validation, Swagger, Prisma, password auth with OTP,
// Redis, mailer) is always included. Existing files are never overwritten unless --force is given.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FEATURES = ["google", "uploads", "pdf", "stripe", "bkash", "cron", "example"];

// Files and folders that exist only for certain features ("a|b" means either).
const FEATURE_PATHS = [
	["google", "src/app/lib/googleAuth.ts"],
	["uploads", "src/app/lib/multer.ts"],
	["uploads", "src/app/lib/cloudinary.ts"],
	["uploads", "src/app/utils/uploadToCloudinary.ts"],
	["pdf", "src/app/utils/generatePdf.ts"],
	["cron", "src/app/lib/cron.ts"],
	["stripe", "src/app/lib/stripe.ts"],
	["stripe", "src/app/module/payment/providers/stripe/"],
	["bkash", "src/app/lib/bkash.ts"],
	["bkash", "src/app/module/payment/providers/bkash/"],
	["stripe|bkash", "src/app/module/payment/"],
	["stripe|bkash", "prisma/models/payment.prisma"],
	["stripe|bkash", "prisma/models/booking.prisma"],
	["stripe|bkash", "prisma/models/service.prisma"],
	["example", "src/app/module/category/"],
	["example", "prisma/models/category.prisma"],
];

const PACKAGES = {
	core: {
		deps: "express@5 cors cookie-parser dotenv http-status zod@4 pino@10 pino-http@11 swagger-jsdoc@6 swagger-ui-express@5 @prisma/client@7 @prisma/adapter-pg@7 pg@8 jsonwebtoken@9 bcryptjs@3 redis@6 nodemailer@9 ejs@6",
		dev: "typescript@7 tsx@4 tsup@8 prisma@7 pino-pretty @biomejs/biome@2.5.7 @types/node @types/express@5 @types/cors @types/cookie-parser @types/pg @types/swagger-jsdoc @types/swagger-ui-express @types/jsonwebtoken @types/nodemailer @types/ejs",
	},
	google: { deps: "google-auth-library@11" },
	uploads: { deps: "multer@2 cloudinary@2", dev: "@types/multer" },
	pdf: { deps: "pdfkit@0", dev: "@types/pdfkit" },
	stripe: { deps: "stripe@23" },
	cron: { deps: "node-cron@4" },
};

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--"));
const force = args.includes("--force");
const featureArg = args.find((a) => a.startsWith("--features"));
const featureValue = featureArg?.includes("=")
	? featureArg.split("=")[1]
	: featureArg
		? args[args.indexOf(featureArg) + 1]
		: "";
const enabled = new Set((featureValue || "").split(",").map((f) => f.trim()).filter(Boolean));

if (!target || target === featureValue) {
	console.log(`Usage: node scaffold.mjs <target-folder> [--features ${FEATURES.join(",")}] [--force]`);
	process.exit(2);
}
for (const feature of enabled) {
	if (!FEATURES.includes(feature)) {
		console.log(`Unknown feature "${feature}". Known: ${FEATURES.join(", ")}`);
		process.exit(2);
	}
}

const isOn = (expression) => expression.split("|").some((name) => enabled.has(name));

const templateRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "template");
const walk = (dir) =>
	fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
	);

// A file is included when every feature rule whose path matches it is switched on.
const isIncluded = (rel) =>
	FEATURE_PATHS.filter(([, prefix]) => rel === prefix || (prefix.endsWith("/") && rel.startsWith(prefix))).every(
		([expression]) => isOn(expression),
	);

// Removes "@feature x" ... "@end" blocks for features that are off, and the marker lines themselves.
const stripMarkers = (text) => {
	const out = [];
	const stack = [];
	for (const line of text.split("\n")) {
		const start = line.match(/^\s*(?:\/\/|#)\s*@feature\s+(\S+)\s*$/);
		if (start) {
			stack.push(isOn(start[1]));
			continue;
		}
		if (/^\s*(?:\/\/|#)\s*@end\s*$/.test(line)) {
			stack.pop();
			continue;
		}
		if (stack.every(Boolean)) out.push(line);
	}
	return out.join("\n").replace(/\n{3,}/g, "\n\n");
};

const projectName = path.basename(path.resolve(target)).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
const created = [];
const skipped = [];

for (const file of walk(templateRoot)) {
	const rel = path.relative(templateRoot, file).split(path.sep).join("/");
	if (!isIncluded(rel)) continue;

	// "gitignore" and "env.example" are stored without the dot so tools don't hide or drop them.
	const outRel = rel === "gitignore" ? ".gitignore" : rel === "env.example" ? ".env.example" : rel;
	const destination = path.join(target, outRel);

	if (fs.existsSync(destination) && !force) {
		skipped.push(outRel);
		continue;
	}

	let content = stripMarkers(fs.readFileSync(file, "utf8"));
	if (rel === "package.json") content = content.replace("__PROJECT_NAME__", projectName);

	fs.mkdirSync(path.dirname(destination), { recursive: true });
	fs.writeFileSync(destination, content);
	created.push(outRel);
}

const on = ["core", ...FEATURES.filter((f) => enabled.has(f))];
const deps = on.map((f) => PACKAGES[f]?.deps).filter(Boolean).join(" ");
const dev = on.map((f) => PACKAGES[f]?.dev).filter(Boolean).join(" ");
const envGroups = ["core", "auth", ...["google", "uploads", "stripe", "bkash"].filter((f) => enabled.has(f))];

console.log(`Features: ${on.join(", ")}`);
console.log(`Created ${created.length} file(s) in ${path.resolve(target)}`);
if (skipped.length) {
	console.log(`\nSkipped ${skipped.length} existing file(s) (use --force to overwrite):`);
	for (const s of skipped) console.log(`  ${s}`);
}
console.log("\nNext steps, from the project folder:");
console.log(`  npm install ${deps}`);
console.log(`  npm install -D ${dev}`);
console.log("  copy .env.example to .env and fill it in, then:");
console.log(`  node "${path.join(path.dirname(fileURLToPath(import.meta.url)), "check-env.mjs")}" ${envGroups.join(" ")}`);
console.log("  npx prisma migrate dev --name init");
console.log("  npx prisma generate");
console.log("  npm run format:fix");
