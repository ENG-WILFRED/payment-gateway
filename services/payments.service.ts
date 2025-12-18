import { Injectable, Logger } from '@nestjs/common';
import { Op } from 'sequelize';
import { InjectModel } from '@nestjs/sequelize';
import { Payment } from '../entities/payment.entity';
import { CreatePaymentDto } from '../dto/create-payment.dto';
// Avoid static import of Order to prevent pulling sibling package files into tsc; require dynamically when needed.

// NOTE: We intentionally import Order in case we want to validate order existence when matching callbacks.

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(@InjectModel(Payment) private paymentModel: typeof Payment) {}

  async create(createDto: CreatePaymentDto) {
    this.logger.debug('Creating payment', createDto);
    const payload: Partial<Payment> = {
      provider: createDto.provider,
      providerTransactionId: createDto.providerTransactionId,
      amount: createDto.amount,
      status: createDto.status ?? 'pending',
      raw: createDto.raw ?? {},
      providerMetadata: createDto.providerMetadata,
      referenceId: createDto.referenceId,
      userId: createDto.userId,
      merchantId: createDto.merchantId,
    };

    const p = await this.paymentModel.create(payload as any);

    return p;
  }

  async findById(id: string) {
    return this.paymentModel.findByPk(id);
  }

  /**
   * Query payments with filters and pagination.
   */
  async queryPayments(opts: {
    merchantId?: string;
    status?: string;
    provider?: string;
    userId?: string;
    start?: string; // ISO date
    end?: string; // ISO date
    page?: number;
    limit?: number;
  }) {
    const { merchantId, status, provider, userId, start, end, page = 1, limit = 25 } = opts || ({} as any);
    const where: any = {};
    if (merchantId) where.merchantId = merchantId;
    if (status) where.status = status;
    if (provider) where.provider = provider;
    if (userId) where.userId = userId;
    if (start || end) {
      where.createdAt = {} as any;
      if (start) where.createdAt[Op.gte] = new Date(start);
      if (end) where.createdAt[Op.lte] = new Date(end);
    }

    const offset = Math.max(0, page - 1) * limit;
    const result = await this.paymentModel.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    } as any);

    return {
      total: result.count,
      page,
      limit,
      data: result.rows,
    };
  }

  // Summary counts and totals
  async summaryCounts(merchantId?: string) {
    const wherePending: any = { status: 'pending' };
    const whereCompleted: any = { status: 'completed' };
    const whereFailed: any = { status: 'failed' };
    if (merchantId) {
      wherePending.merchantId = merchantId;
      whereCompleted.merchantId = merchantId;
      whereFailed.merchantId = merchantId;
    }

    const totalPending = await this.paymentModel.count({ where: wherePending } as any);
    const totalCompleted = await this.paymentModel.count({ where: whereCompleted } as any);
    const totalFailed = await this.paymentModel.count({ where: whereFailed } as any);

    // total revenue (sum of amounts for completed) scoped to merchant if provided
    const sequelize = (this.paymentModel as any).sequelize;
    let sql = `SELECT COALESCE(SUM(CAST(amount AS numeric)),0)::text AS total_revenue FROM payments WHERE status = 'completed'`;
    const binds: any[] = [];
    if (merchantId) {
      binds.push(merchantId);
      sql += ` AND "merchantId" = $${binds.length}`;
    }
    const [[{ total_revenue }]] = await sequelize.query(sql, { bind: binds });
    return { totalPending, totalCompleted, totalFailed, totalRevenue: total_revenue };
  }

  // Counts and totals grouped by provider (mode)
  async byProviderStats() {
    const sequelize = (this.paymentModel as any).sequelize;
    const [rows] = await sequelize.query(
      `SELECT provider, COUNT(*)::int AS count, COALESCE(SUM(CAST(amount AS numeric)),0)::text AS total_amount FROM payments GROUP BY provider ORDER BY count DESC`
    );
    return rows;
  }

  /**
   * revenueByInterval('daily'|'weekly'|'monthly', start?, end?)
   * returns rows: { period, revenue }
   */
  async revenueByInterval(interval: 'daily' | 'weekly' | 'monthly', start?: string, end?: string) {
    const sequelize = (this.paymentModel as any).sequelize;
    let trunc = 'day';
    if (interval === 'weekly') trunc = 'week';
    if (interval === 'monthly') trunc = 'month';

    const params: any[] = [];
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

  /**
   * transactionCountsForDate(date?: 'YYYY-MM-DD')
   * returns { total, success, pending }
   */
  async transactionCountsForDate(date?: string) {
    const sequelize = (this.paymentModel as any).sequelize;
    // compute start and end as YYYY-MM-DD boundaries; if no date provided use today UTC
    const day = date || new Date().toISOString().slice(0, 10);
    const start = `${day}T00:00:00.000Z`;
    const end = `${day}T23:59:59.999Z`;
    const sql = `SELECT COUNT(*)::int AS total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END)::int AS success, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END)::int AS pending FROM payments WHERE "createdAt" >= $1 AND "createdAt" <= $2`;
    const [[row]] = await sequelize.query(sql, { bind: [start, end] });
    return row || { total: 0, success: 0, pending: 0 };
  }

  /**
   * Record a payment from an M-Pesa callback payload.
   * This is the canonical place to create the definitive payment record.
   */
  async recordPaymentFromCallback(payload: any) {
    this.logger.debug('Recording payment from callback', { payload });

    const callback = payload?.Body?.stkCallback;
    if (!callback) {
      this.logger.warn('No stkCallback found in payload');
      return null;
    }

    const items = Array.isArray(callback?.CallbackMetadata?.Item) ? callback.CallbackMetadata.Item : [];
    const findByName = (name: string) => items.find((i: any) => i?.Name === name)?.Value;

    const amount = findByName('Amount') ?? null;
    const receipt = findByName('MpesaReceiptNumber') ?? null;
    const phone = findByName('PhoneNumber') ?? null;
    const checkoutRequestId = callback?.CheckoutRequestID ?? null;
    const resultCode = Number(callback?.ResultCode ?? -1);
    const status = resultCode === 0 ? 'completed' : 'failed';

    // First, try a fast DB lookup by the stored initiatedCheckoutRequestId column
    let saved: any = null;
    let match = null as any;
    if (checkoutRequestId) {
      match = await this.paymentModel.findOne({ where: { provider: 'mpesa', status: 'pending', initiatedCheckoutRequestId: checkoutRequestId } as any });
    }

    if (match) {
      // update existing pending
      match.providerTransactionId = receipt ?? checkoutRequestId;
      match.amount = amount != null ? String(amount) : match.amount || String(0);
      match.status = status;
      match.raw = { ...match.raw, callback: payload };
      saved = await match.save();
      this.logger.log('Updated pending payment from callback', { id: saved?.id, status });
    } else {
      // fallback: try to find a pending payment by scanning raw.initiated.CheckoutRequestID
      const pendingList = await this.paymentModel.findAll({ where: { provider: 'mpesa', status: 'pending' } });
      const rawMatch = pendingList.find((p: any) => {
        try {
          const init = p.raw?.initiated;
          return init && (init.CheckoutRequestID === checkoutRequestId || String(init.CheckoutRequestID) === String(checkoutRequestId));
        } catch (e) {
          return false;
        }
      });

      if (rawMatch) {
        rawMatch.providerTransactionId = receipt ?? checkoutRequestId;
        rawMatch.amount = amount != null ? String(amount) : rawMatch.amount || String(0);
        rawMatch.status = status;
        rawMatch.raw = { ...rawMatch.raw, callback: payload };
        saved = await rawMatch.save();
        this.logger.log('Updated pending payment from callback (raw match)', { id: saved?.id, status });
      } else {
        const createDto: CreatePaymentDto = {
          provider: 'mpesa',
          providerTransactionId: receipt ?? checkoutRequestId,
          amount: amount != null ? String(amount) : String(0),
          status,
          raw: payload,
        };
        saved = await this.paymentModel.create(createDto as any);
        this.logger.log('Created new payment from callback', { id: saved?.id, status });
      }
    }

    // Payment state updated successfully
    return saved;
  }

  /**
   * Generic provider callback recorder. Creates or updates a payment record
   * based on incoming provider webhook/payload. Keeps behavior simple so
   * provider-specific services can call this after verifying payloads.
   */
  async recordPaymentFromProvider(provider: string, payload: any) {
    this.logger.debug('Recording payment from provider', { provider, payload });
    try {
      const createDto: CreatePaymentDto = {
        provider,
        providerTransactionId: payload?.id ?? payload?.transactionId ?? payload?.resource?.id ?? undefined,
        amount: payload?.amount ?? payload?.value ?? payload?.resource?.amount?.value ?? String(payload?.amount ?? '0'),
        status: payload?.status ?? (payload?.resource?.status ?? 'pending'),
        raw: payload,
      };

      const p = await this.create(createDto);
      return p;
    } catch (e) {
      this.logger.error('Failed to record generic provider payment', e as any);
      throw e;
    }
  }
}
