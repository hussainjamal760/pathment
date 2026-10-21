/**
 * CandidatePool — people who are on the platform but not yet selected into a
 * clan. Candidates are tested with ordinary Pathment work (tasks, quizzes,
 * interviews), scored against `scoringPolicy`, shortlisted, and only then
 * placed into clans. Pool size and quota are configuration, never constants.
 */
const POOL_STATUSES = ['draft', 'open', 'qualifying', 'reviewing', 'placing', 'closed'];

module.exports = (sequelize, DataTypes) => {
  const CandidatePool = sequelize.define('CandidatePool', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    programId: { type: DataTypes.UUID, allowNull: false, field: 'program_id' },
    cohortId: { type: DataTypes.UUID, allowNull: true, field: 'cohort_id' },
    name: { type: DataTypes.STRING(150), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'draft',
      validate: { isIn: [POOL_STATUSES] }
    },
    capacity: { type: DataTypes.INTEGER, allowNull: true },
    selectionQuota: { type: DataTypes.INTEGER, allowNull: false, field: 'selection_quota' },
    opensAt: { type: DataTypes.DATE, allowNull: true, field: 'opens_at' },
    closesAt: { type: DataTypes.DATE, allowNull: true, field: 'closes_at' },
    qualificationDueAt: { type: DataTypes.DATE, allowNull: true, field: 'qualification_due_at' },
    // { version, components: [{ key, label, weight, roadmapTaskIds: [] }] }
    scoringPolicy: { type: DataTypes.JSONB, allowNull: false, defaultValue: { version: 1, components: [] }, field: 'scoring_policy' },
    // { enabled, inviteAfterDays, inactivityDays }
    reminderPolicy: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'reminder_policy' },
    // Every shortlist ever proposed, newest last, so a policy change never
    // rewrites the record of what an earlier ranking said.
    shortlistSnapshots: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'shortlist_snapshots' },
    createdById: { type: DataTypes.UUID, allowNull: false, field: 'created_by_id' }
  }, {
    tableName: 'candidate_pools',
    underscored: true,
    indexes: [{ fields: ['program_id'] }, { fields: ['status'] }]
  });

  CandidatePool.STATUSES = POOL_STATUSES;

  CandidatePool.associate = (models) => {
    CandidatePool.belongsTo(models.Program, { foreignKey: 'program_id', as: 'program' });
    CandidatePool.belongsTo(models.Cohort, { foreignKey: 'cohort_id', as: 'cohort' });
    CandidatePool.belongsTo(models.User, { foreignKey: 'created_by_id', as: 'createdBy' });
    CandidatePool.hasMany(models.PoolMember, { foreignKey: 'pool_id', as: 'members' });
  };

  return CandidatePool;
};
