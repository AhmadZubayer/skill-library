/**
 * @openapi
 * /api/payments/bkash/callback:
 *   get:
 *     tags:
 *       - Payment
 *     summary: Receive the customer's return from bKash
 *     description: bKash redirects the customer's browser to this URL. The server executes the payment with bKash and then redirects to the frontend. It cannot be tested with an ordinary request from Swagger UI.
 *     parameters:
 *       - in: query
 *         name: paymentID
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         required: true
 *         schema:
 *           type: string
 *           enum: [success, failure, cancel]
 *     responses:
 *       302:
 *         description: Redirects to the frontend payment result page
 *       400:
 *         description: Missing paymentID or status
 *       404:
 *         description: Payment not found
 */
