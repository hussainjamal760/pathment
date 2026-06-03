/**
 * Migration: 027_drop_roadmap_weeks
 *
 * Removes the legacy week-based curriculum. Tasks now link to their roadmap
 * directly via roadmap_tasks.roadmap_id (linear model). We first backfill that
 * link from each task's week, then drop the week column + table.
 *
 * Run:      node server/scripts/migrations/027_drop_roadmap_weeks.js
 * Rollback: node server/scripts/migrations/027_drop_roadmap_weeks.js --rollback
 *           (best-effort: recreates an empty roadmap_weeks + the column)
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 027: drop roadmap_weeks');

  // 1. Backfill roadmap_id on any week-based task that doesn't have it yet.
  try {
    const [, meta] = await sequelize.query(`
      UPDATE roadmap_tasks rt
      SET roadmap_id = rw.roadmap_id
      FROM roadmap_weeks rw
      WHERE rt.roadmap_week_id = rw.id AND rt.roadmap_id IS NULL
    `);
    console.log(`  ✓ Backfilled roadmap_id from weeks (${meta?.rowCount ?? 0} rows)`);
  } catch (e) {
    if (/does not exist/.test(e.message)) console.log('  ℹ roadmap_weeks/column already gone, skipping backfill');
    else throw e;
  }

  // 2. Drop the week column on roadmap_tasks (also drops its indexes/FK).
  try {
    await qi.removeColumn('roadmap_tasks', 'roadmap_week_id');
    console.log('  ✓ Dropped roadmap_tasks.roadmap_week_id');
  } catch (e) {
    if (/does not exist/.test(e.message)) console.log('  ℹ roadmap_week_id already gone, skipping');
    else throw e;
  }

  // 3. Ensure an index on roadmap_id for ordered step lookups.
  try {
    await qi.addIndex('roadmap_tasks', ['roadmap_id'], { name: 'roadmap_tasks_roadmap_id' });
    console.log('  ✓ Added roadmap_tasks.roadmap_id index');
  } catch (e) {
    if (/already exists/.test(e.message)) console.log('  ℹ roadmap_id index exists, skipping'); else throw e;
  }

  // 4. Drop the table.
  try {
    await qi.dropTable('roadmap_weeks');
    console.log('  ✓ Dropped roadmap_weeks');
  } catch (e) {
    if (/does not exist/.test(e.message)) console.log('  ℹ roadmap_weeks already gone, skipping');
    else throw e;
  }

  console.log('✅ Migration 027 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 027 (best-effort recreate)');
  try {
    await qi.createTable('roadmap_weeks', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      roadmap_id: { type: Sequelize.UUID, allowNull: false },
      week_number: { type: Sequelize.INTEGER, allowNull: false },
      title: { type: Sequelize.STRING(255), allowNull: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      objectives: { type: Sequelize.ARRAY(Sequelize.TEXT), allowNull: true },
      key_concepts: { type: Sequelize.ARRAY(Sequelize.TEXT), allowNull: true },
      milestone: { type: Sequelize.TEXT, allowNull: true },
      estimated_hours: { type: Sequelize.INTEGER, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    console.log('  ✓ Recreated roadmap_weeks (empty)');
  } catch (e) {
    if (/already exists/.test(e.message)) console.log('  ℹ table exists, skipping'); else throw e;
  }
  try {
    await qi.addColumn('roadmap_tasks', 'roadmap_week_id', { type: Sequelize.UUID, allowNull: true });
    console.log('  ✓ Re-added roadmap_tasks.roadmap_week_id');
  } catch (e) {
    if (/already exists|duplicate column/i.test(e.message)) console.log('  ℹ column exists, skipping'); else throw e;
  }
  console.log('✅ Rollback 027 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
