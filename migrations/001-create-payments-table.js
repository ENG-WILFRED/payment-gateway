'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Create payments table with all fields
    await queryInterface.createTable('payments', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
      },
      provider: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      providerTransactionId: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'pending',
      },
      raw: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      providerMetadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      referenceId: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      merchantId: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      transactionDescription: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      customerPhone: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      customerEmail: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      completedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      retryCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      nextRetryAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('now'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('now'),
      },
    });

    // Add indexes for common queries
    await queryInterface.addIndex('payments', ['merchantId']);
    await queryInterface.addIndex('payments', ['referenceId']);
    await queryInterface.addIndex('payments', ['provider', 'status']);
    await queryInterface.addIndex('payments', ['createdAt']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('payments');
  },
};
