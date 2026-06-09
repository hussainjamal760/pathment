/**
 * Migration: 032_community_v2
 *
 * Community feature v2 — turns the flat global feed into a real, scoped
 * community layer that mirrors the org hierarchy (clan → cohort → program →
 * global) and supports threaded conversations, Q&A, mentions, pinning,
 * tagging, rich content, and moderation.
 *
 * This single migration provisions the full schema for all three phases so it
 * is forward-compatible:
 *   Phase 1 — spaces & scoping:   community_posts.scope_type/scope_id (+ rich-
 *                                 content/soft-delete columns)
 *   Phase 2 — conversations:      community_comments, posts.title/tags/resolved/
 *                                 accepted_comment_id/comment_count/mentions
 *   Phase 3 — engagement:         community_posts.pinned_at/pinned_by + the
 *                                 community_reports moderation table
 *
 * Existing rows are backfilled to scope_type 'global' so the legacy feed stays
 * visible in the all-hands lounge.
 *
 * Run:      node server/scripts/migrations/032_community_v2.js
 * Rollback: node server/scripts/migrations/032_community_v2.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('./_db');

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
  console.log('▶ Running migration 032: community v2 (spaces, threads, moderation)');

  // ── community_posts: scoping ────────────────────────────────────────────
  await addColumn(qi, 'community_posts', 'scope_type', { type: S.STRING(20), allowNull: false, defaultValue: 'global' });
  await addColumn(qi, 'community_posts', 'scope_id', { type: S.UUID, allowNull: true });

  // ── community_posts: knowledge / rich content ───────────────────────────
  await addColumn(qi, 'community_posts', 'title', { type: S.STRING(255), allowNull: true });
  await addColumn(qi, 'community_posts', 'tags', { type: S.ARRAY(S.STRING(40)), allowNull: false, defaultValue: [] });
  await addColumn(qi, 'community_posts', 'link_url', { type: S.TEXT, allowNull: true });
  await addColumn(qi, 'community_posts', 'attachments', { type: S.JSONB, allowNull: false, defaultValue: [] });
  await addColumn(qi, 'community_posts', 'mentioned_user_ids', { type: S.ARRAY(S.UUID), allowNull: false, defaultValue: [] });

  // ── community_posts: Q&A ────────────────────────────────────────────────
  await addColumn(qi, 'community_posts', 'resolved', { type: S.BOOLEAN, allowNull: false, defaultValue: false });
  await addColumn(qi, 'community_posts', 'accepted_comment_id', { type: S.UUID, allowNull: true });
  await addColumn(qi, 'community_posts', 'comment_count', { type: S.INTEGER, allowNull: false, defaultValue: 0 });

  // ── community_posts: moderation / lifecycle ─────────────────────────────
  await addColumn(qi, 'community_posts', 'pinned_at', { type: S.DATE, allowNull: true });
  await addColumn(qi, 'community_posts', 'pinned_by', { type: S.UUID, allowNull: true });
  await addColumn(qi, 'community_posts', 'edited_at', { type: S.DATE, allowNull: true });
  await addColumn(qi, 'community_posts', 'deleted_at', { type: S.DATE, allowNull: true });

  await qi.addIndex('community_posts', ['scope_type', 'scope_id'], { name: 'community_posts_scope_idx' }).catch(() => {});
  await qi.addIndex('community_posts', ['pinned_at'], { name: 'community_posts_pinned_idx' }).catch(() => {});
  await qi.addIndex('community_posts', ['deleted_at'], { name: 'community_posts_deleted_idx' }).catch(() => {});

  // ── community_comments (new) ────────────────────────────────────────────
  await qi.createTable('community_comments', {
    id: { type: S.UUID, defaultValue: S.UUIDV4, primaryKey: true },
    post_id: { type: S.UUID, allowNull: false },
    author_id: { type: S.UUID, allowNull: false },
    parent_id: { type: S.UUID, allowNull: true },
    body: { type: S.TEXT, allowNull: false },
    mentioned_user_ids: { type: S.ARRAY(S.UUID), allowNull: false, defaultValue: [] },
    edited_at: { type: S.DATE },
    deleted_at: { type: S.DATE },
    created_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
    updated_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') }
  }).then(() => console.log('  ✓ Created community_comments')).catch((e) => {
    if (/already exists/i.test(e.message)) console.log('  ℹ community_comments exists, skipping'); else throw e;
  });
  await qi.addIndex('community_comments', ['post_id']).catch(() => {});
  await qi.addIndex('community_comments', ['author_id']).catch(() => {});
  await qi.addIndex('community_comments', ['parent_id']).catch(() => {});

  // ── community_reports (new, moderation) ─────────────────────────────────
  await qi.createTable('community_reports', {
    id: { type: S.UUID, defaultValue: S.UUIDV4, primaryKey: true },
    target_type: { type: S.STRING(10), allowNull: false }, // 'post' | 'comment'
    target_id: { type: S.UUID, allowNull: false },
    reporter_id: { type: S.UUID, allowNull: false },
    reason: { type: S.TEXT },
    status: { type: S.STRING(20), allowNull: false, defaultValue: 'open' }, // open | reviewed | dismissed
    reviewed_by: { type: S.UUID },
    created_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
    updated_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') }
  }).then(() => console.log('  ✓ Created community_reports')).catch((e) => {
    if (/already exists/i.test(e.message)) console.log('  ℹ community_reports exists, skipping'); else throw e;
  });
  await qi.addIndex('community_reports', ['target_type', 'target_id']).catch(() => {});
  await qi.addIndex('community_reports', ['status']).catch(() => {});

  console.log('✅ Migration 032 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 032');
  await qi.dropTable('community_reports').then(() => console.log('  ✓ Dropped community_reports')).catch(() => {});
  await qi.dropTable('community_comments').then(() => console.log('  ✓ Dropped community_comments')).catch(() => {});
  const cols = [
    'scope_type', 'scope_id', 'title', 'tags', 'link_url', 'attachments', 'mentioned_user_ids',
    'resolved', 'accepted_comment_id', 'comment_count', 'pinned_at', 'pinned_by', 'edited_at', 'deleted_at'
  ];
  for (const col of cols) {
    try { await qi.removeColumn('community_posts', col); console.log(`  ✓ Dropped community_posts.${col}`); }
    catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  }
  console.log('✅ Rollback 032 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
