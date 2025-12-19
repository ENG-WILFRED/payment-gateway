# Payments Service - Swagger API Documentation

## Overview

The Payments Service API is a comprehensive payments processing platform that supports multiple payment providers with real-time callbacks, webhook handling, detailed analytics, and comprehensive audit trails.

**Version:** 1.0.0  
**Base URL:** `http://localhost:3001` (Development) | `https://api.payments.example.com` (Production)

## Key Features

- **Multi-Provider Support**: M-Pesa (STK Push), Stripe (PaymentIntent), PayPal (Orders), and manual Cash payments
- **Real-time Callbacks**: Webhook endpoints for provider callbacks and payment status updates
- **Multi-tenant Support**: Scoped payments by merchant ID with role-based access control
- **Comprehensive Analytics**: Revenue reporting, provider breakdown, transaction analysis
- **Audit Trail**: Full transaction history with raw provider responses for reconciliation
- **Role-Based Access**: Manager and Admin roles for sensitive operations

## Authentication

Authenticated endpoints require a JWT Bearer token:

```
Authorization: Bearer <jwt_token>
```

### Required Roles
- **admin**: Full system access (record cash payments, full reporting)
- **manager**: Reporting and query access (view statistics, query payments)

---

## API Endpoints

### Payment Creation & Recording

#### 1. Create Payment Record (Internal Use)
```
POST /payments
```

**Description:** Create a payment record in the system. Typically used internally by provider-specific endpoints.

**Request Body:**
```json
{
  "provider": "mpesa",
  "amount": "1000",
  "status": "pending",
  "referenceId": "ORDER-123",
  "merchantId": "MERCHANT-001",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "raw": { "initiated": { "CheckoutRequestID": "ws_CO_123" } },
  "providerMetadata": {
    "checkoutRequestId": "ws_CO_123",
    "merchantRequestId": "mr_123"
  }
}
```

**Response:** `201 Created`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "provider": "mpesa",
  "amount": "1000",
  "status": "pending",
  "referenceId": "ORDER-123",
  "merchantId": "MERCHANT-001",
  "createdAt": "2025-12-18T21:00:00Z"
}
```

---

### M-Pesa Payment Flow

#### 2. Initiate M-Pesa STK Push
```
POST /payments/mpesa/initiate
```

**Description:** Initiates an M-Pesa STK Push prompt on the customer's phone. The customer will receive a popup to enter their M-Pesa PIN to confirm payment. Payment status updates are received via the callback URL.

**Required Parameters:**
- `phone` - Customer's phone number (format: +254712345678)
- `amount` - Payment amount in currency units
- `stkCallback` - Callback URL where M-Pesa will send payment result

**Optional Parameters:**
- `accountReference` - Account reference code
- `referenceId` - Merchant's internal reference (order ID, invoice ID, etc.)
- `userId` - User UUID who initiated the payment
- `merchantId` - Merchant identifier for multi-tenant systems
- `transactionDesc` - Human-readable transaction description

**Request Example:**
```json
{
  "phone": "+254712345678",
  "amount": "1000",
  "stkCallback": "https://yourapi.com/payments/mpesa/callback",
  "accountReference": "ACCT-001",
  "referenceId": "ORDER-123",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "merchantId": "MERCHANT-001",
  "transactionDesc": "Payment for order #123"
}
```

**Response:** `200 OK`
```json
{
  "message": "Payment initiated",
  "data": {
    "CheckoutRequestID": "ws_CO_123456789",
    "MerchantRequestID": "mr_123456789",
    "ResponseCode": "0",
    "ResponseDescription": "Success. Request accepted for processing"
  },
  "paymentId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error Responses:**
- `400 Bad Request`: Missing phone, amount, or stkCallback
- `502 Bad Gateway`: M-Pesa API error

---

#### 3. M-Pesa Callback Handler
```
POST /payments/mpesa/callback
```

**Description:** Webhook endpoint called by M-Pesa (Safaricom) when the customer completes or cancels the STK Push prompt. Always returns 200 OK to acknowledge receipt. Transaction status is updated based on the callback result code.

**Request Payload (from M-Pesa):**
```json
{
  "Body": {
    "stkCallback": {
      "MerchantRequestID": "mr_123456789",
      "CheckoutRequestID": "ws_CO_123456789",
      "ResultCode": 0,
      "ResultDesc": "The service request has been processed successfully.",
      "CallbackMetadata": {
        "Item": [
          { "Name": "Amount", "Value": 1000 },
          { "Name": "MpesaReceiptNumber", "Value": "MJR1234567890" },
          { "Name": "TransactionDate", "Value": 20231215120000 },
          { "Name": "PhoneNumber", "Value": 254712345678 }
        ]
      }
    }
  }
}
```

**Response:** `200 OK`
```json
{
  "ResultCode": 0,
  "ResultDesc": "Callback received successfully",
  "recordedId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**M-Pesa Result Codes:**
- `0` - Success
- `1` - Insufficient Funds
- `1001` - Cannot process your transaction at this time
- `1002` - You have entered an invalid account number
- `17` - System Error

---

### Stripe Payment Flow

#### 4. Create Stripe PaymentIntent
```
POST /payments/stripe/create-payment-intent
```

**Description:** Creates a Stripe PaymentIntent and returns a client_secret for use on the frontend with Stripe.js. Also records a pending payment record for reconciliation.

**Request Body:**
```json
{
  "amount": "1000",
  "currency": "usd",
  "metadata": {
    "orderId": "ORDER-123",
    "customerName": "John Doe"
  }
}
```

**Response:** `201 Created`
```json
{
  "id": "pi_1Abcd1234567890",
  "client_secret": "pi_1Abcd1234567890_secret_xyz123",
  "amount": 1000,
  "currency": "usd",
  "status": "requires_payment_method"
}
```

**Error Responses:**
- `400 Bad Request`: Missing amount parameter

---

#### 5. Stripe Webhook Handler
```
POST /payments/stripe/webhook
```

**Description:** Webhook endpoint called by Stripe for payment events. Verifies webhook signature and updates payment status based on event type.

**Supported Events:**
- `payment_intent.succeeded` - Payment completed successfully
- `payment_intent.payment_failed` - Payment failed
- `charge.refunded` - Charge refunded
- `charge.dispute.created` - Dispute created

**Request Payload (from Stripe):**
```json
{
  "id": "evt_1234567890",
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_1234567890",
      "amount": 1000,
      "currency": "usd",
      "status": "succeeded"
    }
  }
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "recordedId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

### PayPal Payment Flow

#### 6. Create PayPal Order
```
POST /payments/paypal/create-order
```

**Description:** Creates a PayPal Order and returns the approval URL for customer redirect. Also records a pending payment record for reconciliation.

**Request Body:**
```json
{
  "amount": "10.00",
  "returnUrl": "https://yourapp.com/success",
  "cancelUrl": "https://yourapp.com/cancel"
}
```

**Response:** `201 Created`
```json
{
  "id": "PAYID-123456789",
  "status": "CREATED",
  "links": [
    {
      "rel": "approval_url",
      "href": "https://www.paypal.com/cgi-bin/webscr?cmd=_express-checkout&token=PAYID-123456789"
    }
  ]
}
```

**Error Responses:**
- `400 Bad Request`: Missing amount parameter

---

#### 7. PayPal Webhook Handler
```
POST /payments/paypal/webhook
```

**Description:** Webhook endpoint called by PayPal for payment events. Updates payment status based on event type.

**Supported Events:**
- `PAYMENT.CAPTURE.COMPLETED` - Payment completed
- `PAYMENT.CAPTURE.REFUNDED` - Payment refunded
- `PAYMENT.CAPTURE.REVERSED` - Payment reversed

**Response:** `200 OK`
```json
{
  "success": true,
  "recordedId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

### Manual Payment Recording

#### 8. Record Cash Payment (Admin Only)
```
POST /payments/cash
```

**Authentication Required:** ✓ (Admin role)

**Description:** Record a manual cash or bank transfer payment. Only administrators can record cash payments. The payment is immediately marked as completed. Useful for recording payments made through alternative channels not processed by the system.

**Request Body:**
```json
{
  "referenceId": "ORDER-123",
  "amount": "1000",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "merchantId": "MERCHANT-001",
  "note": "Received cash payment at reception"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "paymentId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error Responses:**
- `400 Bad Request`: Missing referenceId or amount
- `401 Unauthorized`: No JWT token provided
- `403 Forbidden`: Admin role required

---

### Payment Inquiry

#### 9. Get Payment by ID
```
GET /payments/:id
```

**Description:** Retrieve a specific payment record by its unique identifier. Returns the full payment object including provider details and metadata.

**Path Parameters:**
- `id` (UUID) - Payment record identifier

**Response:** `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "provider": "mpesa",
  "amount": "1000",
  "status": "completed",
  "referenceId": "ORDER-123",
  "merchantId": "MERCHANT-001",
  "providerTransactionId": "MJR1234567890",
  "providerMetadata": {
    "checkoutRequestId": "ws_CO_123456789",
    "merchantRequestId": "mr_123456789"
  },
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "transactionDescription": "Payment for order #123",
  "customerPhone": "+254712345678",
  "customerEmail": "customer@example.com",
  "createdAt": "2025-12-18T21:00:00Z",
  "completedAt": "2025-12-18T21:05:30Z"
}
```

**Error Responses:**
- `404 Not Found`: Payment not found

---

#### 10. Query Payments (Manager/Admin)
```
GET /payments
```

**Authentication Required:** ✓ (Manager/Admin roles)

**Description:** Query and filter payments with advanced filtering, pagination, and date range support. Results can be filtered by merchant, provider, status, user, and date range.

**Query Parameters:**
- `merchantId` (string, optional) - Filter by merchant identifier
- `status` (string, optional) - Filter by status: pending, completed, failed, cancelled
- `provider` (string, optional) - Filter by provider: mpesa, stripe, paypal, cash
- `userId` (UUID, optional) - Filter by user who initiated the payment
- `start` (ISO 8601, optional) - Start date for range filter
- `end` (ISO 8601, optional) - End date for range filter
- `page` (number, optional, default: 1) - Page number for pagination
- `limit` (number, optional, default: 25, max: 100) - Records per page

**Example Request:**
```
GET /payments?status=completed&provider=mpesa&page=1&limit=25
```

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "provider": "mpesa",
      "amount": "1000",
      "status": "completed",
      "referenceId": "ORDER-123",
      "createdAt": "2025-12-18T21:00:00Z"
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 25
}
```

**Error Responses:**
- `401 Unauthorized`: No JWT token provided
- `403 Forbidden`: Insufficient role permissions

---

### Analytics & Reporting

#### 11. Get Payment Summary Statistics
```
GET /payments/stats/summary
```

**Authentication Required:** ✓ (Manager/Admin roles)

**Description:** Retrieve payment statistics including total transaction count, breakdown by status, and total revenue. Can optionally be scoped to a specific hotel/merchant.

**Query Parameters:**
- `hotelId` (string, optional) - Merchant/hotel ID to scope results

**Response:** `200 OK`
```json
{
  "total": 1250,
  "pending": 45,
  "completed": 1200,
  "failed": 5,
  "cancelled": 0,
  "revenueCents": 1250000,
  "revenueFormatted": "KES 12,500.00"
}
```

---

#### 12. Get Payment Statistics by Provider
```
GET /payments/stats/by-provider
```

**Authentication Required:** ✓ (Manager/Admin roles)

**Description:** Returns payment count and revenue breakdown by provider. Useful for understanding provider distribution and performance.

**Response:** `200 OK`
```json
{
  "mpesa": {
    "count": 800,
    "revenue": 800000,
    "status": {
      "pending": 10,
      "completed": 785,
      "failed": 5
    }
  },
  "stripe": {
    "count": 300,
    "revenue": 300000,
    "status": {
      "pending": 5,
      "completed": 295,
      "failed": 0
    }
  },
  "paypal": {
    "count": 100,
    "revenue": 100000,
    "status": {
      "pending": 2,
      "completed": 98,
      "failed": 0
    }
  },
  "cash": {
    "count": 50,
    "revenue": 50000,
    "status": {
      "completed": 50
    }
  }
}
```

---

#### 13. Get Revenue Series by Interval
```
GET /payments/stats/revenue
```

**Authentication Required:** ✓ (Manager/Admin roles)

**Description:** Returns revenue data points grouped by time interval. Useful for generating revenue charts and trends.

**Query Parameters:**
- `interval` (string, optional) - daily, weekly, or monthly (default: daily)
- `start` (ISO 8601, optional) - Start date for range
- `end` (ISO 8601, optional) - End date for range

**Example Request:**
```
GET /payments/stats/revenue?interval=daily&start=2025-12-01&end=2025-12-18
```

**Response:** `200 OK`
```json
[
  {
    "date": "2025-12-18",
    "revenue": 150000,
    "transactionCount": 25
  },
  {
    "date": "2025-12-17",
    "revenue": 145000,
    "transactionCount": 23
  },
  {
    "date": "2025-12-16",
    "revenue": 160000,
    "transactionCount": 28
  }
]
```

---

#### 14. Get Transaction Counts by Hour
```
GET /payments/stats/transactions-by-day
```

**Authentication Required:** ✓ (Manager/Admin roles)

**Description:** Returns hourly breakdown of transaction counts and revenue for a given date. Useful for traffic analysis and peak time identification.

**Query Parameters:**
- `date` (YYYY-MM-DD, optional) - Date to query (defaults to today)

**Example Request:**
```
GET /payments/stats/transactions-by-day?date=2025-12-18
```

**Response:** `200 OK`
```json
{
  "date": "2025-12-18",
  "totalTransactions": 125,
  "totalRevenue": 125000,
  "hourly": [
    {
      "hour": 0,
      "count": 2,
      "revenue": 5000
    },
    {
      "hour": 9,
      "count": 12,
      "revenue": 15000
    },
    {
      "hour": 10,
      "count": 18,
      "revenue": 22000
    }
  ]
}
```

---

## Payment Status Transitions

```
pending → completed
pending → failed
pending → cancelled
completed → (no further transitions)
```

## Error Handling

All error responses include:
- HTTP status code
- Error message in response body
- Detailed description where applicable

**Common Status Codes:**
- `200 OK` - Request successful
- `201 Created` - Resource created
- `400 Bad Request` - Invalid input parameters
- `401 Unauthorized` - Missing or invalid JWT token
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error
- `502 Bad Gateway` - Provider API error

---

## Testing the API

### 1. Get Swagger UI Documentation
Navigate to: `http://localhost:3001/docs`

### 2. Test M-Pesa Initiation
```bash
curl -X POST http://localhost:3001/payments/mpesa/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+254712345678",
    "amount": "100",
    "stkCallback": "https://webhook.site/your-unique-id",
    "referenceId": "ORDER-001"
  }'
```

### 3. Test Payment Query (with Auth)
```bash
curl -X GET "http://localhost:3001/payments?status=completed" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 4. Test Statistics
```bash
curl -X GET http://localhost:3001/payments/stats/summary \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Database Schema

### Payments Table Columns

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| provider | STRING | Payment provider (mpesa, stripe, paypal, cash) |
| providerTransactionId | STRING | Provider's transaction ID |
| amount | DECIMAL(12,2) | Payment amount |
| status | STRING | pending, completed, failed, cancelled |
| raw | JSONB | Raw provider response |
| providerMetadata | JSONB | Provider-specific metadata |
| referenceId | STRING | Merchant's reference (order, invoice) |
| merchantId | STRING | Multi-tenant merchant identifier |
| userId | UUID | User who initiated payment |
| transactionDescription | STRING | Human-readable description |
| notes | TEXT | Internal notes |
| customerPhone | STRING | Customer contact phone |
| customerEmail | STRING | Customer contact email |
| completedAt | DATE | When payment completed |
| retryCount | INTEGER | Payment retry attempts |
| createdAt | DATE | Record creation timestamp |
| updatedAt | DATE | Last update timestamp |

---

## Support & Documentation

For additional support, refer to:
- Provider Integration Docs: `/docs/mpesa-integration.md`, `/docs/stripe-integration.md`, `/docs/paypal-integration.md`
- Database Config: `config/database.json`
- Environment Setup: `.env.example`

