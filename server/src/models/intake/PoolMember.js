/**
 * PoolMember — one candidate's place in a CandidatePool.
 *
 * `status` is how far the candidate has got with the work; `decision` is the
 * human outcome. They are separate because a decision can stand while the
 * work record does not change, and `selected` is separate from placement
 * (`placedAt`) because a clan can be full when the decision is made.
 */
const MEMBER_STATUSES = ['invited', 'active', 'qualifying', 'completed', 'reviewing'];
const MEMBER_DECISIONS = ['selected', 'waitlisted', 'not_selected', 'withdrawn', 'disqualified'];

module.exports = (sequelize, DataTypes) => {
  const PoolMember = sequelize.define('PoolMember', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    poolId: { type: DataTypes.UUID, allowNull: false, field: 'pool_id' },
    // Null until an invited candidate registers.
    userId: { type: DataTypes.UUID, allowNull: true, field: 'user_id' },
    // Normalised; the dedupe key for imports before an account exists.
    email: { type: DataTypes.STRING(255), allowNull: false },
    applicationId: { type: DataTypes.UUID, allowNull: true, field: 'application_id' },
    inviteId: { type: DataTypes.UUID, allowNull: true, field: 'invite_id' },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'invited',
      validate: { isIn: [MEMBER_STATUSES] }
    },
    decision: { type: DataTypes.STRING(20), allowNull: true, validate: { isIn: [MEMBER_DECISIONS] } },
    decisionReason: { type: DataTypes.TEXT, allowNull: true, field: 'decision_reason' },
    decidedById: { type: DataTypes.UUID, allowNull: true, field: 'decided_by_id' },
    decidedAt: { type: DataTypes.DATE, allowNull: true, field: 'decided_at' },
    scoreComponents: { type: DataTypes.JSONB, allowNull: true, field: 'score_components' },
    totalScore: { type: DataTypes.DECIMAL(6, 2), allowNull: true, field: 'total_score' },
    rank: { type: DataTypes.INTEGER, allowNull: true },
    lastRemindedAt: { type: DataTypes.DATE, allowNull: true, field: 'last_reminded_at' },
    placedEnrollmentId: { type: DataTypes.UUID, allowNull: true, field: 'placed_enrollment_id' },
    placedClanId: { type: DataTypes.UUID, allowNull: true, field: 'placed_clan_id' },
    placedAt: { type: DataTypes.DATE, allowNull: true, field: 'placed_at' }
  }, {
    tableName: 'pool_members',
    underscored: true,
    indexes: [
      { unique: true, fields: ['pool_id', 'email'] },
      { fields: ['user_id'] },
      { fields: ['invite_id'] }
    ]
  });

  PoolMember.STATUSES = MEMBER_STATUSES;
  PoolMember.DECISIONS = MEMBER_DECISIONS;

  PoolMember.associate = (models) => {
    PoolMember.belongsTo(models.CandidatePool, { foreignKey: 'pool_id', as: 'pool' });
    PoolMember.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    PoolMember.belongsTo(models.Clan, { foreignKey: 'placed_clan_id', as: 'placedClan' });
    PoolMember.hasMany(models.AssignedTask, { foreignKey: 'pool_member_id', as: 'tasks' });
  };

  return PoolMember;
};
