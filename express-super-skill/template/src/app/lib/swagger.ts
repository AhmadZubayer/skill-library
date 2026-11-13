import swaggerJsdoc from "swagger-jsdoc";
import config from "../config";

const options: swaggerJsdoc.OAS3Options = {
	definition: {
		openapi: "3.0.0",
		info: {
			title: `${config.app_name} API`,
			version: "1.0.0",
		},
		servers: [{ url: "/" }],
		components: {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "JWT",
				},
			},
		},
	},
	apis: ["./src/app/module/**/*.docs.ts"],
};

export const swaggerDocument = swaggerJsdoc(options);
