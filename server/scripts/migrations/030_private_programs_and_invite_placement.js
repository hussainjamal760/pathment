/**
 * Migration: 030_private_programs_and_invite_placement
 *
 * Part 1 of the invite-driven enrollment rework:
 *   1. programs.visibility ('private' | 'public', default 'private') — separate
 *      from lifecycle status. Private programs are never discoverable; mentees
 *      no longer browse/self-enroll. Existing programs default to private.
 *   2. registration_invites.program_id + clan_id (nullable FKs) — the invite is
 *      the placement. On registration the user is enrolled into program_id and,
 *      when set, added to clan_id. Mentee invites carry a program; mentor invites
 *      carry the clan they'll lead (program derived from the clan).
 *
 * Run:      node server/scripts/migrations/030_private_programs_and_invite_placement.js
 * Rollback: node server/scripts/migrations/030_private_programs_and_invite_placement.js --rollback
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
  console.log('▶ Running migration 030: private programs + invite placement');

  await addColumn(qi, 'programs', 'visibility', {
    type: Sequelize.STRING(20),
    allowNull: false,
    defaultValue: 'private',
  });
  // Be explicit: every existing program becomes private.
  await sequelize.query(`UPDATE programs SET visibility = 'private' WHERE visibility IS NULL`).catch(() => {});
  await qi.addIndex('programs', ['visibility']).catch(() => {});

  await addColumn(qi, 'registration_invites', 'program_id', { type: Sequelize.UUID, allowNull: true });
  await addColumn(qi, 'registration_invites', 'clan_id', { type: Sequelize.UUID, allowNull: true });
  await qi.addIndex('registration_invites', ['program_id']).catch(() => {});
  await qi.addIndex('registration_invites', ['clan_id']).catch(() => {});

  console.log('✅ Migration 030 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 030');
  for (const [table, col] of [
    ['registration_invites', 'program_id'],
    ['registration_invites', 'clan_id'],
    ['programs', 'visibility'],
  ]) {
    try { await qi.removeColumn(table, col); console.log(`  ✓ Dropped ${table}.${col}`); }
    catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  }
  console.log('✅ Rollback 030 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
