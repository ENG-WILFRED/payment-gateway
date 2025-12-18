# Stripe Integration Guide

## Overview
This guide covers integrating Stripe for card and wallet payments using Payment Intents and Webhooks. It includes configuration, sample requests/responses, webhook handling, detailed error types and HTTP status codes, idempotency, security, testing, and mapping to [services/stripe.service.ts](services/stripe.service.ts).

## Prerequisites
- Stripe account with API keys: `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`.
- Webhook endpoint with a configured `STRIPE_WEBHOOK_SECRET` for signature verification.

## Configuration (.env example)

STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

## PayBridge Gateway (concept)
PayBridge is the generic gateway abstraction used across providers to provide a consistent payment model. Key responsibilities:
- Normalize provider responses into a common schema (e.g. `provider`, `providerTransactionId`, `amount`, `status`, `referenceId`, `raw`).
- Handle idempotency using `referenceId` or `Idempotency-Key`.
- Route and normalize webhooks to the PayBridge schema for downstream consumption.
- Centralize retries, logging, and monitoring for payments.

Ensure `services/stripe.service.ts` returns normalized objects compatible with PayBridge so the rest of the system remains provider-agnostic.

## Client vs Server
- Use publishable key in client (web/mobile) to collect payment details.
- Use secret key on server to create PaymentIntents, confirm payments server-side, and handle webhooks.

## Creating a PaymentIntent (server example)
Request (Node):

{
  amount: 2000, // cents
  currency: 'usd',
  payment_method_types: ['card'],
  description: 'Invoice #INV-12345',
  metadata: { referenceId: 'INV-12345' }
}

Response (success): contains `id` (pi_...) and `client_secret`.

## Webhooks (common events)
- `payment_intent.succeeded` — Payment completed.
- `payment_intent.payment_failed` — Payment failed.
- `charge.refunded` — A refund was issued.
- `charge.dispute.created` — A dispute was opened.

### Verifying webhooks
- Use the `Stripe-Signature` header and `STRIPE_WEBHOOK_SECRET` to verify event authenticity.

## Stripe Error Types and HTTP Status Mapping
Stripe returns structured errors with types and codes. Common HTTP statuses:
- `200` / `201` — Success
- `400` — Bad request / invalid parameters
- `401` — Unauthorized (invalid API key)
- `402` — Request failed (card-related failures)
- `403` — Forbidden (insufficient permissions)
- `404` — Not found (resource missing)
- `429` — Too many requests (rate limiting)
- `500` / `502` / `503` / `504` — Server errors

Common Stripe error `type` values and example `code` / meaning:
- `card_error`:
  - `card_declined`: Card was declined.
  - `expired_card`: Card has expired.
  - `incorrect_cvc`: CVC is incorrect.
  - `incorrect_number`: Card number is incorrect.
  - `insufficient_funds`: Not enough funds.
  - `processing_error`: Generic processing error.
- `invalid_request_error`: Invalid parameters were supplied to Stripe's API.
- `api_error`: Internal Stripe error. Retry with backoff.
- `authentication_error`: Invalid API key.
- `rate_limit_error`: Too many requests.
- `idempotency_error`: Duplicate operations with same idempotency key but differing parameters.

## Handling Card Declines & Failures
- On `card_error`, inspect `decline_code` and `payment_intent.last_payment_error`.
- Offer user-friendly messages and allow card retry or alternative payment methods.

## Idempotency
- Use the `Idempotency-Key` header when creating expensive or retryable actions (charges, refunds). Stripe supports idempotency keys per endpoint.

## Security
- Keep `STRIPE_SECRET_KEY` on the server only.
- Verify webhook signatures.
- Use PCI-compliant flows: prefer Stripe Elements or Payment Element so raw card data never hits your servers.

## Testing
- Use Stripe test keys and test card numbers (e.g., `4242 4242 4242 4242` for success, `4000 0000 0000 9995` for a card decline)
- Use `stripe-cli` to forward events to local dev servers and simulate webhook events: `stripe listen --forward-to localhost:3000/webhooks/stripe`.

## Sample Failure Responses
Stripe error object example:

{
  "error": {
    "type": "card_error",
    "message": "Your card was declined.",
    "code": "card_declined",
    "decline_code": "insufficient_funds"
  }
}

## Retry & Backoff
- For transient errors (`api_error`, `rate_limit_error`, `500`), implement exponential backoff up to a limit (3-5 retries).

## Disputes & Refunds
- On `charge.dispute.created`, preserve full charge metadata and evidence for the dispute flow.
- Use the Refunds API for issuing refunds and track refund events via webhooks.

## Mapping to Local Code
- Core integration: [services/stripe.service.ts](services/stripe.service.ts).
- Webhook controller: add route in [controllers/payments.controller.ts](controllers/payments.controller.ts) to receive and validate `Stripe-Signature`.

## Endpoints (as implemented in `controllers/payments.controller.ts`)

- POST /payments/stripe/create-payment-intent
  - Summary: Create a Stripe PaymentIntent.
  - Request body (JSON):
    - `amount` (string|number) — amount in smallest currency unit (e.g. cents) (required)
    - `currency` (string) — currency code (optional, default `usd`)
    - `metadata` (object) — optional metadata (e.g. `{ referenceId: '...' }`)
  - Success response: Stripe `PaymentIntent` object (includes `id`, `client_secret`, `status`).
  - Error response: HTTP 400/5xx with error details.

- POST /payments/stripe/webhook
  - Summary: Stripe webhook endpoint.
  - Request body: Stripe event JSON (signature verified).
  - Query string: `sig` (string) — signature token for validation.
  - Success response (HTTP 200): `{ success: true, recordedId: 'payment-uuid' }` when verified.
  - Failure response: `{ success: false }` if verification fails.

Notes:
- PaymentIntent tracking data is stored in `providerMetadata` for reconciliation when the webhook `payment_intent.succeeded` is received.


## Troubleshooting Checklist
- Verify secret key and webhook secret match the environment.
- Check `Idempotency-Key` usage for repeated create calls.
- Inspect `last_payment_error` and `decline_code` for actionable messages.

## References
- Use Stripe official docs for expanded error code lists and guidance. This guide covers typical scenarios you'll need during integration.
