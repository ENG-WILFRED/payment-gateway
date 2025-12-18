'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'payments';
    // describeTable returns column info; if providerMetadata missing, add it
    const desc = await queryInterface.describeTable(table).catch(() => null);
    if (desc && !desc.providerMetadata) {
      await queryInterface.addColumn(table, 'providerMetadata', {
        type: Sequelize.JSONB,
        allowNull: true,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const table = 'payments';
    const desc = await queryInterface.describeTable(table).catch(() => null);
    if (desc && desc.providerMetadata) {
      await queryInterface.removeColumn(table, 'providerMetadata');
    }
  },
};
