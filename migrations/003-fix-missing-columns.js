'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'payments';
    
    // Check if columns exist, and add them if missing
    const desc = await queryInterface.describeTable(table).catch(() => null);
    
    if (desc) {
      // Add missing columns
      if (!desc.referenceId) {
        await queryInterface.addColumn(table, 'referenceId', {
          type: Sequelize.STRING,
          allowNull: true,
        });
      }
      
      if (!desc.merchantId) {
        await queryInterface.addColumn(table, 'merchantId', {
          type: Sequelize.STRING,
          allowNull: true,
        });
      }
      
      if (!desc.transactionDescription) {
        await queryInterface.addColumn(table, 'transactionDescription', {
          type: Sequelize.STRING,
          allowNull: true,
        });
      }
      
      if (!desc.notes) {
        await queryInterface.addColumn(table, 'notes', {
          type: Sequelize.TEXT,
          allowNull: true,
        });
      }
      
      if (!desc.customerPhone) {
        await queryInterface.addColumn(table, 'customerPhone', {
          type: Sequelize.STRING,
          allowNull: true,
        });
      }
      
      if (!desc.customerEmail) {
        await queryInterface.addColumn(table, 'customerEmail', {
          type: Sequelize.STRING,
          allowNull: true,
        });
      }
      
      if (!desc.completedAt) {
        await queryInterface.addColumn(table, 'completedAt', {
          type: Sequelize.DATE,
          allowNull: true,
        });
      }
      
      if (!desc.retryCount) {
        await queryInterface.addColumn(table, 'retryCount', {
          type: Sequelize.INTEGER,
          defaultValue: 0,
        });
      }
      
      if (!desc.nextRetryAt) {
        await queryInterface.addColumn(table, 'nextRetryAt', {
          type: Sequelize.DATE,
          allowNull: true,
        });
      }
      
      // Add indexes if they don't exist
      try {
        await queryInterface.addIndex(table, ['referenceId']);
      } catch (e) {
        // Index might already exist
      }
      
      try {
        await queryInterface.addIndex(table, ['merchantId']);
      } catch (e) {
        // Index might already exist
      }
    }
  },

  async down(queryInterface, Sequelize) {
    const table = 'payments';
    const desc = await queryInterface.describeTable(table).catch(() => null);
    
    if (desc) {
      if (desc.referenceId) await queryInterface.removeColumn(table, 'referenceId');
      if (desc.merchantId) await queryInterface.removeColumn(table, 'merchantId');
      if (desc.transactionDescription) await queryInterface.removeColumn(table, 'transactionDescription');
      if (desc.notes) await queryInterface.removeColumn(table, 'notes');
      if (desc.customerPhone) await queryInterface.removeColumn(table, 'customerPhone');
      if (desc.customerEmail) await queryInterface.removeColumn(table, 'customerEmail');
      if (desc.completedAt) await queryInterface.removeColumn(table, 'completedAt');
      if (desc.retryCount) await queryInterface.removeColumn(table, 'retryCount');
      if (desc.nextRetryAt) await queryInterface.removeColumn(table, 'nextRetryAt');
    }
  },
};
