# PayPal Integration Guide

## Overview
This guide covers integrating PayPal REST APIs for Orders, Payments, Captures, Refunds and Webhooks. It includes configuration, sample requests/responses, webhook verification, common error responses and recommended handling. Map this guide to [services/paypal.service.ts](services/paypal.service.ts).

## Prerequisites
- PayPal REST credentials: `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.
- Webhook endpoint with PayPal webhook ID and verification logic.

## Configuration (.env example)

PAYPAL_CLIENT_ID=your_client_id
PAYPAL_CLIENT_SECRET=your_client_secret
PAYPAL_ENV=sandbox  # or live
PAYPAL_WEBHOOK_ID=your_webhook_id

## PayBridge Gateway (concept)
PayBridge provides a unified abstraction across payment providers. It:
- Normalizes provider responses into a consistent shape (`provider`, `providerTransactionId`, `amount`, `status`, `referenceId`, `raw`).
- Supports idempotency via `referenceId` or `PayPal-Request-Id`.
- Routes and normalizes webhooks so application code handles a consistent event shape.
- Centralizes retry/backoff, retry tracking, logging, and monitoring.

Implement adapters in `services/paypal.service.ts` that return PayBridge-compatible objects so the rest of the system stays provider-agnostic.

## Authentication
- Obtain OAuth 2.0 token using client credentials. Cache and renew tokens before expiry.

## Typical Flow
1. Create Order (`/v2/checkout/orders`) with `intent` set to `CAPTURE` or `AUTHORIZE`.
2. Redirect buyer to approval url or use client SDK to approve.
3. Capture payment (`/v2/checkout/orders/{id}/capture`) after approval.
4. Handle webhooks for asynchronous notifications (capture completed, refunds, disputes).

## Sample Create Order Request
Request JSON (simplified):

{
  "intent": "CAPTURE",
  "purchase_units": [{
    "amount": {"currency_code": "USD", "value": "10.00"},
    "reference_id": "INV-12345",
    "custom_id": "referenceId:INV-12345"
  }],
  "application_context": {"return_url": "https://yourapp.com/paypal/return", "cancel_url": "https://yourapp.com/paypal/cancel"}
}

## Webhook Events (common)
- `PAYMENT.CAPTURE.COMPLETED` — A capture completed successfully.
- `PAYMENT.CAPTURE.DENIED` — Capture was denied.
- `CHECKOUT.ORDER.APPROVED` — Order was approved by payer.
- `PAYMENT.SALE.REFUNDED` — A sale was refunded.
- `CUSTOMER.DISPUTE.CREATED` — A dispute was created.

## Verifying Webhooks
- PayPal provides a verification flow (verify via the `verify-webhook-signature` endpoint) and headers: `Paypal-Transmission-Id`, `Paypal-Transmission-Time`, `Paypal-Transmission-Sig`, `Paypal-Cert-Url`, `Paypal-Auth-Algo`. Use `PAYPAL_WEBHOOK_ID` to validate.

## Common Error Responses and Handling
PayPal returns structured error responses; common HTTP status codes include:
- `400` — Bad Request / validation error (code: `VALIDATION_ERROR`).
- `401` — Unauthorized (invalid credentials / token).
- `403` — Forbidden (permissions).
- `404` — Not Found (resource missing).
- `422` — Unprocessable Entity (business rules failure).
- `429` — Too Many Requests (rate limited).
- `500` — Internal Server Error (transient).

Common error scenarios and handling:
- `VALIDATION_ERROR`: inspect `details` array to identify missing/invalid fields; return clear error to caller.
- `AUTHORIZATION_ERROR`: refresh OAuth token and retry once.
- `INSTRUMENT_DECLINED` or `PAYER_ACTION_REQUIRED`: prompt user to try another payment method or complete additional steps.
- `RISK_REFUSED` or `TRANSACTION_REFUSED`: contact PayPal support; surface a friendly message.

## Idempotency
- Use `PayPal-Request-Id` header to make create operations idempotent.

## Refunds and Disputes
- Issue refunds via the Capture/Refund endpoints and track via webhooks. Preserve full metadata to provide evidence for disputes.

## Retry Strategy
- For transient errors (`500`, `502`, `503`), implement exponential backoff with limited retries.

## Security
- Keep client secret private.
- Use webhook verification for event authenticity.
- Use HTTPS and validate TLS certificates.

## Testing
- Use the PayPal sandbox environment to test order creation, approvals, capture, refunds, and webhook flows.

## Mapping to Local Code
- Core logic: [services/paypal.service.ts](services/paypal.service.ts) — implement adapter methods that produce PayBridge-normalized payment objects.
- Webhook route: add handler in [controllers/payments.controller.ts](controllers/payments.controller.ts) and verify signatures using PayPal verification API. Ensure the webhook handler converts PayPal payloads into the PayBridge schema for downstream processing.

## Endpoints (as implemented in `controllers/payments.controller.ts`)

- POST /payments/paypal/create-order
  - Summary: Create a PayPal Order.
  - Request body (JSON):
    - `amount` (string) — total amount, e.g. `10.00` (required)
    - `returnUrl` (string) — where PayPal should redirect after approval (optional)
    - `cancelUrl` (string) — where PayPal should redirect on cancel (optional)
  - Success response: PayPal Order object (includes `id` and approval links).
  - Error response: HTTP 400/5xx with error details.

- POST /payments/paypal/webhook
  - Summary: PayPal webhook endpoint for asynchronous events.
  - Request body: PayPal webhook event JSON (verified via PayPal signature).
  - Success response (HTTP 200): `{ success: true, recordedId: 'payment-uuid' }`.

Notes:
- Order metadata is stored for reconciliation when webhook `PAYMENT.CAPTURE.COMPLETED` is received.


## Troubleshooting Checklist
- Verify `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` and token exchange success.
- Ensure webhook verification uses correct `PAYPAL_WEBHOOK_ID`.
- Check that captured amounts and currencies match expected values in metadata.

## Notes
- For exhaustive error names and platform-specific response formats, consult PayPal developer documentation. Use this guide to implement robust handling for common scenarios.
