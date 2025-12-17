import { Model, Table, Column, DataType, CreatedAt, UpdatedAt } from 'sequelize-typescript';

@Table({ tableName: 'payments' })
export class Payment extends Model<Payment> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare provider: string; // e.g. 'mpesa', 'stripe', 'cash'

  @Column({ type: DataType.STRING })
  declare providerTransactionId?: string; // external transaction id from provider

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  declare amount: string;

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'pending' })
  declare status: string; // pending | completed | failed | cancelled

  @Column({ type: DataType.STRING })
  declare paymentMethod?: string; // STK_PUSH, QR_CODE, CARD, CASH, etc.

  @Column({ type: DataType.JSONB })
  declare raw: any; // raw payload from provider

  @Column({ type: DataType.STRING, allowNull: true })
  declare initiatedCheckoutRequestId?: string;

  @Column({ type: DataType.STRING, allowNull: true })
  declare initiatedMerchantRequestId?: string;

  @Column({ type: DataType.UUID, allowNull: true })
  declare orderId?: string;

  @Column({ type: DataType.UUID, allowNull: true })
  declare userId?: string;

  @Column({ type: DataType.UUID, allowNull: true })
  declare hotelId?: string;

  @Column({ type: DataType.STRING })
  declare transactionDescription?: string; // user-friendly description of transaction

  @Column({ type: DataType.TEXT })
  declare notes?: string; // admin notes or internal comments

  @Column({ type: DataType.STRING })
  declare customerPhone?: string; // customer phone for SMS/callback

  @Column({ type: DataType.STRING })
  declare customerEmail?: string; // customer email for receipt

  @Column({ type: DataType.DATE })
  declare completedAt?: Date; // timestamp when payment completed

  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  declare retryCount?: number; // number of retry attempts

  @Column({ type: DataType.DATE })
  declare nextRetryAt?: Date; // when to retry next (for failed payments)

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}

