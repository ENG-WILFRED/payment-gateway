import {
  IsUUID,
  IsOptional,
  IsString,
  IsNumberString
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePaymentDto {
  @ApiProperty({ example: 'mpesa', description: 'Payment provider identifier' })
  @IsString()
  provider: string;

  @ApiPropertyOptional({ description: 'Provider-specific transaction id (when available)' })
  @IsOptional()
  @IsString()
  providerTransactionId?: string;

  @ApiProperty({ example: '1000', description: 'Amount as string in smallest currency unit or decimal as appropriate' })
  @IsNumberString()
  amount: string;

  @ApiPropertyOptional({ example: 'pending', description: 'Payment status (pending|completed|failed)' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ type: 'object', description: 'Raw provider payload for debugging/reconciliation', additionalProperties: true })
  @IsOptional()
  raw?: any;

  @ApiPropertyOptional({ format: 'uuid', description: 'Associated order id' })
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'User who initiated the payment (if authenticated)' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Hotel id the payment is scoped to (useful for multi-tenant reporting)' })
  @IsOptional()
  @IsUUID()
  hotelId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Cart id associated with the payment (optional)' })
  @IsOptional()
  @IsUUID()
  cartId?: string;

  @ApiPropertyOptional({ description: 'M-Pesa CheckoutRequestID (for reconciliation)' })
  @IsOptional()
  @IsString()
  initiatedCheckoutRequestId?: string;

  @ApiPropertyOptional({ description: 'M-Pesa MerchantRequestID (for reconciliation)' })
  @IsOptional()
  @IsString()
  initiatedMerchantRequestId?: string;
}
