import "dotenv/config";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { UserRole } from "../src/generated/prisma/enums";
import { prisma } from "../src/app/lib/prisma";

const adminEnvSchema = z.object({
    ADMIN_NAME: z.string().min(2),
    ADMIN_EMAIL: z.email(),
    ADMIN_PASSWORD: z.string().min(8),
    BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10)
});

const seedAdmin = async () => {
    const env = adminEnvSchema.parse(process.env);
    const email = env.ADMIN_EMAIL.toLowerCase();

    const existingUser = await prisma.user.findUnique({
        where: {
            email
        }
    });

    if (existingUser) {
        if (existingUser.role !== UserRole.ADMIN) {
            throw new Error("Admin email already belongs to a non-admin user");
        }

        console.log("Admin user already exists");
        return;
    }

    const password = await bcrypt.hash(env.ADMIN_PASSWORD, env.BCRYPT_SALT_ROUNDS);

    await prisma.user.create({
        data: {
            name: env.ADMIN_NAME,
            email,
            password,
            role: UserRole.ADMIN,
            emailVerified: true
        }
    });

    console.log("Admin user created successfully");
}

seedAdmin()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
