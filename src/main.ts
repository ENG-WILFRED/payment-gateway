import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { RequestLoggerMiddleware } from './middleware/request-logger.middleware';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Payments Service API')
    .setDescription(
      'Comprehensive payments processing service supporting multiple payment providers (M-Pesa, Stripe, PayPal) with real-time callbacks, webhook handling, and detailed analytics. ' +
      'Features multi-tenant merchant support, role-based access control, transaction reconciliation, and comprehensive audit trails.',
    )
    .setVersion('1.0.0')
    .setContact('Payment Service Team', 'https://payments.example.com', 'support@payments.example.com')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addServer(`http://localhost:${process.env.PORT || 3001}`, 'Development')
    .addServer('https://payment-gateway-7eta.onrender.com', 'Production')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'JWT token for authenticated endpoints' },
      'jwt',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  // Register request logger for debugging all incoming requests
  const requestLogger = new RequestLoggerMiddleware();
  app.use((req, res, next) => requestLogger.use(req, res, next));

  await app.listen(port);
  console.log('Payments service started on port', port);
}

bootstrap();
