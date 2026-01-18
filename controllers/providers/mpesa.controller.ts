import { Controller, Post, Body, Logger, HttpCode, HttpStatus, BadRequestException, HttpException } from '@nestjs/common';
import { PaymentsService } from '../../services/payments.service';
import { CreatePaymentDto } from '../../dto/create-payment.dto';
import { MpesaService } from '../../services/mpesa.service';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';

/**
 * M-Pesa Payment Controller
 * Handles M-Pesa STK Push initiation and callback processing
 */
@ApiTags('Payments - M-Pesa')
@Controller('payments/mpesa')
export class MpesaPaymentController {
  private readonly logger = new Logger(MpesaPaymentController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly mpesaService: MpesaService,
  ) {}

  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initiate M-Pesa STK Push payment',
    description: 'Initiates an M-Pesa STK Push prompt on the customer\'s phone. The customer will receive a popup to enter their M-Pesa PIN to confirm payment. Payment status updates are received via the callback URL.',
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
        transactionDesc: 'Payment for order #123',
      },
    },
    description: 'M-Pesa STK Push request payload',
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
        paymentId: '550e8400-e29b-41d4-a716-446655440000',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Missing required fields (phone, amount, stkCallback)' })
  @ApiResponse({ status: 502, description: 'M-Pesa API error or connection failure' })
  async initiate(@Body() body: any) {
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

  @Post('callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'M-Pesa callback endpoint (provider webhook)',
    description: 'Webhook endpoint called by M-Pesa (Safaricom) when the customer completes or cancels the STK Push prompt. Always returns 200 OK to acknowledge receipt. Transaction status is updated based on the callback result code.',
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
              ],
            },
          },
        },
      },
    },
    description: 'M-Pesa callback payload from Safaricom',
  })
  @ApiResponse({
    status: 200,
    description: 'Callback processed and acknowledged',
    schema: {
      example: {
        ResultCode: 0,
        ResultDesc: 'Callback received successfully',
        recordedId: '550e8400-e29b-41d4-a716-446655440000',
      },
    },
  })
  async callback(@Body() payload: any) {
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
}
