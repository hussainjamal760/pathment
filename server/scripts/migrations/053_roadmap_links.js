/**
 * Migration: 053_roadmap_links
 *
 * Reusable roadmap chaining. Instead of a per-mentee ordered array buried in a
 * schedule slot, the "what comes next" lives ON the roadmaps as a directed graph
 * (adjacency list). One outgoing edge → linear chain (auto-advance on
 * completion); several → the mentor is asked to pick (branching-ready). Cycles
 * are rejected at author time, so it's a DAG.
 *
 *   roadmap_links ( from_roadmap_id → to_roadmap_id, position, condition? )
 *   enrollments.auto_advance_roadmaps  — per-mentee off switch (default on)
 *
 * Run:      node server/scripts/migrations/053_roadmap_links.js
 * Rollback: node server/scripts/migrations/053_roadmap_links.js --rollback
 */
const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 053: roadmap links');

  try {
    await qi.createTable('roadmap_links', {
      id: { type: S.UUID, defaultValue: S.UUIDV4, primaryKey: true },
      from_roadmap_id: { type: S.UUID, allowNull: false },
      to_roadmap_id: { type: S.UUID, allowNull: false },
      position: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
      condition: { type: S.JSONB, allowNull: true },
      created_by: { type: S.UUID, allowNull: true },
      created_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
      updated_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
    });
    await qi.addIndex('roadmap_links', ['from_roadmap_id', 'to_roadmap_id'], { unique: true, name: 'roadmap_links_from_to_uniq' });
    await qi.addIndex('roadmap_links', ['from_roadmap_id'], { name: 'roadmap_links_from_idx' });
    console.log('  ✓ created roadmap_links');
  } catch (e) {
    if (/already exists/i.test(e.message)) console.log('  ℹ roadmap_links exists, skipping');
    else throw e;
  }

  try {
    await qi.addColumn('enrollments', 'auto_advance_roadmaps', { type: S.BOOLEAN, allowNull: false, defaultValue: true });
    console.log('  ✓ added enrollments.auto_advance_roadmaps');
  } catch (e) {
    if (/already exists|duplicate column/i.test(e.message)) console.log('  ℹ enrollments.auto_advance_roadmaps exists, skipping');
    else throw e;
  }

  console.log('✅ Migration 053 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 053');
  try { await qi.dropTable('roadmap_links'); console.log('  ✓ dropped roadmap_links'); } catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  try { await qi.removeColumn('enrollments', 'auto_advance_roadmaps'); console.log('  ✓ dropped enrollments.auto_advance_roadmaps'); } catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  console.log('✅ Rollback 053 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
