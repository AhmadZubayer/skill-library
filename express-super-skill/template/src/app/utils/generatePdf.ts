import PDFDocument from "pdfkit";

export const generatePdf = (build: (pdfDocument: PDFKit.PDFDocument) => void) => {
	return new Promise<Buffer>((resolve, reject) => {
		const pdfDocument = new PDFDocument({ margin: 50 });

		const pdfChunks: Buffer[] = [];

		pdfDocument.on("data", (chunk: Buffer) => {
			pdfChunks.push(chunk);
		});

		pdfDocument.on("end", () => {
			resolve(Buffer.concat(pdfChunks));
		});

		pdfDocument.on("error", reject);

		build(pdfDocument);

		pdfDocument.end();
	});
};
