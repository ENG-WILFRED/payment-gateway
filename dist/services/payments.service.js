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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsService = void 0;
const common_1 = require("@nestjs/common");
const sequelize_1 = require("@nestjs/sequelize");
const payment_entity_1 = require("../entities/payment.entity");
const payments_query_1 = require("./queries/payments.query");
const payments_handler_1 = require("./handlers/payments.handler");
let PaymentsService = class PaymentsService {
    constructor(paymentModel, queryService, handlerService) {
        this.paymentModel = paymentModel;
        this.queryService = queryService;
        this.handlerService = handlerService;
    }
    async create(createDto) {
        return this.handlerService.create(createDto);
    }
    async findById(id) {
        return this.queryService.findById(id);
    }
    async queryPayments(opts) {
        return this.queryService.queryPayments(opts);
    }
    async summaryCounts(merchantId) {
        return this.queryService.summaryCounts(merchantId);
    }
    async byProviderStats() {
        return this.queryService.byProviderStats();
    }
    async revenueByInterval(interval, start, end) {
        return this.queryService.revenueByInterval(interval, start, end);
    }
    async transactionCountsForDate(date) {
        return this.queryService.transactionCountsForDate(date);
    }
    async recordPaymentFromCallback(payload) {
        return this.handlerService.recordPaymentFromCallback(payload);
    }
    async recordPaymentFromProvider(provider, payload) {
        return this.handlerService.recordPaymentFromProvider(provider, payload);
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, sequelize_1.InjectModel)(payment_entity_1.Payment)),
    __metadata("design:paramtypes", [Object, payments_query_1.PaymentsQueryService,
        payments_handler_1.PaymentsHandlerService])
], PaymentsService);
//# sourceMappingURL=payments.service.js.map