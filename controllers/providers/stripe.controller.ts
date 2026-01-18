import { Controller, Post, Body, Logger, HttpCode, HttpStatus, BadRequestException, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { PaymentsService } from '../../services/payments.service';
import { StripeService } from '../../services/stripe.service';

/**
 * Stripe Payment Controller
 * Handles Stripe PaymentIntent creation and webhook processing
 */
@ApiTags('Payments - Stripe')
@Controller('payments/stripe')
export class StripePaymentController {
  private readonly logger = new Logger(StripePaymentController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly stripeService?: StripeService,
  ) {}

  @Post('create-payment-intent')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a Stripe PaymentIntent',
    description: 'Creates a Stripe PaymentIntent and returns a client_secret for use on the frontend with Stripe.js. Also records a pending payment record for reconciliation.',
  })
  @ApiBody({
    schema: {
      example: {
        amount: '1000',
        currency: 'usd',
        metadata: { orderId: '550e8400-e29b-41d4-a716-446655440000', customerName: 'John Doe' },
      },
    },
    description: 'Stripe PaymentIntent creation request',
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
        status: 'requires_payment_method',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Missing amount parameter' })
  async createPaymentIntent(@Body() body: any) {
    const { amount, currency, metadata } = body || {};
    if (!amount) throw new BadRequestException('amount is required');
    const res = await this.stripeService?.createPaymentIntent(amount, currency ?? 'usd', metadata);
    // create a pending payment record for reconciliation
    await this.paymentsService.recordPaymentFromProvider('stripe', { id: res?.id, amount, status: 'pending', raw: res });
    return res;
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Stripe webhook endpoint',
    description: 'Webhook endpoint called by Stripe for payment events (payment_intent.succeeded, payment_intent.payment_failed, charge.refunded, etc.). Verifies webhook signature and updates payment status.',
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
            status: 'succeeded',
          },
        },
      },
    },
    description: 'Stripe webhook event payload',
  })
  @ApiQuery({
    name: 'sig',
    required: false,
    description: 'Stripe signature from x-stripe-signature header',
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed successfully',
    schema: {
      example: {
        success: true,
        recordedId: '550e8400-e29b-41d4-a716-446655440000',
      },
    },
  })
  async webhook(@Body() payload: any, @Query('sig') sig?: string) {
    this.logger.debug('Stripe webhook', { payload });
    // Note: signature header is typically in req.headers['stripe-signature']; here we accept query for simplicity
    const verified = this.stripeService?.verifySignature(JSON.stringify(payload), sig);
    if (!verified) return { success: false };
    const recorded = await this.paymentsService.recordPaymentFromProvider('stripe', payload);
    return { success: true, recordedId: recorded?.id };
  }
}
