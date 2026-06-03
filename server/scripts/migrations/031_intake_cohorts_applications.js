/**
 * Migration: 031_intake_cohorts_applications
 *
 * Part 2 — the registration intake pipeline:
 *   - cohorts: a program's intake batch/season. Only an 'open' cohort accepts
 *     applications; an off year = no open cohort.
 *   - applications: intake records (schema-free `responses` JSONB + a review
 *     pipeline). On accept an invite is issued (Part 1 placement) and, once the
 *     applicant registers, the application links to their user.
 *   - registration_invites.cohort_id + enrollments.cohort_id: trace a cohort
 *     end-to-end (invite → enrollment).
 *
 * Run:      node server/scripts/migrations/031_intake_cohorts_applications.js
 * Rollback: node server/scripts/migrations/031_intake_cohorts_applications.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function addColumn(qi, table, column, spec) {
  try {
    await qi.addColumn(table, column, spec);
    console.log(`  ✓ Added ${table}.${column}`);
  } catch (e) {
    if (/already exists|duplicate column/i.test(e.message)) console.log(`  ℹ ${table}.${column} exists, skipping`);
    else throw e;
  }
}

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 031: intake cohorts + applications');

  // cohorts
  await qi.createTable('cohorts', {
    id: { type: S.UUID, defaultValue: S.UUIDV4, primaryKey: true },
    program_id: { type: S.UUID, allowNull: false },
    name: { type: S.STRING(255), allowNull: false },
    description: { type: S.TEXT },
    status: { type: S.STRING(20), allowNull: false, defaultValue: 'planning' },
    capacity: { type: S.INTEGER },
    start_date: { type: S.DATEONLY },
    end_date: { type: S.DATEONLY },
    created_by: { type: S.UUID },
    created_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
    updated_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') }
  }).then(() => console.log('  ✓ Created cohorts')).catch((e) => {
    if (/already exists/i.test(e.message)) console.log('  ℹ cohorts exists, skipping'); else throw e;
  });
  await qi.addIndex('cohorts', ['program_id']).catch(() => {});
  await qi.addIndex('cohorts', ['status']).catch(() => {});

  // applications
  await qi.createTable('applications', {
    id: { type: S.UUID, defaultValue: S.UUIDV4, primaryKey: true },
    cohort_id: { type: S.UUID, allowNull: false },
    email: { type: S.STRING(255), allowNull: false },
    first_name: { type: S.STRING(120) },
    last_name: { type: S.STRING(120) },
    phone: { type: S.STRING(40) },
    program_preference: { type: S.STRING(255) },
    source: { type: S.STRING(20), allowNull: false, defaultValue: 'import' },
    status: { type: S.STRING(20), allowNull: false, defaultValue: 'pending' },
    assessment_score: { type: S.DECIMAL(5, 2) },
    reviewer_notes: { type: S.TEXT },
    reviewed_by: { type: S.UUID },
    decided_at: { type: S.DATE },
    invite_id: { type: S.UUID },
    user_id: { type: S.UUID },
    responses: { type: S.JSONB, allowNull: false, defaultValue: {} },
    created_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
    updated_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') }
  }).then(() => console.log('  ✓ Created applications')).catch((e) => {
    if (/already exists/i.test(e.message)) console.log('  ℹ applications exists, skipping'); else throw e;
  });
  await qi.addIndex('applications', ['cohort_id']).catch(() => {});
  await qi.addIndex('applications', ['email']).catch(() => {});
  await qi.addIndex('applications', ['status']).catch(() => {});
  await qi.addIndex('applications', ['cohort_id', 'email'], { unique: true, name: 'applications_cohort_email_uniq' }).catch(() => {});

  // traceability columns
  await addColumn(qi, 'registration_invites', 'cohort_id', { type: S.UUID, allowNull: true });
  await qi.addIndex('registration_invites', ['cohort_id']).catch(() => {});
  await addColumn(qi, 'enrollments', 'cohort_id', { type: S.UUID, allowNull: true });
  await qi.addIndex('enrollments', ['cohort_id']).catch(() => {});

  console.log('✅ Migration 031 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 031');
  for (const [table, col] of [['enrollments', 'cohort_id'], ['registration_invites', 'cohort_id']]) {
    try { await qi.removeColumn(table, col); console.log(`  ✓ Dropped ${table}.${col}`); }
    catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  }
  await qi.dropTable('applications').then(() => console.log('  ✓ Dropped applications')).catch(() => {});
  await qi.dropTable('cohorts').then(() => console.log('  ✓ Dropped cohorts')).catch(() => {});
  console.log('✅ Rollback 031 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
