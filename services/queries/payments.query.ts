import { Injectable, Logger } from '@nestjs/common';
import { Op } from 'sequelize';
import { InjectModel } from '@nestjs/sequelize';
import { Payment } from '../../entities/payment.entity';

@Injectable()
export class PaymentsQueryService {
  private readonly logger = new Logger(PaymentsQueryService.name);

  constructor(@InjectModel(Payment) private paymentModel: typeof Payment) {}

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

  /**
   * Get summary counts and totals for payments.
   */
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

  /**
   * Get counts and totals grouped by provider.
   */
  async byProviderStats() {
    const sequelize = (this.paymentModel as any).sequelize;
    const [rows] = await sequelize.query(
      `SELECT provider, COUNT(*)::int AS count, COALESCE(SUM(CAST(amount AS numeric)),0)::text AS total_amount FROM payments GROUP BY provider ORDER BY count DESC`
    );
    return rows;
  }

  /**
   * Get revenue by interval ('daily'|'weekly'|'monthly').
   * Returns rows: { period, revenue }
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
   * Get transaction counts for a specific date.
   * Returns { total, success, pending }
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
   * Find payment by ID.
   */
  async findById(id: string) {
    return this.paymentModel.findByPk(id);
  }
}
