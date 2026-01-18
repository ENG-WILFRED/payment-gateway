"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PaymentsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const payments_service_1 = require("../services/payments.service");
const create_payment_dto_1 = require("../dto/create-payment.dto");
const roles_guard_1 = require("../auth/src/extra/roles.guard");
const roles_decorator_1 = require("../auth/src/extra/roles.decorator");
let PaymentsController = PaymentsController_1 = class PaymentsController {
    constructor(paymentsService) {
        this.paymentsService = paymentsService;
        this.logger = new common_1.Logger(PaymentsController_1.name);
    }
    async create(createDto) {
        this.logger.debug('Create payment request', createDto);
        return this.paymentsService.create(createDto);
    }
    async get(id) {
        return this.paymentsService.findById(id);
    }
    async query(opts) {
        const { merchantId, status, provider, userId, start, end, page = 1, limit = 25 } = opts || {};
        return this.paymentsService.queryPayments({ merchantId, status, provider, userId, start, end, page, limit });
    }
    async recordCash(body) {
        var _a, _b;
        const { referenceId, amount, userId, merchantId, note } = body || {};
        if (!referenceId || !amount)
            throw new common_1.BadRequestException('referenceId and amount are required');
        try {
            const createDto = {
                provider: 'cash',
                providerTransactionId: undefined,
                amount: String(amount),
                status: 'completed',
                raw: { note: note !== null && note !== void 0 ? note : 'cash_payment' },
                referenceId,
                userId,
                merchantId,
            };
            const payment = await this.paymentsService.create(createDto);
            return { success: true, paymentId: payment === null || payment === void 0 ? void 0 : payment.id };
        }
        catch (e) {
            this.logger.error('Failed to record cash payment', (_a = e === null || e === void 0 ? void 0 : e.message) !== null && _a !== void 0 ? _a : e);
            throw new common_1.HttpException({ success: false, error: (_b = e === null || e === void 0 ? void 0 : e.message) !== null && _b !== void 0 ? _b : 'failed' }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.PaymentsController = PaymentsController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({
        summary: 'Create a payment record (internal use)',
        description: 'Create a payment record in the system. This is typically used internally by provider-specific endpoints. For normal payment flows, use the provider-specific endpoints like /payments/mpesa/initiate.',
    }),
    (0, swagger_1.ApiBody)({
        type: create_payment_dto_1.CreatePaymentDto,
        description: 'Payment data to create',
    }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: 'Payment record created successfully',
        schema: {
            example: {
                id: '550e8400-e29b-41d4-a716-446655440000',
                provider: 'mpesa',
                amount: '1000',
                status: 'pending',
                referenceId: 'ORDER-123',
                merchantId: 'MERCHANT-001',
                createdAt: '2025-12-18T21:00:00Z',
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid payment data' }),
    (0, swagger_1.ApiResponse)({ status: 500, description: 'Internal server error' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_payment_dto_1.CreatePaymentDto]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiParam)({
        name: 'id',
        type: 'string',
        format: 'uuid',
        description: 'Payment record UUID',
    }),
    (0, swagger_1.ApiOperation)({
        summary: 'Get payment by ID',
        description: 'Retrieve a specific payment record by its unique identifier. Returns the full payment object including provider details and metadata.',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Payment record retrieved successfully',
        schema: {
            example: {
                id: '550e8400-e29b-41d4-a716-446655440000',
                provider: 'mpesa',
                amount: '1000',
                status: 'completed',
                referenceId: 'ORDER-123',
                merchantId: 'MERCHANT-001',
                providerTransactionId: 'MJR1234567890',
                providerMetadata: {
                    checkoutRequestId: 'ws_CO_123456789',
                    merchantRequestId: 'mr_123456789',
                },
                createdAt: '2025-12-18T21:00:00Z',
                completedAt: '2025-12-18T21:05:30Z',
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Payment not found' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "get", null);
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('manager', 'admin'),
    (0, swagger_1.ApiBearerAuth)('jwt'),
    (0, swagger_1.ApiOperation)({
        summary: 'Query payments (admin/manager only)',
        description: 'Query and filter payments with advanced filtering, pagination, and date range support. Requires manager or admin role. Results can be filtered by merchant, provider, status, user, and date range.',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Payments list retrieved successfully',
        schema: {
            example: {
                data: [
                    {
                        id: '550e8400-e29b-41d4-a716-446655440000',
                        provider: 'mpesa',
                        amount: '1000',
                        status: 'completed',
                        referenceId: 'ORDER-123',
                        createdAt: '2025-12-18T21:00:00Z',
                    },
                ],
                total: 150,
                page: 1,
                limit: 25,
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized - no JWT token provided' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Forbidden - insufficient role permissions' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "query", null);
__decorate([
    (0, common_1.Post)('cash'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiBearerAuth)('jwt'),
    (0, swagger_1.ApiOperation)({
        summary: 'Record a cash payment (admin only)',
        description: 'Record a manual cash or bank transfer payment. Only administrators can record cash payments. The payment is immediately marked as completed. Useful for recording payments made through alternative channels not processed by the system.',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            example: {
                referenceId: 'ORDER-123',
                amount: '1000',
                userId: '550e8400-e29b-41d4-a716-446655440000',
                merchantId: 'MERCHANT-001',
                note: 'Received cash payment at reception',
            },
        },
        description: 'Cash payment recording request',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Cash payment recorded successfully',
        schema: {
            example: {
                success: true,
                paymentId: '550e8400-e29b-41d4-a716-446655440000',
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Missing referenceId or amount' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized - no JWT token' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Forbidden - admin role required' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "recordCash", null);
exports.PaymentsController = PaymentsController = PaymentsController_1 = __decorate([
    (0, swagger_1.ApiTags)('Payments'),
    (0, common_1.Controller)('payments'),
    __metadata("design:paramtypes", [payments_service_1.PaymentsService])
], PaymentsController);
//# sourceMappingURL=payments.controller.js.map