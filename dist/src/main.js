"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const swagger_1 = require("@nestjs/swagger");
const request_logger_middleware_1 = require("./middleware/request-logger.middleware");
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.setGlobalPrefix('');
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('Payments Service API')
        .setDescription('Comprehensive payments processing service supporting multiple payment providers (M-Pesa, Stripe, PayPal) with real-time callbacks, webhook handling, and detailed analytics. ' +
        'Features multi-tenant merchant support, role-based access control, transaction reconciliation, and comprehensive audit trails.')
        .setVersion('1.0.0')
        .setContact('Payment Service Team', 'https://payments.example.com', 'support@payments.example.com')
        .setLicense('MIT', 'https://opensource.org/licenses/MIT')
        .addServer(`http://localhost:${process.env.PORT || 3001}`, 'Development')
        .addServer('https://payment-gateway-7eta.onrender.com', 'Production')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'JWT token for authenticated endpoints' }, 'jwt')
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    swagger_1.SwaggerModule.setup('docs', app, document);
    const port = process.env.PORT ? Number(process.env.PORT) : 3001;
    const requestLogger = new request_logger_middleware_1.RequestLoggerMiddleware();
    app.use((req, res, next) => requestLogger.use(req, res, next));
    await app.listen(port);
    console.log('Payments service started on port', port);
}
bootstrap();
//# sourceMappingURL=main.js.map