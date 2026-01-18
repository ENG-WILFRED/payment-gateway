import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { PaymentsService } from '../services/payments.service';
import { RolesGuard } from '../auth/src/extra/roles.guard';
import { Roles } from '../auth/src/extra/roles.decorator';

/**
 * Payment Statistics Controller
 * Provides analytics and reporting endpoints
 */
@ApiTags('Payments - Statistics')
@Controller('payments/stats')
export class PaymentStatsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('summary')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin')
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Get payments summary statistics (admin/manager only)',
    description: 'Retrieve payment statistics including total transaction count, breakdown by status, and total revenue. Can optionally be scoped to a specific hotel/merchant.',
  })
  @ApiQuery({
    name: 'hotelId',
    required: false,
    description: 'Optional merchant/hotel ID to scope results (if omitted, returns all payments)',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment statistics summary retrieved',
    schema: {
      example: {
        total: 1250,
        pending: 45,
        completed: 1200,
        failed: 5,
        revenueCents: 1250000,
        revenueFormatted: 'KES 12,500.00',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - manager/admin role required' })
  async summary(@Query('hotelId') hotelId?: string) {
    return this.paymentsService.summaryCounts(hotelId);
  }

  @Get('by-provider')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin')
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Get aggregated payment statistics by provider',
    description: 'Returns payment count and revenue breakdown by provider (M-Pesa, Stripe, PayPal, Cash). Useful for understanding provider distribution and performance.',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment statistics by provider',
    schema: {
      example: {
        mpesa: { count: 800, revenue: 800000, status: { pending: 10, completed: 785, failed: 5 } },
        stripe: { count: 300, revenue: 300000, status: { pending: 5, completed: 295, failed: 0 } },
        paypal: { count: 100, revenue: 100000, status: { pending: 2, completed: 98, failed: 0 } },
        cash: { count: 50, revenue: 50000, status: { completed: 50 } },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - manager/admin role required' })
  async byProvider() {
    return this.paymentsService.byProviderStats();
  }

  @Get('revenue')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin')
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Get revenue series by interval',
    description: 'Returns revenue data points grouped by time interval (daily, weekly, or monthly). Useful for generating revenue charts and trends. Can be filtered by date range.',
  })
  @ApiQuery({
    name: 'interval',
    required: false,
    enum: ['daily', 'weekly', 'monthly'],
    description: 'Time interval for aggregation (default: daily)',
  })
  @ApiQuery({
    name: 'start',
    required: false,
    type: 'string',
    format: 'date-time',
    description: 'Start date for range (ISO 8601)',
  })
  @ApiQuery({
    name: 'end',
    required: false,
    type: 'string',
    format: 'date-time',
    description: 'End date for range (ISO 8601)',
  })
  @ApiResponse({
    status: 200,
    description: 'Revenue series data',
    schema: {
      example: [
        { date: '2025-12-18', revenue: 150000, transactionCount: 25 },
        { date: '2025-12-17', revenue: 145000, transactionCount: 23 },
        { date: '2025-12-16', revenue: 160000, transactionCount: 28 },
      ],
    },
  })
  async revenue(
    @Query('interval') interval?: 'daily' | 'weekly' | 'monthly',
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const finalInterval = (interval as 'daily' | 'weekly' | 'monthly') || 'daily';
    return this.paymentsService.revenueByInterval(finalInterval, start, end);
  }

  @Get('transactions-by-day')
  @UseGuards(RolesGuard)
  @Roles('manager', 'admin')
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Get transaction counts for a specific day',
    description: 'Returns hourly breakdown of transaction counts and revenue for a given date. Useful for traffic analysis and peak time identification.',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    type: 'string',
    format: 'date',
    description: 'Date to query transactions for (YYYY-MM-DD format, defaults to today)',
  })
  @ApiResponse({
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
        ],
      },
    },
  })
  async transactionsByDay(@Query('date') date?: string) {
    return this.paymentsService.transactionCountsForDate(date);
  }
}
