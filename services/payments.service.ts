import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Payment } from '../entities/payment.entity';
import { PaymentsQueryService } from './queries/payments.query';
import { PaymentsHandlerService } from './handlers/payments.handler';
import { CreatePaymentDto } from '../dto/create-payment.dto';

/**
 * Main Payments Service - orchestrates payment operations.
 * Delegates to specialized services for queries and handlers.
 */
@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment) private paymentModel: typeof Payment,
    private queryService: PaymentsQueryService,
    private handlerService: PaymentsHandlerService,
  ) {}

  // Delegate to handler service
  async create(createDto: CreatePaymentDto) {
    return this.handlerService.create(createDto);
  }

  async findById(id: string) {
    return this.queryService.findById(id);
  }

  // Delegate to query service
  async queryPayments(opts: {
    merchantId?: string;
    status?: string;
    provider?: string;
    userId?: string;
    start?: string;
    end?: string;
    page?: number;
    limit?: number;
  }) {
    return this.queryService.queryPayments(opts);
  }

  async summaryCounts(merchantId?: string) {
    return this.queryService.summaryCounts(merchantId);
  }

  async byProviderStats() {
    return this.queryService.byProviderStats();
  }

  async revenueByInterval(interval: 'daily' | 'weekly' | 'monthly', start?: string, end?: string) {
    return this.queryService.revenueByInterval(interval, start, end);
  }

  async transactionCountsForDate(date?: string) {
    return this.queryService.transactionCountsForDate(date);
  }

  async recordPaymentFromCallback(payload: any) {
    return this.handlerService.recordPaymentFromCallback(payload);
  }

  async recordPaymentFromProvider(provider: string, payload: any) {
    return this.handlerService.recordPaymentFromProvider(provider, payload);
  }
}
