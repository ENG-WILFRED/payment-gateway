import { Controller, Post, Body, Logger, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { PaymentsService } from '../../services/payments.service';
import { PaypalService } from '../../services/paypal.service';

/**
 * PayPal Payment Controller
 * Handles PayPal Order creation and webhook processing
 */
@ApiTags('Payments - PayPal')
@Controller('payments/paypal')
export class PaypalPaymentController {
  private readonly logger = new Logger(PaypalPaymentController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly paypalService?: PaypalService,
  ) {}

  @Post('create-order')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a PayPal Order',
    description: 'Creates a PayPal Order and returns the approval URL for customer redirect. Also records a pending payment record for reconciliation.',
  })
  @ApiBody({
    schema: {
      example: {
        amount: '10.00',
        returnUrl: 'https://yourapp.com/success',
        cancelUrl: 'https://yourapp.com/cancel',
      },
    },
    description: 'PayPal order creation request',
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
            href: 'https://www.paypal.com/cgi-bin/webscr?cmd=_express-checkout&token=PAYID-123456789',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Missing amount parameter' })
  async createOrder(@Body() body: any) {
    const { amount, returnUrl, cancelUrl } = body || {};
    if (!amount) throw new BadRequestException('amount is required');
    const res = await this.paypalService?.createOrder(amount, returnUrl, cancelUrl);
    // store pending order record mapped to provider response
    await this.paymentsService.recordPaymentFromProvider('paypal', { id: res?.id, amount, status: 'CREATED', raw: res });
    return res;
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'PayPal webhook endpoint',
    description: 'Webhook endpoint called by PayPal for payment events (PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.REFUNDED, etc.). Updates payment status based on event type.',
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
            value: '10.00',
          },
          status: 'COMPLETED',
        },
      },
    },
    description: 'PayPal webhook event payload',
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
  async webhook(@Body() payload: any) {
    this.logger.debug('PayPal webhook', { payload });
    const recorded = await this.paymentsService.recordPaymentFromProvider('paypal', payload);
    return { success: true, recordedId: recorded?.id };
  }
}
