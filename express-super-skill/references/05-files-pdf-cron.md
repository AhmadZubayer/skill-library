# 05 · File uploads, PDFs and cron jobs

The clients and helpers are scaffolded (`lib/multer.ts`, `lib/cloudinary.ts`, `utils/uploadToCloudinary.ts`, `utils/generatePdf.ts`, `lib/cron.ts`). This file shows how to use them in the project's own modules.

## 1. How uploads work

- **Multer keeps files in memory** as a `Buffer`; nothing is written to the server's disk. Use it as route middleware, after `auth` and before the controller.
- **`uploadToCloudinary(buffer)`** streams the buffer to Cloudinary and returns the result.
- Always store **both** values Cloudinary returns: `secure_url` (to show the file) and `public_id` (to delete or replace it later). In a model that is two columns, for example `imageUrl` and `imagePublicId`.
- If the requirements limit size or type, add `limits` / `fileFilter` in `lib/multer.ts`:

  ```ts
  export const upload = multer({
  	storage: storage,
  	limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  });
  ```

## 2. Single file upload, end to end

**Route:**

```ts
userRoutes.patch(
	"/profile-image",
	auth(),
	upload.single("profileImage"),
	userController.uploadProfileImage,
);
```

**Controller:**

```ts
const uploadProfileImage = catchAsync(async (req: Request, res: Response) => {
	if (!req.file) {
		throw new AppError(httpStatus.BAD_REQUEST, "No File Provided.");
	}

	const result = await userService.uploadProfileImageIntoDB(
		req.file.buffer,
		req.user!.id,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Profile image updated successfully",
		data: result,
	});
});
```

**Service:** upload the new file, save its URL and public id, then delete the old file. The old one is removed last, so a failed upload never leaves the user without an image.

```ts
const uploadProfileImageIntoDB = async (buffer: Buffer, userId: string) => {
	const currentUser = await prisma.user.findUnique({
		where: {
			id: userId,
		},
		select: {
			imagePublicId: true,
			imageUrl: true,
		},
	});

	const cloudinaryResult = await uploadToCloudinary(buffer);

	const updatedUser = await prisma.user.update({
		where: {
			id: userId,
		},

		data: {
			imageUrl: cloudinaryResult.secure_url,
			imagePublicId: cloudinaryResult.public_id,
		},

		omit: {
			password: true,
		},
	});

	if (currentUser?.imagePublicId && currentUser.imageUrl) {
		await deleteFromCloudinary(currentUser.imagePublicId);
	}

	return updatedUser;
};
```

Client request: `multipart/form-data` with one file field named `profileImage`.

## 3. Several files plus JSON in one request

A multipart request can't carry a JSON body, so the client sends the JSON as a string field named `data` next to the files. `validateRequest` can't be used here; the controller parses and validates `data` itself.

**Route:**

```ts
applicationRoutes.post(
	"/apply",
	upload.fields([
		{
			name: "resume",
			maxCount: 1,
		},

		{
			name: "additionalFiles",
			maxCount: 10,
		},
	]),
	applicationController.createApplication,
);
```

**Controller:**

```ts
const createApplication = catchAsync(async (req: Request, res: Response) => {
	const files = req.files as { [fieldname: string]: Express.Multer.File[] };
	const resume = files?.["resume"] ? files["resume"][0] : null;
	const additionalFiles = files?.["additionalFiles"] || [];

	if (!resume) {
		throw new AppError(httpStatus.BAD_REQUEST, "Resume is required");
	}

	const zodValidationResult = applicationValidation.createApplicationSchema.safeParse(
		JSON.parse(req.body.data),
	);

	if (!zodValidationResult.success) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			zodValidationResult.error.issues[0].message,
		);
	}

	const payload = zodValidationResult.data;

	const result = await applicationService.createApplicationIntoDB(
		payload,
		resume,
		additionalFiles,
	);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Application submitted successfully",
		data: result,
	});
});
```

**Service:** upload first, then write the database row. Several files go up in parallel; their metadata is stored in a `Json` column as `[{ url, publicId }]`.

```ts
const resumeUploadResult = await uploadToCloudinary(resume.buffer);

const additionalFilesUploadResults = await Promise.all(
	additionalFiles.map((file) => uploadToCloudinary(file.buffer)),
);

const application = await prisma.application.create({
	data: {
		...payload,
		resume: resumeUploadResult.secure_url,
		resumePublicId: resumeUploadResult.public_id,
		additionalFiles: additionalFilesUploadResults.map((file) => ({
			url: file.secure_url,
			publicId: file.public_id,
		})),
	},
});
```

Uploads are network calls: keep them outside `prisma.$transaction`. If the database write fails after the upload, delete the uploaded files in the `catch`.

## 4. PDFs

`generatePdf` collects a PDFKit document into one `Buffer`, which can then be emailed, uploaded or sent as a download. Draw the content in the callback.

```ts
const pdfBuffer = await generatePdf((pdfDocument) => {
	pdfDocument.fontSize(20).text(config.app_name, { align: "center" });
	pdfDocument.fontSize(14).text("Invoice", { align: "center" });
	pdfDocument.moveDown(2);

	pdfDocument.fontSize(12).text(`Customer Name: ${booking.customer.name}`);
	pdfDocument.text(`Customer Email: ${booking.customer.email}`);
	pdfDocument.moveDown();

	pdfDocument.text(`Service: ${booking.service.title}`);
	pdfDocument.text(`Date: ${booking.startAt.toDateString()}`);
	pdfDocument.moveDown();

	pdfDocument.text(`Amount Paid: ${payment.amount.toString()} BDT`);
	pdfDocument.text(`Payment Method: ${payment.provider}`);
	pdfDocument.text(`Transaction Id: ${payment.providerTransactionId}`);
	pdfDocument.text(`Paid At: ${payment.paidAt?.toISOString()}`);
});
```

A list section:

```ts
pdfDocument.fontSize(14).text("Items");
pdfDocument.moveDown(0.5);

for (let i = 0; i < items.length; i++) {
	const item = items[i];

	pdfDocument.fontSize(12).text(`${i + 1}. ${item.name}`);
	pdfDocument.text(`   Quantity: ${item.quantity}`);

	if (item.note) {
		pdfDocument.text(`   Note: ${item.note}`);
	}

	pdfDocument.moveDown(0.5);
}
```

The building blocks are `fontSize(n)`, `text(string, { align })` and `moveDown(lines)`; they chain.

**Deliver as an email attachment** (create a small `invoice.ejs` template first):

```ts
await sendEmail({
	to: booking.customer.email,
	subject: `Your Invoice - ${config.app_name}`,
	templateName: "invoice",
	templateData: {
		name: booking.customer.name,
	},
	attachments: [
		{
			filename: "invoice.pdf",
			content: pdfBuffer,
		},
	],
});
```

**Store on Cloudinary** (keep the URL and public id on the row):

```ts
const uploadResult = await uploadToCloudinary(pdfBuffer, {
	resource_type: "raw",
	format: "pdf",
});

await prisma.booking.update({
	where: { id: booking.id },
	data: {
		invoiceUrl: uploadResult.secure_url,
		invoicePublicId: uploadResult.public_id,
	},
});
```

**Send as a direct download** (in a controller):

```ts
res.setHeader("Content-Type", "application/pdf");
res.setHeader("Content-Disposition", 'attachment; filename="invoice.pdf"');
res.status(httpStatus.OK).send(pdfBuffer);
```

Generating, uploading and emailing a PDF are slow. Do them after the database transaction has committed, and wrap them in `try/catch` with `logger.error` so a mail failure doesn't undo a successful payment.

## 5. Cron jobs

All scheduled jobs live in `lib/cron.ts`; `startCronJobs()` is called once from `server.ts`. Add a job as one function and call it from `startCronJobs`:

```ts
// every midnight: remove bookings that were never accepted
const deleteExpiredBookingRequests = () => {
	cron.schedule("0 0 * * *", async () => {
		try {
			const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

			const deletedBookings = await prisma.booking.deleteMany({
				where: {
					status: BookingStatus.REQUESTED,
					createdAt: { lt: oneDayAgo },
				},
			});

			if (deletedBookings.count > 0) {
				logger.info(
					{ count: deletedBookings.count },
					"Cron: Deleted expired booking requests",
				);
			}
		} catch (error) {
			logger.error({ err: error }, "Cron: Failed to delete expired booking requests");
		}
	});
};
```

- Schedule format: `minute hour day-of-month month day-of-week`. `*/10 * * * *` is every 10 minutes, `0 * * * *` every hour, `0 0 * * *` every midnight, `0 9 * * 1` Mondays at 09:00.
- Each job has its own `try/catch`, so one failing run never stops the scheduler or the server.
- Write jobs so that running twice does no harm (`updateMany` / `deleteMany` with a condition).
- Typical jobs: cleaning up expired or abandoned records, sending reminders, releasing held stock or slots.
- Cron runs inside the server process, so it doesn't run on serverless hosts. Say so in the final report if the project is deployed that way.
