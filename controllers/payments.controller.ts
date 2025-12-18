import { Controller, Post, Body, Logger, Get, Param, HttpCode, HttpStatus, BadRequestException, HttpException, UseGuards, Query } from '@nestjs/common';
import { PaymentsService } from '../services/payments.service';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { MpesaService } from '../services/mpesa.service';
import { StripeService } from '../services/stripe.service';
import { PaypalService } from '../services/paypal.service';
// Note: `Order` is required dynamically where needed to avoid pulling sibling project files into tsc.
import { RolesGuard } from '../auth/src/extra/roles.guard';
import { Roles } from '../auth/src/extra/roles.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiResponse, ApiParam, ApiQuery, ApiHeader } from '@nestjs/swagger';

/**
 * Payments Controller
 * 
 * Manages all payment operations including:
 * - Multi-provider payment initiation (M-Pesa STK Push, Stripe, PayPal)
 * - Real-time webhook/callback handling for transaction updates
 * - Manual payment recording (cash, bank transfers)
 * - Payment inquiry and reconciliation
 * - Comprehensive analytics and reporting (revenue, transaction counts, provider breakdown)
 */
@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly mpesaService: MpesaService,
    private readonly stripeService?: StripeService,
    private readonly paypalService?: PaypalService,
  ) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Create a payment record (internal use)', 
    description: 'Create a payment record in the system. This is typically used internally by provider-specific endpoints. For normal payment flows, use the provider-specific endpoints like /payments/mpesa/initiate.' 
  })
  @ApiBody({ 
    type: CreatePaymentDto,
    description: 'Payment data to create',
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Payment record created successfully',
    schema: {
      example: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        provider: 'mpesa',
        amount: '1000',
        status: 'pending',
        referenceId: 'ORDER-123',
        merchantId: 'MERCHANT-001',
        createdAt: '2025-12-18T21:00:00Z',
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid payment data' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async create(@Body() createDto: CreatePaymentDto) {
    this.logger.debug('Create payment request', createDto);
    return this.paymentsService.create(createDto);
  }

  @Post('mpesa/initiate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Initiate M-Pesa STK Push payment',
    description: 'Initiates an M-Pesa STK Push prompt on the customer\'s phone. The customer will receive a popup to enter their M-Pesa PIN to confirm payment. Payment status updates are received via the callback URL.'
  })
  @ApiBody({ 
    schema: { 
      example: { 
        phone: '+254712345678', 
        amount: '1000', 
        stkCallback: 'https://yourapi.com/payments/mpesa/callback',
        accountReference: 'ACCT-001',
        referenceId: 'ORDER-123',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        merchantId: 'MERCHANT-001',
        transactionDesc: 'Payment for order #123'
      } 
    },
    description: 'M-Pesa STK Push request payload'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'STK Push initiated successfully',
    schema: {
      example: {
        message: 'Payment initiated',
        data: {
          CheckoutRequestID: 'ws_CO_123456789',
          MerchantRequestID: 'mr_123456789',
          ResponseCode: '0',
          ResponseDescription: 'Success. Request accepted for processing',
        },
        paymentId: '550e8400-e29b-41d4-a716-446655440000'
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Missing required fields (phone, amount, stkCallback)' })
  @ApiResponse({ status: 502, description: 'M-Pesa API error or connection failure' })
  async initiateMpesa(@Body() body: any) {
    this.logger.debug('M-Pesa payment initiation request', body);

    const { phone, amount, stkCallback, accountReference, referenceId, userId, merchantId } = body || {};

    if (!phone || !amount) {
      throw new BadRequestException('phone and amount are required');
    }

    if (!stkCallback) {
      throw new BadRequestException('stkCallback is required');
    }

    try {
      const res = await this.mpesaService.initiateStkPush(phone, String(amount), stkCallback, accountReference, body?.transactionDesc);

      // Store provider-specific tracking data in providerMetadata
      const providerMetadata = {
        checkoutRequestId: res?.CheckoutRequestID ?? res?.checkoutRequestID ?? res?.CheckoutRequestId,
        merchantRequestId: res?.MerchantRequestID ?? res?.merchantRequestID ?? res?.MerchantRequestId,
      };

      const createDto: CreatePaymentDto = {
        provider: 'mpesa',
        providerTransactionId: undefined,
        amount: String(amount),
        status: 'pending',
        raw: { initiated: res },
        providerMetadata,
        referenceId,
        userId,
        merchantId,
      };

      const payment = await this.paymentsService.create(createDto);
      this.logger.log(`Payment initiated: ${payment?.id} for reference: ${referenceId}`);

      return { message: 'Payment initiated', data: res, paymentId: payment?.id };
    } catch (err: any) {
      // Log the full error for observability
      this.logger.error('Failed to initiate mpesa push', err?.message ?? err);

      // Prefer to return the provider or internal error details in the response body for debugging,
      // but avoid leaking secrets. Include status and body when available from httpRequest helper.
      const status = err?.status || HttpStatus.BAD_GATEWAY;
      const body = err?.body ?? { message: err?.message ?? 'initiation_failed' };

      // Throw an HttpException so Nest returns the correct status code (not default 201)
      throw new HttpException({ success: false, error: body }, status);
    }
  }

  @Post('mpesa/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'M-Pesa callback endpoint (provider webhook)',
    description: 'Webhook endpoint called by M-Pesa (Safaricom) when the customer completes or cancels the STK Push prompt. Always returns 200 OK to acknowledge receipt. Transaction status is updated based on the callback result code.'
  })
  @ApiBody({ 
    schema: {
      example: {
        Body: {
          stkCallback: {
            MerchantRequestID: 'mr_123456789',
            CheckoutRequestID: 'ws_CO_123456789',
            ResultCode: 0,
            ResultDesc: 'The service request has been processed successfully.',
            CallbackMetadata: {
              Item: [
                { Name: 'Amount', Value: 1000 },
                { Name: 'MpesaReceiptNumber', Value: 'MJR1234567890' },
                { Name: 'TransactionDate', Value: 20231215120000 },
                { Name: 'PhoneNumber', Value: 254712345678 },
              ]
            }
          }
        }
      }
    },
    description: 'M-Pesa callback payload from Safaricom'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Callback processed and acknowledged',
    schema: {
      example: {
        ResultCode: 0,
        ResultDesc: 'Callback received successfully',
        recordedId: '550e8400-e29b-41d4-a716-446655440000'
      }
    }
  })
  async mpesaCallback(@Body() payload: any) {
    this.logger.debug('Mpesa callback received', payload);

    try {
      // Let MpesaService normalize/verify the payload if needed (it currently returns payload)
      const parsed = await this.mpesaService.handleCallback(payload);

      // Record the definitive payment result now that Safaricom has called back
      const recorded = await this.paymentsService.recordPaymentFromCallback(parsed);

      return { ResultCode: 0, ResultDesc: 'Callback received successfully', recordedId: recorded?.id };
    } catch (err) {
      this.logger.error('Error processing mpesa callback', err);
      // Always return 200 OK for provider callbacks so they don't retry repeatedly,
      // but include a success flag for internal observability.
      return { success: false, error: 'processing_failed' };
    }
  }

  @Post('stripe/create-payment-intent')
  @ApiOperation({ 
    summary: 'Create a Stripe PaymentIntent',
    description: 'Creates a Stripe PaymentIntent and returns a client_secret for use on the frontend with Stripe.js. Also records a pending payment record for reconciliation.'
  })
  @ApiBody({ 
    schema: { 
      example: { 
        amount: '1000', 
        currency: 'usd', 
        metadata: { orderId: '550e8400-e29b-41d4-a716-446655440000', customerName: 'John Doe' } 
      } 
    },
    description: 'Stripe PaymentIntent creation request'
  })
  @ApiResponse({
    status: 201,
    description: 'PaymentIntent created successfully',
    schema: {
      example: {
        id: 'pi_1Abcd1234567890',
        client_secret: 'pi_1Abcd1234567890_secret_xyz123',
        amount: 1000,
        currency: 'usd',
        status: 'requires_payment_method'
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Missing amount parameter' })
  async createStripePaymentIntent(@Body() body: any) {
    const { amount, currency, metadata } = body || {};
    if (!amount) throw new BadRequestException('amount is required');
    const res = await this.stripeService?.createPaymentIntent(amount, currency ?? 'usd', metadata);
    // create a pending payment record for reconciliation
    await this.paymentsService.recordPaymentFromProvider('stripe', { id: res?.id, amount, status: 'pending', raw: res });
    return res;
  }

  @Post('stripe/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Stripe webhook endpoint',
    description: 'Webhook endpoint called by Stripe for payment events (payment_intent.succeeded, payment_intent.payment_failed, charge.refunded, etc.). Verifies webhook signature and updates payment status.'
  })
  @ApiBody({ 
    schema: {
      example: {
        id: 'evt_1234567890',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_1234567890',
            amount: 1000,
            currency: 'usd',
            status: 'succeeded'
          }
        }
      }
    },
    description: 'Stripe webhook event payload'
  })
  @ApiQuery({
    name: 'sig',
    required: false,
    description: 'Stripe signature from x-stripe-signature header'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Webhook processed successfully',
    schema: {
      example: {
        success: true,
        recordedId: '550e8400-e29b-41d4-a716-446655440000'
      }
    }
  })
  async stripeWebhook(@Body() payload: any, @Query('sig') sig?: string) {
    this.logger.debug('Stripe webhook', { payload });
    // Note: signature header is typically in req.headers['stripe-signature']; here we accept query for simplicity
    const verified = this.stripeService?.verifySignature(JSON.stringify(payload), sig);
    if (!verified) return { success: false };
    const recorded = await this.paymentsService.recordPaymentFromProvider('stripe', payload);
    return { success: true, recordedId: recorded?.id };
  }

  @Post('paypal/create-order')
  @ApiOperation({ 
    summary: 'Create a PayPal Order',
    description: 'Creates a PayPal Order and returns the approval URL for customer redirect. Also records a pending payment record for reconciliation.'
  })
  @ApiBody({ 
    schema: { 
      example: { 
        amount: '10.00', 
        returnUrl: 'https://yourapp.com/success', 
        cancelUrl: 'https://yourapp.com/cancel' 
      } 
    },
    description: 'PayPal order creation request'
  })
  @ApiResponse({
    status: 201,
    description: 'PayPal Order created successfully',
    schema: {
      example: {
        id: 'PAYID-123456789',
        status: 'CREATED',
        links: [
          {
            rel: 'approval_url',
            href: 'https://www.paypal.com/cgi-bin/webscr?cmd=_express-checkout&token=PAYID-123456789'
          }
        ]
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Missing amount parameter' })
  async createPaypalOrder(@Body() body: any) {
    const { amount, returnUrl, cancelUrl } = body || {};
    if (!amount) throw new BadRequestException('amount is required');
    const res = await this.paypalService?.createOrder(amount, returnUrl, cancelUrl);
    // store pending order record mapped to provider response
    await this.paymentsService.recordPaymentFromProvider('paypal', { id: res?.id, amount, status: 'CREATED', raw: res });
    return res;
  }

  @Post('paypal/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'PayPal webhook endpoint',
    description: 'Webhook endpoint called by PayPal for payment events (PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.REFUNDED, etc.). Updates payment status based on event type.'
  })
  @ApiBody({ 
    schema: {
      example: {
        id: 'WH-123456789',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: 'PAYID-123456789',
          amount: {
            currency_code: 'USD',
            value: '10.00'
          },
          status: 'COMPLETED'
        }
      }
    },
    description: 'PayPal webhook event payload'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Webhook processed successfully',
    schema: {
      example: {
        success: true,
        recordedId: '550e8400-e29b-41d4-a716-446655440000'
      }
    }
  })
  async paypalWebhook(@Body() payload: any) {
    this.logger.debug('PayPal webhook', { payload });
    const recorded = await this.paymentsService.recordPaymentFromProvider('paypal', payload);
    return { success: true, recordedId: recorded?.id };
  }

  @Get(':id')
  @ApiParam({ 
    name: 'id', 
    type: 'string', 
    format: 'uuid',
    description: 'Payment record UUID'
  })
  @ApiOperation({ 
    summary: 'Get payment by ID',
    description: 'Retrieve a specific payment record by its unique identifier. Returns the full payment object including provider details and metadata.'
  })
  @ApiResponse({
    status: 200,
    description: 'Payment record retrieved successfully',
    schema: {
      example: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        provider: 'mpesa',
        amount: '1000',
        status: 'completed',
        referenceId: 'ORDER-123',
        merchantId: 'MERCHANT-001',
        providerTransactionId: 'MJR1234567890',
        providerMetadata: {
          checkoutRequestId: 'ws_CO_123456789',
          merchantRequestId: 'mr_123456789',
        },
        createdAt: '2025-12-18T21:00:00Z',
        completedAt: '2025-12-18T21:05:30Z',
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async get(@Param('id') id: string) {
    return this.paymentsService.findById(id);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin')
  @ApiBearerAuth('jwt')
  @ApiOperation({ 
    summary: 'Query payments (admin/manager only)',
    description: 'Query and filter payments with advanced filtering, pagination, and date range support. Requires manager or admin role. Results can be filtered by merchant, provider, status, user, and date range.'
  })
  @ApiQuery({ 
    name: 'merchantId', 
    required: false, 
    description: 'Filter by merchant identifier'
  })
  @ApiQuery({ 
    name: 'status', 
    required: false, 
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    description: 'Filter by payment status'
  })
  @ApiQuery({ 
    name: 'provider', 
    required: false, 
    enum: ['mpesa', 'stripe', 'paypal', 'cash'],
    description: 'Filter by payment provider'
  })
  @ApiQuery({ 
    name: 'userId', 
    required: false, 
    format: 'uuid',
    description: 'Filter by user who initiated the payment'
  })
  @ApiQuery({ 
    name: 'start', 
    required: false, 
    type: 'string',
    format: 'date-time',
    description: 'Start date for date range filter (ISO 8601 format)'
  })
  @ApiQuery({ 
    name: 'end', 
    required: false, 
    type: 'string',
    format: 'date-time',
    description: 'End date for date range filter (ISO 8601 format)'
  })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    type: 'number',
    description: 'Page number for pagination (default: 1)'
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    type: 'number',
    description: 'Number of records per page (default: 25, max: 100)'
  })
  @ApiResponse({
    status: 200,
    description: 'Payments list retrieved successfully',
    schema: {
      example: {
        data: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            provider: 'mpesa',
            amount: '1000',
            status: 'completed',
            referenceId: 'ORDER-123',
            createdAt: '2025-12-18T21:00:00Z',
          }
        ],
        total: 150,
        page: 1,
        limit: 25,
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - no JWT token provided' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient role permissions' })
  async query(
    @Query('merchantId') merchantId?: string,
    @Query('status') status?: string,
    @Query('provider') provider?: string,
    @Query('userId') userId?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const page = pageStr ? Number(pageStr) || 1 : 1;
    const limit = limitStr ? Number(limitStr) || 25 : 25;
    return this.paymentsService.queryPayments({ merchantId, status, provider, userId, start, end, page, limit });
  }

  @Post('cash')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('jwt')
  @ApiOperation({ 
    summary: 'Record a cash payment (admin only)',
    description: 'Record a manual cash or bank transfer payment. Only administrators can record cash payments. The payment is immediately marked as completed. Useful for recording payments made through alternative channels not processed by the system.'
  })
  @ApiBody({ 
    schema: { 
      example: { 
        referenceId: 'ORDER-123', 
        amount: '1000', 
        userId: '550e8400-e29b-41d4-a716-446655440000',
        merchantId: 'MERCHANT-001',
        note: 'Received cash payment at reception' 
      } 
    },
    description: 'Cash payment recording request'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Cash payment recorded successfully',
    schema: {
      example: {
        success: true,
        paymentId: '550e8400-e29b-41d4-a716-446655440000'
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Missing referenceId or amount' })
  @ApiResponse({ status: 401, description: 'Unauthorized - no JWT token' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  async recordCashPayment(@Body() body: { referenceId: string; amount: string; userId?: string; merchantId?: string; note?: string }) {
    const { referenceId, amount, userId, merchantId, note } = body || {};
    if (!referenceId || !amount) throw new BadRequestException('referenceId and amount are required');

    try {
      // record payment with provider 'cash'
      const createDto: CreatePaymentDto = {
        provider: 'cash',
        providerTransactionId: undefined,
        amount: String(amount),
        status: 'completed',
        raw: { note: note ?? 'cash_payment' },
        referenceId,
        userId,
        merchantId,
      };

      const payment = await this.paymentsService.create(createDto);

      return { success: true, paymentId: payment?.id };
    } catch (e) {
      this.logger.error('Failed to record cash payment', (e as any)?.message ?? e);
      throw new HttpException({ success: false, error: (e as any)?.message ?? 'failed' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('stats/summary')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin')
  @ApiBearerAuth('jwt')
  @ApiOperation({ 
    summary: 'Get payments summary statistics (admin/manager only)',
    description: 'Retrieve payment statistics including total transaction count, breakdown by status, and total revenue. Can optionally be scoped to a specific hotel/merchant.'
  })
  @ApiQuery({
    name: 'hotelId',
    required: false,
    description: 'Optional merchant/hotel ID to scope results (if omitted, returns all payments)'
  })
  @ApiResponse({
    status: 200,
    description: 'Payment statistics summary retrieved',
    schema: {
      example: {
        total: 1250,
        pending: 45,
        completed: 1200,
        failed: 5,
        revenueCents: 1250000,
        revenueFormatted: 'KES 12,500.00'
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - manager/admin role required' })
  async statsSummary(@Query('hotelId') hotelId?: string) {
    return this.paymentsService.summaryCounts(hotelId);
  }

  @Get('stats/by-provider')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin')
  @ApiBearerAuth('jwt')
  @ApiOperation({ 
    summary: 'Get aggregated payment statistics by provider',
    description: 'Returns payment count and revenue breakdown by provider (M-Pesa, Stripe, PayPal, Cash). Useful for understanding provider distribution and performance.'
  })
  @ApiResponse({
    status: 200,
    description: 'Payment statistics by provider',
    schema: {
      example: {
        mpesa: { count: 800, revenue: 800000, status: { pending: 10, completed: 785, failed: 5 } },
        stripe: { count: 300, revenue: 300000, status: { pending: 5, completed: 295, failed: 0 } },
        paypal: { count: 100, revenue: 100000, status: { pending: 2, completed: 98, failed: 0 } },
        cash: { count: 50, revenue: 50000, status: { completed: 50 } },
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - manager/admin role required' })
  async statsByProvider() {
    return this.paymentsService.byProviderStats();
  }

  @Get('stats/revenue')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin')
  @ApiBearerAuth('jwt')
  @ApiOperation({ 
    summary: 'Get revenue series by interval',
    description: 'Returns revenue data points grouped by time interval (daily, weekly, or monthly). Useful for generating revenue charts and trends. Can be filtered by date range.'
  })
  @ApiQuery({
    name: 'interval',
    required: false,
    enum: ['daily', 'weekly', 'monthly'],
    description: 'Time interval for aggregation (default: daily)'
  })
  @ApiQuery({
    name: 'start',
    required: false,
    type: 'string',
    format: 'date-time',
    description: 'Start date for range (ISO 8601)'
  })
  @ApiQuery({
    name: 'end',
    required: false,
    type: 'string',
    format: 'date-time',
    description: 'End date for range (ISO 8601)'
  })
  @ApiResponse({
    status: 200,
    description: 'Revenue series data',
    schema: {
      example: [
        { date: '2025-12-18', revenue: 150000, transactionCount: 25 },
        { date: '2025-12-17', revenue: 145000, transactionCount: 23 },
        { date: '2025-12-16', revenue: 160000, transactionCount: 28 },
      ]
    }
  })
  async statsRevenue(
    @Query('interval') interval?: 'daily' | 'weekly' | 'monthly',
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const finalInterval = (interval as 'daily' | 'weekly' | 'monthly') || 'daily';
    return this.paymentsService.revenueByInterval(finalInterval, start, end);
  }

  @Get('stats/transactions-by-day')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin')
  @ApiBearerAuth('jwt')
  @ApiOperation({ 
    summary: 'Get transaction counts for a specific day',
    description: 'Returns hourly breakdown of transaction counts and revenue for a given date. Useful for traffic analysis and peak time identification.'
  })
  @ApiQuery({
    name: 'date',
    required: false,
    type: 'string',
    format: 'date',
    description: 'Date to query transactions for (YYYY-MM-DD format, defaults to today)'
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction counts by hour for the day',
    schema: {
      example: {
        date: '2025-12-18',
        totalTransactions: 125,
        totalRevenue: 125000,
        hourly: [
          { hour: 0, count: 2, revenue: 5000 },
          { hour: 9, count: 12, revenue: 15000 },
          { hour: 10, count: 18, revenue: 22000 },
        ]
      }
    }
  })
  async transactionsByDay(@Query('date') date?: string) {
    return this.paymentsService.transactionCountsForDate(date);
  }
}
