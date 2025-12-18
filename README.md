# Payments Service

This service exposes payment provider integrations (M-Pesa, Stripe, PayPal) and a simple payments API.

Quick start:

1. Copy `.env.example` to `.env` and fill provider credentials.

2. Install and build:

```bash
npm install
npm run build
npm start
```

3. Open Swagger UI at `http://localhost:3001/payments/docs` to explore endpoints.

Notes:

- If provider credentials are not set for Stripe/PayPal the service returns simulated responses for development.
- M-Pesa requires the Daraja credentials and callback URL to be reachable by Safaricom for full end-to-end tests.
