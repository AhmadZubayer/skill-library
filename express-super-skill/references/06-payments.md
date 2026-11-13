# 06 · Payments: Strategy + Adapter (Stripe and bKash)

The payment module is scaffolded complete in `src/app/module/payment/`. This file explains the design, what to rename, and how to add a gateway.

## The design

Stripe and bKash do the same job in different ways. The module hides that difference behind one interface, so the rest of the app never knows which gateway is in use.

| Pattern | Role | File |
|---|---|---|
| **Strategy** | one contract every gateway follows | `IPaymentProvider` in `payment.interface.ts` |
| **Adapter** | one file per gateway that translates the contract into that gateway's API | `providers/stripe/stripe.provider.ts`, `providers/bkash/bkash.provider.ts` |
| **Factory** | picks the adapter at runtime | `providers/paymentProvider.factory.ts` |

| Step | Stripe | bKash |
|---|---|---|
| Authentication | secret key on the SDK client | `id_token` from `/token/grant`, cached in Redis for 1 hour, renewed with a refresh token (28 days) |
| Start a payment | `checkout.sessions.create` → `session.url` | `POST /checkout/create` → `bkashURL` |
| ID stored as `providerTransactionId` | `session.id` | `paymentID` |
| Amount format | integer in the smallest unit (poisha) | decimal string, `"100.50"` |
| Confirmation | Stripe sends a **signed webhook (POST)**; verified with the raw body | the **browser is redirected (GET)** to a callback with `?paymentID&status`; the server then calls `/execute` |
| Refund | `refunds.create`; final status arrives by webhook | `POST /payment/refund`; needs the `trxID`, which the adapter looks up itself |

Confirmation is **not** in the shared interface, because the gateways notify in completely different ways. Each gateway has its own incoming route, which verifies the notification with the gateway, translates it into the same payload, and calls the same service functions:

```
payment.service.createPaymentIntoDB
        │  getPaymentProvider(provider)                     ← Factory
   ┌────┴───────────────────────────┐
stripePaymentProvider          bkashPaymentProvider         ← Adapters (IPaymentProvider)
   │                                │
Stripe webhook (signed POST)   bKash callback (GET → /execute)   ← each gateway's incoming route
   └──────────────┬─────────────────┘
completePaymentIntoDB / closePendingPaymentIntoDB           ← shared logic, one payload shape
```

`payment.service.ts` never imports a gateway SDK. Differences between gateways stay inside their adapter.

## Files

```
src/app/module/payment/
├── payment.{controller,docs,interface,route,service,validation}.ts
└── providers/
    ├── paymentProvider.factory.ts
    ├── stripe/   stripe.provider.ts   ← adapter
    │             stripe.webhook.ts    ← incoming: verifies and translates Stripe events
    │             stripe.controller.ts, stripe.route.ts, stripe.docs.ts
    └── bkash/    bkash.provider.ts    ← adapter
                  bkash.callback.ts    ← incoming: executes and translates the bKash callback
                  bkash.controller.ts, bkash.route.ts, bkash.docs.ts
```

Plus `lib/stripe.ts`, `lib/bkash.ts`, `prisma/models/payment.prisma`, and the example payable models.

## What to rename: the example payable

The scaffold pays for an example **`Booking`** of an example **`Service`** (`prisma/models/booking.prisma`, `service.prisma`). Replace them with what the project actually sells.

1. Create the project's own payable model (order, enrollment, subscription) with:
   - a status enum that has a "ready to be paid" value and a "paid" value;
   - a price column copied at purchase time (`Decimal @db.Decimal(10, 2)`);
   - the buyer relation to `User`;
   - `payments Payment[]`.
2. In `payment.prisma`, point `bookingId` / `booking` at the new model.
3. Across `module/payment/` rename `booking` / `Booking` / `bookingId` to the new name, and map:

   | Example | Meaning | Replace with |
   |---|---|---|
   | `BookingStatus.ACCEPTED` | ready to be paid | the project's status |
   | `BookingStatus.PAID` | paid | the project's status |
   | `BookingStatus.CANCELLED` | cancelled (triggers a refund if money arrived) | the project's status |
   | `BookingStatus.IN_PROGRESS`, `COMPLETED` | later stages that still count as paid | the project's later statuses, or remove |
   | `booking.priceAtBooking` | amount to charge | the price column |
   | `booking.customer.email` / `customerId` | the buyer | the buyer relation |
   | `booking.service.title` | item name shown at checkout | the item's name |

4. Delete `booking.prisma`, `service.prisma`, the `BookingStatus` enum and `customerBookings` on `User` once nothing uses them. Migrate, generate, then run `npx tsc --noEmit` and fix anything that still mentions the old names.

The amounts are in BDT; both adapters reject other currencies. For another currency change the currency checks in the adapters and in `completePaymentIntoDB`, and Stripe's `currency` value.

## How a payment runs

1. `POST /api/payments/create` with `{ "bookingId": "...", "provider": "BKASH" }` (provider optional; default is `STRIPE` in `createPaymentIntoDB`. If the project has only bKash, change that default to `PaymentProvider.BKASH`).
2. `createPaymentIntoDB`: (a) a Serializable transaction creates a `PENDING` payment, refusing a second one in progress; (b) **outside** the transaction the adapter creates the checkout; (c) the gateway's id is saved, or the payment is marked `FAILED` if the gateway call threw.
3. The response is `{ paymentId, checkoutUrl }`. The frontend sends the customer to `checkoutUrl`.
4. The gateway's incoming route calls `completePaymentIntoDB`, which checks ids, provider and amount, is safe to call twice, and moves payment and payable forward together with guarded `updateMany` calls. Failure or cancellation calls `closePendingPaymentIntoDB`.
5. If the payable was cancelled while the customer was paying, the money is refunded straight away.

For Stripe, the success and cancel pages only tell the customer what happened; **the webhook is the only thing that marks a payment as paid.** For bKash, the query string alone proves nothing; the server trusts only the answer from `/execute`.

Return pages: Stripe's `success_url` / `cancel_url` (in `stripe.provider.ts`) point at this API's `/api/payments/return/*`; with a frontend, point them at frontend pages. The bKash callback redirects to `FRONTEND_URL/payment/success|failed|cancelled`; the frontend needs those three pages.

## Mounting

Already done in `src/app.ts`. Keep this order:

```ts
// before express.json(): Stripe needs the raw body
app.use("/api/payments/webhook", stripeWebhookRoutes);

app.use(express.json());
// ...

app.use("/api/payments/return", stripeReturnRoutes);
app.use("/api/payments/bkash", bkashRoutes);
app.use("/api/payments", paymentRoutes);
```

## Adding another gateway

1. Add the value to the `PaymentProvider` enum; migrate and generate.
2. Create `providers/<name>/<name>.provider.ts` that exports an `IPaymentProvider`: `createCheckoutSession` returns `{ providerTransactionId, checkoutUrl }`; `refundPayment` returns `{ providerRefundId, status }`, with `status: "succeeded"` when the refund is final.
3. Add a `case` to `getPaymentProvider`.
4. Create the gateway's incoming route (webhook or callback) with controller and route files. It must **verify** the notification with the gateway (a signature or a server-to-server call), then call `completePaymentIntoDB` or `closePendingPaymentIntoDB` with the standard payload. Copy `bkash.callback.ts` for redirect-style gateways and `stripe.webhook.ts` for webhook-style ones.
5. Put the SDK client or request helper in `lib/<name>.ts`; add the env variables to `config/index.ts` and `.env.example`; mount the route in `app.ts`.

`payment.service.ts` does not change.

Use the same three pieces (interface, adapters, factory) for any other service with interchangeable providers: SMS senders, email providers, file storage.

## Testing

**Stripe**

1. Install the Stripe CLI and run `stripe listen --forward-to localhost:5000/api/payments/webhook`. Put the printed `whsec_...` in `STRIPE_WEBHOOK_SECRET` and restart the server.
2. Create a payment with `"provider": "STRIPE"`, open `checkoutUrl`, and pay with card `4242 4242 4242 4242`, any future expiry, any CVC.
3. The CLI shows `checkout.session.completed`; the payment becomes `COMPLETED` and the payable `PAID`.

**bKash (sandbox)**

1. `.env.example` already holds bKash's published sandbox credentials; copy them to `.env`.
2. Create a payment with `"provider": "BKASH"` and open `checkoutUrl`.
3. Pay with a bKash sandbox test wallet. The commonly published one is number `01770618575`, OTP `123456`, PIN `12121`; if it is rejected, take the current test wallet from the bKash developer portal.
4. bKash redirects to `/api/payments/bkash/callback`; the server executes the payment and redirects to the frontend's `/payment/success`.

In both cases, check that confirming twice changes nothing, and that cancelling at the gateway leaves the payment `CANCELLED` and the payable still payable.
