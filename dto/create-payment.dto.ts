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

  @ApiPropertyOptional({ type: 'object', description: 'Raw provider response/payload for audit and reconciliation', additionalProperties: true })
  @IsOptional()
  raw?: any;

  @ApiPropertyOptional({ type: 'object', description: 'Provider-specific tracking metadata (e.g., checkoutId, requestId, session id)', additionalProperties: true })
  @IsOptional()
  providerMetadata?: any;

  @ApiPropertyOptional({ description: 'Merchant reference id (e.g. order id, invoice id, checkout session id)' })
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Merchant identifier for multi-tenant scoping (SaaS/platform scenarios)' })
  @IsOptional()
  @IsString()
  merchantId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'User who initiated the payment (if authenticated)' })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
