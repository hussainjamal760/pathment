/**
 * Migration: 003_add_completion_fields_to_enrollments
 *
 * Adds completion tracking columns to the enrollments table and widens the
 * status column to accommodate 'pending_completion'.
 *
 * Run manually:
 *   node server/scripts/migrations/003_add_completion_fields_to_enrollments.js
 */

const { Sequelize } = require('sequelize');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();

  console.log('▶ Running migration 003: add completion fields to enrollments');

  // 1. Widen status column to VARCHAR(25) to fit 'pending_completion'
  await qi.changeColumn('enrollments', 'status', {
    type: Sequelize.STRING(25),
    defaultValue: 'pending_approval',
    allowNull: false,
  });
  console.log('  ✓ status column widened to VARCHAR(25)');

  // 2. Add completion tracking columns (safe: ADD COLUMN IF NOT EXISTS)
  const newCols = [
    { name: 'completion_requested_at',       type: 'TIMESTAMP WITH TIME ZONE' },
    { name: 'completion_requested_by',        type: 'UUID' },
    { name: 'completion_requested_by_role',   type: 'VARCHAR(20)' },
    { name: 'completion_approved_at',         type: 'TIMESTAMP WITH TIME ZONE' },
    { name: 'completion_approved_by',         type: 'UUID' },
    { name: 'completion_approved_by_role',    type: 'VARCHAR(20)' },
    { name: 'completion_rejection_reason',    type: 'TEXT' },
    { name: 'next_level_enrolled_at',         type: 'TIMESTAMP WITH TIME ZONE' },
  ];

  for (const col of newCols) {
    await sequelize.query(
      `ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS ${col.name} ${col.type};`
    );
    console.log(`  ✓ ${col.name} added`);
  }

  console.log('✅ Migration 003 complete');
}

up()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  });
