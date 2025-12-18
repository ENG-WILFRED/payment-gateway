# M-Pesa (Daraja) Integration Guide

## Overview
This guide describes integrating Safaricom M-Pesa (Daraja) services: C2B, B2C, and STK Push. It covers configuration, sample requests/responses, webhook handling, common result codes/messages and error scenarios, retry/idempotency strategies, security, and testing tips. It is written for a generic payment gateway architecture called "PayBridge" that normalizes providers and webhooks. Map this guide to the local implementation in [services/mpesa.service.ts](services/mpesa.service.ts).

## Endpoints (as implemented in `controllers/payments.controller.ts`)

- POST /payments/mpesa/initiate
  - Summary: Initiate an M-Pesa payment (STK Push).
  - Request body (JSON):
    - `phone` (string) — Customer MSISDN in international format, e.g. `+2547...` (required)
    - `amount` (string|number) — Amount to charge (required)
    - `accountReference` (string) — Optional account reference (e.g. invoice id)
    - `referenceId` (string) — Optional merchant reference (e.g., order id, invoice id)
    - `userId` (string) — Optional user id
    - `merchantId` (string) — Optional merchant id for scoping
  - Success response (HTTP 200):
    {
      "message": "Payment initiated",
      "data": { ...provider response... },
      "paymentId": "payment-uuid"
    }
  - Error response: HTTP status (e.g. 400/502) with body `{ success: false, error: <details> }`.

- POST /payments/mpesa/callback
  - Summary: Webhook endpoint for M-Pesa provider callbacks.
  - Request body: Provider callback JSON (includes transaction status and metadata).
  - Success response (HTTP 200):
    { "ResultCode": 0, "ResultDesc": "Callback received successfully", "recordedId": "payment-uuid" }
  - On errors the endpoint returns HTTP 200 but body `{ success: false, error: 'processing_failed' }`.

Notes:
- The M-Pesa initiate route stores provider-specific tracking data (e.g., checkoutId, requestId) in `providerMetadata`. Use `referenceId` and `merchantId` to map payments to external systems.


## Prerequisites
- M-Pesa Daraja credentials: `ConsumerKey`, `ConsumerSecret`, `ShortCode`, and `LipaNaMpesaOnline` credentials when using STK Push (BusinessShortCode, Passkey).
- HTTPS accessible webhook endpoint for receiving callbacks.
- Node/Nest app with `services/mpesa.service.ts` to call Daraja APIs.

## Configuration (.env example)

MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_SHORTCODE=600000
MPESA_PASSKEY=your_lipanampesa_passkey
MPESA_ENV=sandbox  # or production
MPESA_B2C_INITIATOR_NAME=your_initiator
MPESA_B2C_SECURITY_CREDENTIAL=base64_encrypted_password

## PayBridge Gateway (concept)
PayBridge is the internal gateway layer that your application uses to interact with multiple payment providers in a uniform way. Responsibilities:
- Normalize provider requests/responses into a common schema (fields like `provider`, `providerTransactionId`, `amount`, `status`, `referenceId`, `raw`).
- Provide idempotency and deduplication using `referenceId` or `merchantReference`.
- Route provider webhooks to a single normalized endpoint and map them to internal payment records.
- Centralize retry/backoff logic, logging, and monitoring for payments.

When implementing M-Pesa support, ensure `services/mpesa.service.ts` returns objects compatible with PayBridge's normalized shape so the rest of the application can remain provider-agnostic.

## Authentication
- OAuth Token: call the OAuth endpoint with `ConsumerKey` and `ConsumerSecret` to receive an access token. Token TTLs vary; cache and renew when near expiry.

## Common Operations
- STK Push (Lipa Na M-Pesa Online) — customer prompt for payment on mobile device.
- C2B Simulate / Register URLs — for testing and receiving payment messages.
- B2C — sending funds to users.

### STK Push Request (sample)
Request body (JSON):

{
  "BusinessShortCode": "600000",
  "Password": "<Base64(BusinessShortCode+Passkey+Timestamp)>",
  "Timestamp": "20201217121212",
  "TransactionType": "CustomerPayBillOnline",
  "Amount": 100,
  "PartyA": "2547XXXXXXXX",
  "PartyB": "600000",
  "PhoneNumber": "2547XXXXXXXX",
  "CallBackURL": "https://yourdomain.com/mpesa/stkcallback",
  "AccountReference": "INV-12345",
  "TransactionDesc": "Payment of invoice INV-12345"
}

### STK Push Response (success)
{
  "MerchantRequestID": "29115-34620561-1",
  "CheckoutRequestID": "ws_CO_2702202010203631",
  "ResponseCode": "0",
  "ResponseDescription": "Success. Request accepted for processing",
  "CustomerMessage": "Success. Request accepted for processing"
}

## Webhook (STK Callback) Example
Callback JSON includes `ResultCode` and `ResultDesc`. Typical fields: `MerchantRequestID`, `CheckoutRequestID`, `ResultCode`, `ResultDesc`, and `CallbackMetadata` with `Item` array (Amount, MpesaReceiptNumber, Balance, TransactionDate, PhoneNumber).

### Typical ResultCode values and handling
- `ResultCode: 0` — Success: capture payment details and mark invoice paid.
- `ResultCode > 0` — Failure/cancelled: log `ResultDesc`, surface to user if needed.

## Common Fields and Meanings
- `ResponseCode` / `ResponseDescription`: immediate API ack for requests.
- `ResultCode` / `ResultDesc`: transaction result delivered via callback.
- `MerchantRequestID` / `CheckoutRequestID`: use for idempotency/tracking.

## Error Scenarios and Recommended Handling
Below are common patterns rather than exhaustive numeric lists. Always log raw payloads for post-mortem and correlate via `CheckoutRequestID`.

- Invalid credentials / Auth failure: refresh credentials, verify keys, return 401 from OAuth — mark integration as misconfigured and alert ops.
- Timeout / Network errors when calling Daraja: retry with exponential backoff (3 attempts), but ensure idempotency using `MerchantRequestID` or your internal `idempotency_key`.
- Duplicate request: Daraja may reject duplicates; treat as idempotent success if a prior successful transaction exists.
- Customer cancelled / did not complete: `ResultCode` indicates cancellation — notify user and allow retry.
- Insufficient funds / transaction declined: inform the user and surface repayment options.
- Webhook delivery failures: implement retries (e.g., 3 attempts with backoff) and store callbacks for manual reconciliation if all retries fail.

## Idempotency
- Use `MerchantRequestID`, `CheckoutRequestID`, or your own payment UUID when initiating STK Push. If the API retries or you get duplicate callbacks, ensure operations are idempotent when marking orders paid.

## Security
- Verify that callbacks are from M-Pesa (check source IP ranges if provided by Daraja or use tokens/signatures if available).
- Use HTTPS and validate TLS certificates.
- Never log full credentials; mask tokens and secrets.

## Testing and Sandbox
- Use Daraja sandbox credentials and the C2B simulate endpoint to test your webhook handling.
- Test success, failure, timeout, and duplicate scenarios.

## Mapping to Local Code
- Main implementation entry: [services/mpesa.service.ts](services/mpesa.service.ts) — ensure you wire environment variables and webhook controller in [controllers/payments.controller.ts](controllers/payments.controller.ts).

## Troubleshooting Checklist
- Check OAuth token validity and renewal flow.
- Ensure callback URL is publicly reachable (use ngrok for local testing).
- Correlate `CheckoutRequestID` between request and callback.
- Inspect raw API responses and log them for debugging.

## Notes
- For an authoritative list of enumerated Daraja `ResultCode` values and full API contract, refer to Safaricom Daraja documentation. Treat this guide as a developer-friendly integration checklist and mapping.
