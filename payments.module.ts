import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Payment } from './entities/payment.entity';
import { PaymentsService } from './services/payments.service';
import { PaymentsController } from './controllers/payments.controller';
import { MpesaService } from './services/mpesa.service';
import { StripeService } from './services/stripe.service';
import { PaypalService } from './services/paypal.service';

@Module({
  imports: [SequelizeModule.forFeature([Payment])],
  providers: [PaymentsService, MpesaService, StripeService, PaypalService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
