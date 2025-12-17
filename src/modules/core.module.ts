import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AppController } from '../app.controller';
import { AppService } from '../app.service';
import { PaymentsModule } from '../../payments.module';

@Module({
  imports: [DatabaseModule, PaymentsModule],
  controllers: [AppController],
  providers: [AppService],
  exports: [AppService],
})
export class CoreModule {}
