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
const payments_service_1 = require("../services/payments.service");
const create_payment_dto_1 = require("../dto/create-payment.dto");
const mpesa_service_1 = require("../services/mpesa.service");
const roles_guard_1 = require("../../auth/src/extra/roles.guard");
const roles_decorator_1 = require("../../auth/src/extra/roles.decorator");
const swagger_1 = require("@nestjs/swagger");
let PaymentsController = PaymentsController_1 = class PaymentsController {
    constructor(paymentsService, mpesaService) {
        this.paymentsService = paymentsService;
        this.mpesaService = mpesaService;
        this.logger = new common_1.Logger(PaymentsController_1.name);
    }
    async create(createDto) {
        this.logger.debug('Create payment request', createDto);
        return this.paymentsService.create(createDto);
    }
    async initiateMpesa(body) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        this.logger.debug('Mpesa initiate request', body);
        const { phone, amount, accountReference, orderId, userId, hotelId, cartId } = body || {};
        if (!phone || !amount) {
            throw new common_1.BadRequestException('phone and amount are required');
        }
        try {
            const res = await this.mpesaService.initiateStkPush(phone, String(amount), accountReference, body === null || body === void 0 ? void 0 : body.transactionDesc);
            const initiatedCheckout = (_b = (_a = res === null || res === void 0 ? void 0 : res.CheckoutRequestID) !== null && _a !== void 0 ? _a : res === null || res === void 0 ? void 0 : res.checkoutRequestID) !== null && _b !== void 0 ? _b : res === null || res === void 0 ? void 0 : res.CheckoutRequestId;
            const initiatedMerchant = (_d = (_c = res === null || res === void 0 ? void 0 : res.MerchantRequestID) !== null && _c !== void 0 ? _c : res === null || res === void 0 ? void 0 : res.merchantRequestID) !== null && _d !== void 0 ? _d : res === null || res === void 0 ? void 0 : res.MerchantRequestId;
            let effectiveHotelId = hotelId;
            if (!effectiveHotelId && orderId) {
                try {
                    const OrderItem = require('../entities/order-item.entity').OrderItem;
                    const Product = require('../entities/product.entity').Product;
                    const User = require('../auth/user.entity').User;
                    const OrderDyn = require('../../orders/entities/order.entity').Order;
                    const ord = await OrderDyn.findByPk(orderId, { include: [{ model: OrderItem, include: [Product] }, { model: User }] });
                    if (ord) {
                        effectiveHotelId = (_k = (_f = (_e = ord === null || ord === void 0 ? void 0 : ord.user) === null || _e === void 0 ? void 0 : _e.hotelId) !== null && _f !== void 0 ? _f : (_j = (_h = (_g = ord === null || ord === void 0 ? void 0 : ord.items) === null || _g === void 0 ? void 0 : _g[0]) === null || _h === void 0 ? void 0 : _h.product) === null || _j === void 0 ? void 0 : _j.hotelId) !== null && _k !== void 0 ? _k : effectiveHotelId;
                    }
                }
                catch (e) {
                    this.logger.warn('Failed to infer hotelId from order: ' + ((_l = e === null || e === void 0 ? void 0 : e.message) !== null && _l !== void 0 ? _l : e));
                }
            }
            const createDto = {
                provider: 'mpesa',
                providerTransactionId: undefined,
                amount: String(amount),
                status: 'pending',
                raw: { initiated: res },
                orderId: orderId,
                userId: userId,
                hotelId: effectiveHotelId,
                initiatedCheckoutRequestId: initiatedCheckout,
                initiatedMerchantRequestId: initiatedMerchant,
            };
            const payment = await this.paymentsService.create(createDto);
            if (orderId) {
                try {
                    const OrderDyn = require('../../orders/entities/order.entity').Order;
                    await OrderDyn.update({ status: 'pending' }, { where: { id: orderId } });
                    this.logger.log(`Marked order ${orderId} as pending`);
                }
                catch (e) {
                    this.logger.warn(`Failed to mark order ${orderId} as pending: ${e === null || e === void 0 ? void 0 : e.message}`);
                }
            }
            return { message: 'STK push initiated', data: res, pendingPaymentId: payment === null || payment === void 0 ? void 0 : payment.id };
        }
        catch (err) {
            this.logger.error('Failed to initiate mpesa push', (_m = err === null || err === void 0 ? void 0 : err.message) !== null && _m !== void 0 ? _m : err);
            const status = (err === null || err === void 0 ? void 0 : err.status) || common_1.HttpStatus.BAD_GATEWAY;
            const body = (_o = err === null || err === void 0 ? void 0 : err.body) !== null && _o !== void 0 ? _o : { message: (_p = err === null || err === void 0 ? void 0 : err.message) !== null && _p !== void 0 ? _p : 'initiation_failed' };
            throw new common_1.HttpException({ success: false, error: body }, status);
        }
    }
    async mpesaCallback(payload) {
        this.logger.debug('Mpesa callback received', payload);
        try {
            const parsed = await this.mpesaService.handleCallback(payload);
            const recorded = await this.paymentsService.recordPaymentFromCallback(parsed);
            return { ResultCode: 0, ResultDesc: 'Callback received successfully', recordedId: recorded === null || recorded === void 0 ? void 0 : recorded.id };
        }
        catch (err) {
            this.logger.error('Error processing mpesa callback', err);
            return { success: false, error: 'processing_failed' };
        }
    }
    async get(id) {
        return this.paymentsService.findById(id);
    }
    async query(hotelId, status, provider, userId, start, end, pageStr, limitStr) {
        const page = pageStr ? Number(pageStr) || 1 : 1;
        const limit = limitStr ? Number(limitStr) || 25 : 25;
        return this.paymentsService.queryPayments({ hotelId, status, provider, userId, start, end, page, limit });
    }
    async recordCashPayment(body) {
        var _a, _b;
        const { orderId, amount, userId, hotelId, note } = body || {};
        if (!orderId || !amount)
            throw new common_1.BadRequestException('orderId and amount are required');
        try {
            const OrderDyn = require('../../orders/entities/order.entity').Order;
            await OrderDyn.update({ status: 'paid' }, { where: { id: orderId } });
            const createDto = {
                provider: 'cash',
                providerTransactionId: undefined,
                amount: String(amount),
                status: 'completed',
                raw: { note: note !== null && note !== void 0 ? note : 'cash_payment' },
                orderId,
                userId,
                hotelId,
            };
            const payment = await this.paymentsService.create(createDto);
            return { success: true, paymentId: payment === null || payment === void 0 ? void 0 : payment.id };
        }
        catch (e) {
            this.logger.error('Failed to record cash payment', (_a = e === null || e === void 0 ? void 0 : e.message) !== null && _a !== void 0 ? _a : e);
            throw new common_1.HttpException({ success: false, error: (_b = e === null || e === void 0 ? void 0 : e.message) !== null && _b !== void 0 ? _b : 'failed' }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async statsSummary(hotelId) {
        return this.paymentsService.summaryCounts(hotelId);
    }
    async statsByProvider() {
        return this.paymentsService.byProviderStats();
    }
    async statsRevenue(intervalParam, body) {
        const interval = (body === null || body === void 0 ? void 0 : body.interval) || intervalParam || 'daily';
        const start = body === null || body === void 0 ? void 0 : body.start;
        const end = body === null || body === void 0 ? void 0 : body.end;
        return this.paymentsService.revenueByInterval(interval, start, end);
    }
    async transactionsByDay(date) {
        return this.paymentsService.transactionCountsForDate(date);
    }
};
exports.PaymentsController = PaymentsController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a payment record (internal)' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Payment created' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_payment_dto_1.CreatePaymentDto]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('mpesa/initiate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Initiate M-Pesa STK push (returns provider response)' }),
    (0, swagger_1.ApiBody)({ schema: { example: { phone: '+2547...', amount: '1000', orderId: '<order_uuid>' } } }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'STK push initiated', schema: { example: { message: 'STK push initiated', data: { CheckoutRequestID: 'ws_CO_12345' }, pendingPaymentId: 'payment-uuid' } } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "initiateMpesa", null);
__decorate([
    (0, common_1.Post)('mpesa/callback'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'M-Pesa callback endpoint (provider calls this)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Acknowledged' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "mpesaCallback", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get payment by id' }),
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
    (0, swagger_1.ApiOperation)({ summary: 'Query payments (admin/manager only)' }),
    __param(0, (0, common_1.Query)('hotelId')),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('provider')),
    __param(3, (0, common_1.Query)('userId')),
    __param(4, (0, common_1.Query)('start')),
    __param(5, (0, common_1.Query)('end')),
    __param(6, (0, common_1.Query)('page')),
    __param(7, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "query", null);
__decorate([
    (0, common_1.Post)('cash'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiBearerAuth)('jwt'),
    (0, swagger_1.ApiOperation)({ summary: 'Record a cash payment and mark order paid (admin only)' }),
    (0, swagger_1.ApiBody)({ schema: { example: { orderId: '<order_uuid>', amount: '1000', note: 'Paid in cash' } } }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Recorded cash payment', schema: { example: { success: true, paymentId: 'payment-uuid' } } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "recordCashPayment", null);
__decorate([
    (0, common_1.Get)('stats/summary'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('manager', 'admin'),
    (0, swagger_1.ApiBearerAuth)('jwt'),
    (0, swagger_1.ApiOperation)({ summary: 'Get payments summary (counts + revenue) optionally scoped to hotel' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Payments summary', schema: { example: { total: 123, pending: 5, completed: 118, revenueCents: 123450 } } }),
    __param(0, (0, common_1.Query)('hotelId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "statsSummary", null);
__decorate([
    (0, common_1.Get)('stats/by-provider'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('manager', 'admin'),
    (0, swagger_1.ApiBearerAuth)('jwt'),
    (0, swagger_1.ApiOperation)({ summary: 'Aggregated stats by provider' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "statsByProvider", null);
__decorate([
    (0, common_1.Get)('stats/revenue'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('manager', 'admin'),
    (0, swagger_1.ApiBearerAuth)('jwt'),
    (0, swagger_1.ApiOperation)({ summary: 'Revenue series by interval (daily|weekly|monthly)' }),
    __param(0, (0, common_1.Param)('interval')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "statsRevenue", null);
__decorate([
    (0, common_1.Get)('stats/transactions-by-day'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('manager', 'admin'),
    (0, swagger_1.ApiBearerAuth)('jwt'),
    (0, swagger_1.ApiOperation)({ summary: 'Transaction counts for a specific day' }),
    __param(0, (0, common_1.Query)('date')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "transactionsByDay", null);
exports.PaymentsController = PaymentsController = PaymentsController_1 = __decorate([
    (0, swagger_1.ApiTags)('Payments'),
    (0, common_1.Controller)('payments'),
    __metadata("design:paramtypes", [payments_service_1.PaymentsService,
        mpesa_service_1.MpesaService])
], PaymentsController);
//# sourceMappingURL=payments.controller.js.map