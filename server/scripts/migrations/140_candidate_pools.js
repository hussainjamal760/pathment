/**
 * Migration: 140_candidate_pools
 *
 * Selection pools: a real pre-clan state for candidates who are on the
 * platform but not yet selected. Until now task assignment assumed a clan, so
 * the only way to test 300 people before choosing 50 was a fake clan, which
 * made enrolment, progress, analytics and permissions all lie.
 *
 *   candidate_pools   one pool per intake round, owned by a programme
 *   pool_members      one candidate's place, work status and human decision
 *   assigned_tasks.pool_member_id
 *                     marks qualification work; such a task has no clan and
 *                     no enrolment, so it never moves either's progress
 *
 * Run:      node server/scripts/migrations/140_candidate_pools.js
 * Rollback: node server/scripts/migrations/140_candidate_pools.js --rollback
 */
const sequelize = require('./_db');

async function up() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS candidate_pools (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id),
      program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      cohort_id UUID REFERENCES cohorts(id) ON DELETE SET NULL,
      name VARCHAR(150) NOT NULL,
      description TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      capacity INTEGER,
      selection_quota INTEGER NOT NULL,
      opens_at TIMESTAMPTZ,
      closes_at TIMESTAMPTZ,
      qualification_due_at TIMESTAMPTZ,
      scoring_policy JSONB NOT NULL DEFAULT '{"version":1,"components":[]}',
      reminder_policy JSONB NOT NULL DEFAULT '{}',
      award_points BOOLEAN NOT NULL DEFAULT false,
      shortlist_snapshots JSONB NOT NULL DEFAULT '[]',
      created_by_id UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await sequelize.query('CREATE INDEX IF NOT EXISTS candidate_pools_organization_idx ON candidate_pools (organization_id)');
  await sequelize.query('CREATE INDEX IF NOT EXISTS candidate_pools_program_id ON candidate_pools (program_id)');
  await sequelize.query('CREATE INDEX IF NOT EXISTS candidate_pools_status ON candidate_pools (status)');
  console.log('  ✓ candidate_pools');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS pool_members (
      id UUID PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id),
      pool_id UUID NOT NULL REFERENCES candidate_pools(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      email VARCHAR(255) NOT NULL,
      application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
      invite_id UUID REFERENCES registration_invites(id) ON DELETE SET NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'invited',
      decision VARCHAR(20),
      decision_reason TEXT,
      decided_by_id UUID REFERENCES users(id),
      decided_at TIMESTAMPTZ,
      score_components JSONB,
      total_score DECIMAL(6,2),
      rank INTEGER,
      last_reminded_at TIMESTAMPTZ,
      placed_enrollment_id UUID REFERENCES enrollments(id) ON DELETE SET NULL,
      placed_clan_id UUID REFERENCES clans(id) ON DELETE SET NULL,
      placed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  // One membership per email per pool: retried imports reuse the row.
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS pool_members_org_pool_email_uniq
      ON pool_members (organization_id, pool_id, email)`);
  await sequelize.query('CREATE INDEX IF NOT EXISTS pool_members_organization_idx ON pool_members (organization_id)');
  await sequelize.query('CREATE INDEX IF NOT EXISTS pool_members_user_id ON pool_members (user_id)');
  await sequelize.query('CREATE INDEX IF NOT EXISTS pool_members_invite_id ON pool_members (invite_id)');
  console.log('  ✓ pool_members');

  await sequelize.query(`
    ALTER TABLE assigned_tasks
      ADD COLUMN IF NOT EXISTS pool_member_id UUID REFERENCES pool_members(id) ON DELETE CASCADE`);
  await sequelize.query('CREATE INDEX IF NOT EXISTS assigned_tasks_pool_member_id ON assigned_tasks (pool_member_id)');
  console.log('  ✓ assigned_tasks.pool_member_id');
}

async function down() {
  await sequelize.query('DROP INDEX IF EXISTS assigned_tasks_pool_member_id');
  await sequelize.query('ALTER TABLE assigned_tasks DROP COLUMN IF EXISTS pool_member_id');
  await sequelize.query('DROP TABLE IF EXISTS pool_members');
  await sequelize.query('DROP TABLE IF EXISTS candidate_pools');
  console.log('  ✓ selection pool tables and column dropped');
}

module.exports = { up, down };

if (require.main === module) {
  (process.argv.includes('--rollback') ? down() : up())
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
