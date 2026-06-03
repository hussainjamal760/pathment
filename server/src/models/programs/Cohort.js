module.exports = (sequelize, DataTypes) => {
  const Cohort = sequelize.define('Cohort', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    programId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'program_id'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT
    },
    // Intake lifecycle. Only an 'open' cohort accepts applications/invites —
    // an off year is simply a program with no open cohort. Nothing breaks.
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'planning',
      validate: {
        isIn: [['planning', 'open', 'closed', 'running', 'completed']]
      }
    },
    capacity: {
      type: DataTypes.INTEGER
    },
    startDate: {
      type: DataTypes.DATEONLY,
      field: 'start_date'
    },
    endDate: {
      type: DataTypes.DATEONLY,
      field: 'end_date'
    },
    createdBy: {
      type: DataTypes.UUID,
      field: 'created_by'
    }
  }, {
    tableName: 'cohorts',
    underscored: true,
    indexes: [
      { fields: ['program_id'] },
      { fields: ['status'] }
    ]
  });

  Cohort.associate = (models) => {
    Cohort.belongsTo(models.Program, { foreignKey: 'program_id', as: 'program' });
    Cohort.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
    Cohort.hasMany(models.Application, { foreignKey: 'cohort_id', as: 'applications' });
  };

  return Cohort;
};
