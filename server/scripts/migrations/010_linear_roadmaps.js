/**
 * Migration: 010_linear_roadmaps
 *
 * Remodels roadmaps toward a linear "Roadmap → ordered steps" shape, additively
 * so the existing week-based flow keeps working:
 *   - roadmaps: + source, published, imported_from, owner_mentor_id, skill_tags
 *     (existing rows = org curriculum: source='org', published=true)
 *   - roadmap_tasks: + roadmap_id (the step's roadmap), backfilled from the week
 *     so every existing task is also reachable as a linear step (ordered by
 *     task_order). roadmap_week_id stays (legacy/optional grouping).
 *   - roadmap_progress: new per-mentee position in a roadmap (currentStep).
 *
 * Run:      node server/scripts/migrations/010_linear_roadmaps.js
 * Rollback: node server/scripts/migrations/010_linear_roadmaps.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function addColumn(qi, table, name, spec) {
  try {
    await qi.addColumn(table, name, spec);
    console.log(`  ✓ Added ${table}.${name}`);
  } catch (error) {
    if (error.message && error.message.includes('already exists')) console.log(`  ℹ ${table}.${name} exists, skipping`);
    else throw error;
  }
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 010: linear roadmaps');

  // roadmaps template fields
  await addColumn(qi, 'roadmaps', 'source', { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'org' });
  await addColumn(qi, 'roadmaps', 'published', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true });
  await addColumn(qi, 'roadmaps', 'imported_from', { type: Sequelize.UUID, allowNull: true });
  await addColumn(qi, 'roadmaps', 'owner_mentor_id', { type: Sequelize.UUID, allowNull: true });
  await addColumn(qi, 'roadmaps', 'skill_tags', { type: Sequelize.ARRAY(Sequelize.STRING(40)), allowNull: false, defaultValue: [] });

  // roadmap_tasks: direct roadmap link (the step's roadmap)
  await addColumn(qi, 'roadmap_tasks', 'roadmap_id', { type: Sequelize.UUID, allowNull: true });
  await sequelize.query(
    `UPDATE roadmap_tasks t SET roadmap_id = w.roadmap_id
       FROM roadmap_weeks w
      WHERE t.roadmap_week_id = w.id AND t.roadmap_id IS NULL`
  );
  console.log('  ✓ Backfilled roadmap_tasks.roadmap_id from weeks');
  try {
    await qi.addIndex('roadmap_tasks', ['roadmap_id']);
    console.log('  ✓ Indexed roadmap_tasks.roadmap_id');
  } catch (error) {
    if (error.message && error.message.includes('already exists')) console.log('  ℹ index exists, skipping');
    else throw error;
  }

  // roadmap_progress
  try {
    await qi.createTable('roadmap_progress', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      roadmap_id: { type: Sequelize.UUID, allowNull: false },
      mentee_id: { type: Sequelize.UUID, allowNull: false },
      enrollment_id: { type: Sequelize.UUID, allowNull: true },
      current_step: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      slot: { type: Sequelize.STRING(60), allowNull: true },
      completed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      started_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await qi.addIndex('roadmap_progress', ['roadmap_id', 'mentee_id'], { unique: true, name: 'roadmap_progress_roadmap_mentee_unique' });
    await qi.addIndex('roadmap_progress', ['mentee_id']);
    console.log('  ✓ Created roadmap_progress table');
  } catch (error) {
    if (error.message && error.message.includes('already exists')) console.log('  ℹ roadmap_progress exists, skipping');
    else throw error;
  }

  console.log('✅ Migration 010 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 010');
  try { await qi.dropTable('roadmap_progress'); console.log('  ✓ Dropped roadmap_progress'); }
  catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  for (const col of ['roadmap_id']) {
    try { await qi.removeColumn('roadmap_tasks', col); console.log(`  ✓ Removed roadmap_tasks.${col}`); }
    catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  }
  for (const col of ['source', 'published', 'imported_from', 'owner_mentor_id', 'skill_tags']) {
    try { await qi.removeColumn('roadmaps', col); console.log(`  ✓ Removed roadmaps.${col}`); }
    catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  }
  console.log('✅ Rollback 010 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => {
    try { await (isRollback ? down() : up()); process.exit(0); }
    catch (error) { console.error('❌ Migration failed:', error.message); process.exit(1); }
  })();
}

module.exports = { up, down };
