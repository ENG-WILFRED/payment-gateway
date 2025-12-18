import { Model, Table, Column, DataType, CreatedAt, UpdatedAt } from 'sequelize-typescript';

@Table({ tableName: 'payments' })
export class Payment extends Model<Payment> {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare provider: string; // payment provider identifier (e.g., 'mpesa', 'stripe', 'paypal', 'cash')

  @Column({ type: DataType.STRING })
  declare providerTransactionId?: string; // transaction id or order id assigned by provider

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  declare amount: string; // transaction amount

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'pending' })
  declare status: string; // normalized status: pending | completed | failed | cancelled

  @Column({ type: DataType.JSONB })
  declare raw?: any; // raw provider response/payload for audit and reconciliation

  @Column({ type: DataType.JSONB })
  declare providerMetadata?: any; // provider-specific tracking fields (e.g., checkoutId, requestId, etc.)

  @Column({ type: DataType.STRING, allowNull: true })
  declare referenceId?: string; // merchant's internal reference id (e.g., order id, invoice id, session id)

  @Column({ type: DataType.STRING, allowNull: true })
  declare merchantId?: string; // merchant identifier (for multi-tenant platforms)

  @Column({ type: DataType.UUID, allowNull: true })
  declare userId?: string; // user who initiated the payment transaction

  @Column({ type: DataType.STRING })
  declare transactionDescription?: string; // human-readable transaction description

  @Column({ type: DataType.TEXT })
  declare notes?: string; // internal notes or reconciliation details

  @Column({ type: DataType.STRING })
  declare customerPhone?: string; // customer contact phone

  @Column({ type: DataType.STRING })
  declare customerEmail?: string; // customer contact email

  @Column({ type: DataType.DATE })
  declare completedAt?: Date; // timestamp when payment transitioned to completed state

  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  declare retryCount?: number; // number of failed attempts before success

  @Column({ type: DataType.DATE })
  declare nextRetryAt?: Date; // scheduled time for next retry attempt (if applicable)

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}

