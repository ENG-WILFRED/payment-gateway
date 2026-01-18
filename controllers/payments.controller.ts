import { Controller, Post, Get, Body, Param, Logger, HttpCode, HttpStatus, BadRequestException, HttpException, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiResponse, ApiParam } from '@nestjs/swagger';
import { PaymentsService } from '../services/payments.service';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { RolesGuard } from '../auth/src/extra/roles.guard';
import { Roles } from '../auth/src/extra/roles.decorator';

/**
 * Core Payments Controller
 * Handles basic payment operations: create, retrieve, query, and cash recording
 * 
 * Provider-specific endpoints (M-Pesa, Stripe, PayPal) are in:
 * - controllers/providers/mpesa.controller.ts
 * - controllers/providers/stripe.controller.ts
 * - controllers/providers/paypal.controller.ts
 * 
 * Analytics endpoints are in:
 * - controllers/payment-stats.controller.ts
 */
@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a payment record (internal use)',
    description: 'Create a payment record in the system. This is typically used internally by provider-specific endpoints. For normal payment flows, use the provider-specific endpoints like /payments/mpesa/initiate.',
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
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid payment data' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async create(@Body() createDto: CreatePaymentDto) {
    this.logger.debug('Create payment request', createDto);
    return this.paymentsService.create(createDto);
  }

  @Get(':id')
  @ApiParam({
    name: 'id',
    type: 'string',
    format: 'uuid',
    description: 'Payment record UUID',
  })
  @ApiOperation({
    summary: 'Get payment by ID',
    description: 'Retrieve a specific payment record by its unique identifier. Returns the full payment object including provider details and metadata.',
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
      },
    },
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
    description: 'Query and filter payments with advanced filtering, pagination, and date range support. Requires manager or admin role. Results can be filtered by merchant, provider, status, user, and date range.',
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
          },
        ],
        total: 150,
        page: 1,
        limit: 25,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - no JWT token provided' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient role permissions' })
  async query(
    @Body() opts?: {
      merchantId?: string;
      status?: string;
      provider?: string;
      userId?: string;
      start?: string;
      end?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const { merchantId, status, provider, userId, start, end, page = 1, limit = 25 } = opts || {};
    return this.paymentsService.queryPayments({ merchantId, status, provider, userId, start, end, page, limit });
  }

  @Post('cash')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Record a cash payment (admin only)',
    description: 'Record a manual cash or bank transfer payment. Only administrators can record cash payments. The payment is immediately marked as completed. Useful for recording payments made through alternative channels not processed by the system.',
  })
  @ApiBody({
    schema: {
      example: {
        referenceId: 'ORDER-123',
        amount: '1000',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        merchantId: 'MERCHANT-001',
        note: 'Received cash payment at reception',
      },
    },
    description: 'Cash payment recording request',
  })
  @ApiResponse({
    status: 200,
    description: 'Cash payment recorded successfully',
    schema: {
      example: {
        success: true,
        paymentId: '550e8400-e29b-41d4-a716-446655440000',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Missing referenceId or amount' })
  @ApiResponse({ status: 401, description: 'Unauthorized - no JWT token' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  async recordCash(@Body() body: { referenceId: string; amount: string; userId?: string; merchantId?: string; note?: string }) {
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
}
