import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Payment } from '../entities/payment.entity';
import { PaymentsService } from '../services/payments.service';
import { PaymentsQueryService } from '../services/queries/payments.query';
import { PaymentsHandlerService } from '../services/handlers/payments.handler';
import { PaymentsController } from '../controllers/payments.controller';
import { PaymentStatsController } from '../controllers/payment-stats.controller';
import { MpesaPaymentController } from '../controllers/providers/mpesa.controller';
import { StripePaymentController } from '../controllers/providers/stripe.controller';
import { PaypalPaymentController } from '../controllers/providers/paypal.controller';
import { MpesaService } from '../services/mpesa.service';
import { StripeService } from '../services/stripe.service';
import { PaypalService } from '../services/paypal.service';

@Module({
  imports: [SequelizeModule.forFeature([Payment])],
  providers: [PaymentsService, PaymentsQueryService, PaymentsHandlerService, MpesaService, StripeService, PaypalService],
  controllers: [PaymentsController, PaymentStatsController, MpesaPaymentController, StripePaymentController, PaypalPaymentController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
