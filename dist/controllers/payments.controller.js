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
const stripe_service_1 = require("../services/stripe.service");
const paypal_service_1 = require("../services/paypal.service");
const roles_guard_1 = require("../auth/src/extra/roles.guard");
const roles_decorator_1 = require("../auth/src/extra/roles.decorator");
const swagger_1 = require("@nestjs/swagger");
let PaymentsController = PaymentsController_1 = class PaymentsController {
    constructor(paymentsService, mpesaService, stripeService, paypalService) {
        this.paymentsService = paymentsService;
        this.mpesaService = mpesaService;
        this.stripeService = stripeService;
        this.paypalService = paypalService;
        this.logger = new common_1.Logger(PaymentsController_1.name);
    }
    async create(createDto) {
        this.logger.debug('Create payment request', createDto);
        return this.paymentsService.create(createDto);
    }
    async initiateMpesa(body) {
        var _a, _b, _c, _d, _e, _f, _g;
        this.logger.debug('M-Pesa payment initiation request', body);
        const { phone, amount, stkCallback, accountReference, referenceId, userId, merchantId } = body || {};
        if (!phone || !amount) {
            throw new common_1.BadRequestException('phone and amount are required');
        }
        if (!stkCallback) {
            throw new common_1.BadRequestException('stkCallback is required');
        }
        try {
            const res = await this.mpesaService.initiateStkPush(phone, String(amount), stkCallback, accountReference, body === null || body === void 0 ? void 0 : body.transactionDesc);
            const providerMetadata = {
                checkoutRequestId: (_b = (_a = res === null || res === void 0 ? void 0 : res.CheckoutRequestID) !== null && _a !== void 0 ? _a : res === null || res === void 0 ? void 0 : res.checkoutRequestID) !== null && _b !== void 0 ? _b : res === null || res === void 0 ? void 0 : res.CheckoutRequestId,
                merchantRequestId: (_d = (_c = res === null || res === void 0 ? void 0 : res.MerchantRequestID) !== null && _c !== void 0 ? _c : res === null || res === void 0 ? void 0 : res.merchantRequestID) !== null && _d !== void 0 ? _d : res === null || res === void 0 ? void 0 : res.MerchantRequestId,
            };
            const createDto = {
                provider: 'mpesa',
                providerTransactionId: undefined,
                amount: String(amount),
                status: 'pending',
                raw: { initiated: res },
                providerMetadata,
                referenceId,
                userId,
                merchantId,
            };
            const payment = await this.paymentsService.create(createDto);
            this.logger.log(`Payment initiated: ${payment === null || payment === void 0 ? void 0 : payment.id} for reference: ${referenceId}`);
            return { message: 'Payment initiated', data: res, paymentId: payment === null || payment === void 0 ? void 0 : payment.id };
        }
        catch (err) {
            this.logger.error('Failed to initiate mpesa push', (_e = err === null || err === void 0 ? void 0 : err.message) !== null && _e !== void 0 ? _e : err);
            const status = (err === null || err === void 0 ? void 0 : err.status) || common_1.HttpStatus.BAD_GATEWAY;
            const body = (_f = err === null || err === void 0 ? void 0 : err.body) !== null && _f !== void 0 ? _f : { message: (_g = err === null || err === void 0 ? void 0 : err.message) !== null && _g !== void 0 ? _g : 'initiation_failed' };
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
    async createStripePaymentIntent(body) {
        var _a;
        const { amount, currency, metadata } = body || {};
        if (!amount)
            throw new common_1.BadRequestException('amount is required');
        const res = await ((_a = this.stripeService) === null || _a === void 0 ? void 0 : _a.createPaymentIntent(amount, currency !== null && currency !== void 0 ? currency : 'usd', metadata));
        await this.paymentsService.recordPaymentFromProvider('stripe', { id: res === null || res === void 0 ? void 0 : res.id, amount, status: 'pending', raw: res });
        return res;
    }
    async stripeWebhook(payload, sig) {
        var _a;
        this.logger.debug('Stripe webhook', { payload });
        const verified = (_a = this.stripeService) === null || _a === void 0 ? void 0 : _a.verifySignature(JSON.stringify(payload), sig);
        if (!verified)
            return { success: false };
        const recorded = await this.paymentsService.recordPaymentFromProvider('stripe', payload);
        return { success: true, recordedId: recorded === null || recorded === void 0 ? void 0 : recorded.id };
    }
    async createPaypalOrder(body) {
        var _a;
        const { amount, returnUrl, cancelUrl } = body || {};
        if (!amount)
            throw new common_1.BadRequestException('amount is required');
        const res = await ((_a = this.paypalService) === null || _a === void 0 ? void 0 : _a.createOrder(amount, returnUrl, cancelUrl));
        await this.paymentsService.recordPaymentFromProvider('paypal', { id: res === null || res === void 0 ? void 0 : res.id, amount, status: 'CREATED', raw: res });
        return res;
    }
    async paypalWebhook(payload) {
        this.logger.debug('PayPal webhook', { payload });
        const recorded = await this.paymentsService.recordPaymentFromProvider('paypal', payload);
        return { success: true, recordedId: recorded === null || recorded === void 0 ? void 0 : recorded.id };
    }
    async get(id) {
        return this.paymentsService.findById(id);
    }
    async query(merchantId, status, provider, userId, start, end, pageStr, limitStr) {
        const page = pageStr ? Number(pageStr) || 1 : 1;
        const limit = limitStr ? Number(limitStr) || 25 : 25;
        return this.paymentsService.queryPayments({ merchantId, status, provider, userId, start, end, page, limit });
    }
    async recordCashPayment(body) {
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
    async statsSummary(hotelId) {
        return this.paymentsService.summaryCounts(hotelId);
    }
    async statsByProvider() {
        return this.paymentsService.byProviderStats();
    }
    async statsRevenue(interval, start, end) {
        const finalInterval = interval || 'daily';
        return this.paymentsService.revenueByInterval(finalInterval, start, end);
    }
    async transactionsByDay(date) {
        return this.paymentsService.transactionCountsForDate(date);
    }
};
exports.PaymentsController = PaymentsController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({
        summary: 'Create a payment record (internal use)',
        description: 'Create a payment record in the system. This is typically used internally by provider-specific endpoints. For normal payment flows, use the provider-specific endpoints like /payments/mpesa/initiate.'
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
            }
        }
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid payment data' }),
    (0, swagger_1.ApiResponse)({ status: 500, description: 'Internal server error' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_payment_dto_1.CreatePaymentDto]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('mpesa/initiate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Initiate M-Pesa STK Push payment',
        description: 'Initiates an M-Pesa STK Push prompt on the customer\'s phone. The customer will receive a popup to enter their M-Pesa PIN to confirm payment. Payment status updates are received via the callback URL.'
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            example: {
                phone: '+254712345678',
                amount: '1000',
                stkCallback: 'https://yourapi.com/payments/mpesa/callback',
                accountReference: 'ACCT-001',
                referenceId: 'ORDER-123',
                userId: '550e8400-e29b-41d4-a716-446655440000',
                merchantId: 'MERCHANT-001',
                transactionDesc: 'Payment for order #123'
            }
        },
        description: 'M-Pesa STK Push request payload'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'STK Push initiated successfully',
        schema: {
            example: {
                message: 'Payment initiated',
                data: {
                    CheckoutRequestID: 'ws_CO_123456789',
                    MerchantRequestID: 'mr_123456789',
                    ResponseCode: '0',
                    ResponseDescription: 'Success. Request accepted for processing',
                },
                paymentId: '550e8400-e29b-41d4-a716-446655440000'
            }
        }
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Missing required fields (phone, amount, stkCallback)' }),
    (0, swagger_1.ApiResponse)({ status: 502, description: 'M-Pesa API error or connection failure' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "initiateMpesa", null);
__decorate([
    (0, common_1.Post)('mpesa/callback'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'M-Pesa callback endpoint (provider webhook)',
        description: 'Webhook endpoint called by M-Pesa (Safaricom) when the customer completes or cancels the STK Push prompt. Always returns 200 OK to acknowledge receipt. Transaction status is updated based on the callback result code.'
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            example: {
                Body: {
                    stkCallback: {
                        MerchantRequestID: 'mr_123456789',
                        CheckoutRequestID: 'ws_CO_123456789',
                        ResultCode: 0,
                        ResultDesc: 'The service request has been processed successfully.',
                        CallbackMetadata: {
                            Item: [
                                { Name: 'Amount', Value: 1000 },
                                { Name: 'MpesaReceiptNumber', Value: 'MJR1234567890' },
                                { Name: 'TransactionDate', Value: 20231215120000 },
                                { Name: 'PhoneNumber', Value: 254712345678 },
                            ]
                        }
                    }
                }
            }
        },
        description: 'M-Pesa callback payload from Safaricom'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Callback processed and acknowledged',
        schema: {
            example: {
                ResultCode: 0,
                ResultDesc: 'Callback received successfully',
                recordedId: '550e8400-e29b-41d4-a716-446655440000'
            }
        }
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "mpesaCallback", null);
__decorate([
    (0, common_1.Post)('stripe/create-payment-intent'),
    (0, swagger_1.ApiOperation)({
        summary: 'Create a Stripe PaymentIntent',
        description: 'Creates a Stripe PaymentIntent and returns a client_secret for use on the frontend with Stripe.js. Also records a pending payment record for reconciliation.'
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            example: {
                amount: '1000',
                currency: 'usd',
                metadata: { orderId: '550e8400-e29b-41d4-a716-446655440000', customerName: 'John Doe' }
            }
        },
        description: 'Stripe PaymentIntent creation request'
    }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: 'PaymentIntent created successfully',
        schema: {
            example: {
                id: 'pi_1Abcd1234567890',
                client_secret: 'pi_1Abcd1234567890_secret_xyz123',
                amount: 1000,
                currency: 'usd',
                status: 'requires_payment_method'
            }
        }
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Missing amount parameter' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "createStripePaymentIntent", null);
__decorate([
    (0, common_1.Post)('stripe/webhook'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Stripe webhook endpoint',
        description: 'Webhook endpoint called by Stripe for payment events (payment_intent.succeeded, payment_intent.payment_failed, charge.refunded, etc.). Verifies webhook signature and updates payment status.'
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            example: {
                id: 'evt_1234567890',
                type: 'payment_intent.succeeded',
                data: {
                    object: {
                        id: 'pi_1234567890',
                        amount: 1000,
                        currency: 'usd',
                        status: 'succeeded'
                    }
                }
            }
        },
        description: 'Stripe webhook event payload'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'sig',
        required: false,
        description: 'Stripe signature from x-stripe-signature header'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Webhook processed successfully',
        schema: {
            example: {
                success: true,
                recordedId: '550e8400-e29b-41d4-a716-446655440000'
            }
        }
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Query)('sig')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "stripeWebhook", null);
__decorate([
    (0, common_1.Post)('paypal/create-order'),
    (0, swagger_1.ApiOperation)({
        summary: 'Create a PayPal Order',
        description: 'Creates a PayPal Order and returns the approval URL for customer redirect. Also records a pending payment record for reconciliation.'
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            example: {
                amount: '10.00',
                returnUrl: 'https://yourapp.com/success',
                cancelUrl: 'https://yourapp.com/cancel'
            }
        },
        description: 'PayPal order creation request'
    }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: 'PayPal Order created successfully',
        schema: {
            example: {
                id: 'PAYID-123456789',
                status: 'CREATED',
                links: [
                    {
                        rel: 'approval_url',
                        href: 'https://www.paypal.com/cgi-bin/webscr?cmd=_express-checkout&token=PAYID-123456789'
                    }
                ]
            }
        }
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Missing amount parameter' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "createPaypalOrder", null);
__decorate([
    (0, common_1.Post)('paypal/webhook'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'PayPal webhook endpoint',
        description: 'Webhook endpoint called by PayPal for payment events (PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.REFUNDED, etc.). Updates payment status based on event type.'
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            example: {
                id: 'WH-123456789',
                event_type: 'PAYMENT.CAPTURE.COMPLETED',
                resource: {
                    id: 'PAYID-123456789',
                    amount: {
                        currency_code: 'USD',
                        value: '10.00'
                    },
                    status: 'COMPLETED'
                }
            }
        },
        description: 'PayPal webhook event payload'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Webhook processed successfully',
        schema: {
            example: {
                success: true,
                recordedId: '550e8400-e29b-41d4-a716-446655440000'
            }
        }
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "paypalWebhook", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiParam)({
        name: 'id',
        type: 'string',
        format: 'uuid',
        description: 'Payment record UUID'
    }),
    (0, swagger_1.ApiOperation)({
        summary: 'Get payment by ID',
        description: 'Retrieve a specific payment record by its unique identifier. Returns the full payment object including provider details and metadata.'
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
            }
        }
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
        description: 'Query and filter payments with advanced filtering, pagination, and date range support. Requires manager or admin role. Results can be filtered by merchant, provider, status, user, and date range.'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'merchantId',
        required: false,
        description: 'Filter by merchant identifier'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'status',
        required: false,
        enum: ['pending', 'completed', 'failed', 'cancelled'],
        description: 'Filter by payment status'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'provider',
        required: false,
        enum: ['mpesa', 'stripe', 'paypal', 'cash'],
        description: 'Filter by payment provider'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'userId',
        required: false,
        format: 'uuid',
        description: 'Filter by user who initiated the payment'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'start',
        required: false,
        type: 'string',
        format: 'date-time',
        description: 'Start date for date range filter (ISO 8601 format)'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'end',
        required: false,
        type: 'string',
        format: 'date-time',
        description: 'End date for date range filter (ISO 8601 format)'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'page',
        required: false,
        type: 'number',
        description: 'Page number for pagination (default: 1)'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'limit',
        required: false,
        type: 'number',
        description: 'Number of records per page (default: 25, max: 100)'
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
                    }
                ],
                total: 150,
                page: 1,
                limit: 25,
            }
        }
    }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized - no JWT token provided' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Forbidden - insufficient role permissions' }),
    __param(0, (0, common_1.Query)('merchantId')),
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
    (0, swagger_1.ApiOperation)({
        summary: 'Record a cash payment (admin only)',
        description: 'Record a manual cash or bank transfer payment. Only administrators can record cash payments. The payment is immediately marked as completed. Useful for recording payments made through alternative channels not processed by the system.'
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            example: {
                referenceId: 'ORDER-123',
                amount: '1000',
                userId: '550e8400-e29b-41d4-a716-446655440000',
                merchantId: 'MERCHANT-001',
                note: 'Received cash payment at reception'
            }
        },
        description: 'Cash payment recording request'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Cash payment recorded successfully',
        schema: {
            example: {
                success: true,
                paymentId: '550e8400-e29b-41d4-a716-446655440000'
            }
        }
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Missing referenceId or amount' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized - no JWT token' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Forbidden - admin role required' }),
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
    (0, swagger_1.ApiOperation)({
        summary: 'Get payments summary statistics (admin/manager only)',
        description: 'Retrieve payment statistics including total transaction count, breakdown by status, and total revenue. Can optionally be scoped to a specific hotel/merchant.'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'hotelId',
        required: false,
        description: 'Optional merchant/hotel ID to scope results (if omitted, returns all payments)'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Payment statistics summary retrieved',
        schema: {
            example: {
                total: 1250,
                pending: 45,
                completed: 1200,
                failed: 5,
                revenueCents: 1250000,
                revenueFormatted: 'KES 12,500.00'
            }
        }
    }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Forbidden - manager/admin role required' }),
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
    (0, swagger_1.ApiOperation)({
        summary: 'Get aggregated payment statistics by provider',
        description: 'Returns payment count and revenue breakdown by provider (M-Pesa, Stripe, PayPal, Cash). Useful for understanding provider distribution and performance.'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Payment statistics by provider',
        schema: {
            example: {
                mpesa: { count: 800, revenue: 800000, status: { pending: 10, completed: 785, failed: 5 } },
                stripe: { count: 300, revenue: 300000, status: { pending: 5, completed: 295, failed: 0 } },
                paypal: { count: 100, revenue: 100000, status: { pending: 2, completed: 98, failed: 0 } },
                cash: { count: 50, revenue: 50000, status: { completed: 50 } },
            }
        }
    }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Forbidden - manager/admin role required' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "statsByProvider", null);
__decorate([
    (0, common_1.Get)('stats/revenue'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('manager', 'admin'),
    (0, swagger_1.ApiBearerAuth)('jwt'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get revenue series by interval',
        description: 'Returns revenue data points grouped by time interval (daily, weekly, or monthly). Useful for generating revenue charts and trends. Can be filtered by date range.'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'interval',
        required: false,
        enum: ['daily', 'weekly', 'monthly'],
        description: 'Time interval for aggregation (default: daily)'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'start',
        required: false,
        type: 'string',
        format: 'date-time',
        description: 'Start date for range (ISO 8601)'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'end',
        required: false,
        type: 'string',
        format: 'date-time',
        description: 'End date for range (ISO 8601)'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Revenue series data',
        schema: {
            example: [
                { date: '2025-12-18', revenue: 150000, transactionCount: 25 },
                { date: '2025-12-17', revenue: 145000, transactionCount: 23 },
                { date: '2025-12-16', revenue: 160000, transactionCount: 28 },
            ]
        }
    }),
    __param(0, (0, common_1.Query)('interval')),
    __param(1, (0, common_1.Query)('start')),
    __param(2, (0, common_1.Query)('end')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "statsRevenue", null);
__decorate([
    (0, common_1.Get)('stats/transactions-by-day'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('manager', 'admin'),
    (0, swagger_1.ApiBearerAuth)('jwt'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get transaction counts for a specific day',
        description: 'Returns hourly breakdown of transaction counts and revenue for a given date. Useful for traffic analysis and peak time identification.'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'date',
        required: false,
        type: 'string',
        format: 'date',
        description: 'Date to query transactions for (YYYY-MM-DD format, defaults to today)'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Transaction counts by hour for the day',
        schema: {
            example: {
                date: '2025-12-18',
                totalTransactions: 125,
                totalRevenue: 125000,
                hourly: [
                    { hour: 0, count: 2, revenue: 5000 },
                    { hour: 9, count: 12, revenue: 15000 },
                    { hour: 10, count: 18, revenue: 22000 },
                ]
            }
        }
    }),
    __param(0, (0, common_1.Query)('date')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "transactionsByDay", null);
exports.PaymentsController = PaymentsController = PaymentsController_1 = __decorate([
    (0, swagger_1.ApiTags)('Payments'),
    (0, common_1.Controller)('payments'),
    __metadata("design:paramtypes", [payments_service_1.PaymentsService,
        mpesa_service_1.MpesaService,
        stripe_service_1.StripeService,
        paypal_service_1.PaypalService])
], PaymentsController);
//# sourceMappingURL=payments.controller.js.map