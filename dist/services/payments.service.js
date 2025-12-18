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
var PaymentsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsService = void 0;
const common_1 = require("@nestjs/common");
const sequelize_1 = require("sequelize");
const sequelize_2 = require("@nestjs/sequelize");
const payment_entity_1 = require("../entities/payment.entity");
let PaymentsService = PaymentsService_1 = class PaymentsService {
    constructor(paymentModel) {
        this.paymentModel = paymentModel;
        this.logger = new common_1.Logger(PaymentsService_1.name);
    }
    async create(createDto) {
        var _a, _b;
        this.logger.debug('Creating payment', createDto);
        const payload = {
            provider: createDto.provider,
            providerTransactionId: createDto.providerTransactionId,
            amount: createDto.amount,
            status: (_a = createDto.status) !== null && _a !== void 0 ? _a : 'pending',
            raw: (_b = createDto.raw) !== null && _b !== void 0 ? _b : {},
            providerMetadata: createDto.providerMetadata,
            referenceId: createDto.referenceId,
            userId: createDto.userId,
            merchantId: createDto.merchantId,
        };
        const p = await this.paymentModel.create(payload);
        return p;
    }
    async findById(id) {
        return this.paymentModel.findByPk(id);
    }
    async queryPayments(opts) {
        const { merchantId, status, provider, userId, start, end, page = 1, limit = 25 } = opts || {};
        const where = {};
        if (merchantId)
            where.merchantId = merchantId;
        if (status)
            where.status = status;
        if (provider)
            where.provider = provider;
        if (userId)
            where.userId = userId;
        if (start || end) {
            where.createdAt = {};
            if (start)
                where.createdAt[sequelize_1.Op.gte] = new Date(start);
            if (end)
                where.createdAt[sequelize_1.Op.lte] = new Date(end);
        }
        const offset = Math.max(0, page - 1) * limit;
        const result = await this.paymentModel.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            limit,
            offset,
        });
        return {
            total: result.count,
            page,
            limit,
            data: result.rows,
        };
    }
    async summaryCounts(merchantId) {
        const wherePending = { status: 'pending' };
        const whereCompleted = { status: 'completed' };
        const whereFailed = { status: 'failed' };
        if (merchantId) {
            wherePending.merchantId = merchantId;
            whereCompleted.merchantId = merchantId;
            whereFailed.merchantId = merchantId;
        }
        const totalPending = await this.paymentModel.count({ where: wherePending });
        const totalCompleted = await this.paymentModel.count({ where: whereCompleted });
        const totalFailed = await this.paymentModel.count({ where: whereFailed });
        const sequelize = this.paymentModel.sequelize;
        let sql = `SELECT COALESCE(SUM(CAST(amount AS numeric)),0)::text AS total_revenue FROM payments WHERE status = 'completed'`;
        const binds = [];
        if (merchantId) {
            binds.push(merchantId);
            sql += ` AND "merchantId" = $${binds.length}`;
        }
        const [[{ total_revenue }]] = await sequelize.query(sql, { bind: binds });
        return { totalPending, totalCompleted, totalFailed, totalRevenue: total_revenue };
    }
    async byProviderStats() {
        const sequelize = this.paymentModel.sequelize;
        const [rows] = await sequelize.query(`SELECT provider, COUNT(*)::int AS count, COALESCE(SUM(CAST(amount AS numeric)),0)::text AS total_amount FROM payments GROUP BY provider ORDER BY count DESC`);
        return rows;
    }
    async revenueByInterval(interval, start, end) {
        const sequelize = this.paymentModel.sequelize;
        let trunc = 'day';
        if (interval === 'weekly')
            trunc = 'week';
        if (interval === 'monthly')
            trunc = 'month';
        const params = [];
        let where = `WHERE status = 'completed'`;
        if (start) {
            params.push(start);
            where += ` AND createdAt >= $${params.length}`;
        }
        if (end) {
            params.push(end);
            where += ` AND createdAt <= $${params.length}`;
        }
        const sql = `SELECT to_char(date_trunc('${trunc}', "createdAt"), 'YYYY-MM-DD') AS period, COALESCE(SUM(CAST(amount AS numeric)),0)::text AS revenue FROM payments ${where} GROUP BY period ORDER BY period ASC`;
        const [rows] = await sequelize.query(sql, { bind: params });
        return rows;
    }
    async transactionCountsForDate(date) {
        const sequelize = this.paymentModel.sequelize;
        const day = date || new Date().toISOString().slice(0, 10);
        const start = `${day}T00:00:00.000Z`;
        const end = `${day}T23:59:59.999Z`;
        const sql = `SELECT COUNT(*)::int AS total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END)::int AS success, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END)::int AS pending FROM payments WHERE "createdAt" >= $1 AND "createdAt" <= $2`;
        const [[row]] = await sequelize.query(sql, { bind: [start, end] });
        return row || { total: 0, success: 0, pending: 0 };
    }
    async recordPaymentFromCallback(payload) {
        var _a, _b, _c, _d, _e, _f, _g;
        this.logger.debug('Recording payment from callback', { payload });
        const callback = (_a = payload === null || payload === void 0 ? void 0 : payload.Body) === null || _a === void 0 ? void 0 : _a.stkCallback;
        if (!callback) {
            this.logger.warn('No stkCallback found in payload');
            return null;
        }
        const items = Array.isArray((_b = callback === null || callback === void 0 ? void 0 : callback.CallbackMetadata) === null || _b === void 0 ? void 0 : _b.Item) ? callback.CallbackMetadata.Item : [];
        const findByName = (name) => { var _a; return (_a = items.find((i) => (i === null || i === void 0 ? void 0 : i.Name) === name)) === null || _a === void 0 ? void 0 : _a.Value; };
        const amount = (_c = findByName('Amount')) !== null && _c !== void 0 ? _c : null;
        const receipt = (_d = findByName('MpesaReceiptNumber')) !== null && _d !== void 0 ? _d : null;
        const phone = (_e = findByName('PhoneNumber')) !== null && _e !== void 0 ? _e : null;
        const checkoutRequestId = (_f = callback === null || callback === void 0 ? void 0 : callback.CheckoutRequestID) !== null && _f !== void 0 ? _f : null;
        const resultCode = Number((_g = callback === null || callback === void 0 ? void 0 : callback.ResultCode) !== null && _g !== void 0 ? _g : -1);
        const status = resultCode === 0 ? 'completed' : 'failed';
        let saved = null;
        let match = null;
        if (checkoutRequestId) {
            match = await this.paymentModel.findOne({ where: { provider: 'mpesa', status: 'pending', initiatedCheckoutRequestId: checkoutRequestId } });
        }
        if (match) {
            match.providerTransactionId = receipt !== null && receipt !== void 0 ? receipt : checkoutRequestId;
            match.amount = amount != null ? String(amount) : match.amount || String(0);
            match.status = status;
            match.raw = { ...match.raw, callback: payload };
            saved = await match.save();
            this.logger.log('Updated pending payment from callback', { id: saved === null || saved === void 0 ? void 0 : saved.id, status });
        }
        else {
            const pendingList = await this.paymentModel.findAll({ where: { provider: 'mpesa', status: 'pending' } });
            const rawMatch = pendingList.find((p) => {
                var _a;
                try {
                    const init = (_a = p.raw) === null || _a === void 0 ? void 0 : _a.initiated;
                    return init && (init.CheckoutRequestID === checkoutRequestId || String(init.CheckoutRequestID) === String(checkoutRequestId));
                }
                catch (e) {
                    return false;
                }
            });
            if (rawMatch) {
                rawMatch.providerTransactionId = receipt !== null && receipt !== void 0 ? receipt : checkoutRequestId;
                rawMatch.amount = amount != null ? String(amount) : rawMatch.amount || String(0);
                rawMatch.status = status;
                rawMatch.raw = { ...rawMatch.raw, callback: payload };
                saved = await rawMatch.save();
                this.logger.log('Updated pending payment from callback (raw match)', { id: saved === null || saved === void 0 ? void 0 : saved.id, status });
            }
            else {
                const createDto = {
                    provider: 'mpesa',
                    providerTransactionId: receipt !== null && receipt !== void 0 ? receipt : checkoutRequestId,
                    amount: amount != null ? String(amount) : String(0),
                    status,
                    raw: payload,
                };
                saved = await this.paymentModel.create(createDto);
                this.logger.log('Created new payment from callback', { id: saved === null || saved === void 0 ? void 0 : saved.id, status });
            }
        }
        return saved;
    }
    async recordPaymentFromProvider(provider, payload) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
        this.logger.debug('Recording payment from provider', { provider, payload });
        try {
            const createDto = {
                provider,
                providerTransactionId: (_d = (_b = (_a = payload === null || payload === void 0 ? void 0 : payload.id) !== null && _a !== void 0 ? _a : payload === null || payload === void 0 ? void 0 : payload.transactionId) !== null && _b !== void 0 ? _b : (_c = payload === null || payload === void 0 ? void 0 : payload.resource) === null || _c === void 0 ? void 0 : _c.id) !== null && _d !== void 0 ? _d : undefined,
                amount: (_j = (_f = (_e = payload === null || payload === void 0 ? void 0 : payload.amount) !== null && _e !== void 0 ? _e : payload === null || payload === void 0 ? void 0 : payload.value) !== null && _f !== void 0 ? _f : (_h = (_g = payload === null || payload === void 0 ? void 0 : payload.resource) === null || _g === void 0 ? void 0 : _g.amount) === null || _h === void 0 ? void 0 : _h.value) !== null && _j !== void 0 ? _j : String((_k = payload === null || payload === void 0 ? void 0 : payload.amount) !== null && _k !== void 0 ? _k : '0'),
                status: (_l = payload === null || payload === void 0 ? void 0 : payload.status) !== null && _l !== void 0 ? _l : ((_o = (_m = payload === null || payload === void 0 ? void 0 : payload.resource) === null || _m === void 0 ? void 0 : _m.status) !== null && _o !== void 0 ? _o : 'pending'),
                raw: payload,
            };
            const p = await this.create(createDto);
            return p;
        }
        catch (e) {
            this.logger.error('Failed to record generic provider payment', e);
            throw e;
        }
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = PaymentsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, sequelize_2.InjectModel)(payment_entity_1.Payment)),
    __metadata("design:paramtypes", [Object])
], PaymentsService);
//# sourceMappingURL=payments.service.js.map