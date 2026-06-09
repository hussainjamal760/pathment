/* eslint-disable no-console */
/**
 * Migration runner — the production-safe way to evolve the schema.
 *
 *   npm run db:migrate                 apply all PENDING migrations, in order
 *   npm run db:migrate -- --status     show applied vs pending (no changes)
 *   npm run db:migrate -- --include-drops   also run destructive drop_* migrations
 *
 * - Tracks applied migrations in a `schema_migrations` table, so re-running only
 *   applies what's new (and is safe to run on every deploy).
 * - Migrations are idempotent (createTable / addColumn skip if they already
 *   exist), so a first run on an existing DB just records them — no data loss.
 * - DESTRUCTIVE `*_drop_*` / `drop_` migrations are SKIPPED by default; pass
 *   --include-drops only when you deliberately want them.
 * - Connects via scripts/migrations/_db.js, which is SSL-aware (works on the
 *   managed production DB, not just local/staging).
 */
const fs = require('fs');
const path = require('path');
const sequelize = require('./migrations/_db');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const isDestructive = (f) => /drop/i.test(f);

(async () => {
  const statusOnly = process.argv.includes('--status');
  const includeDrops = process.argv.includes('--include-drops');
  const baseline = process.argv.includes('--baseline');

  await sequelize.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())'
  );
  const [appliedRows] = await sequelize.query('SELECT name FROM schema_migrations');
  const applied = new Set(appliedRows.map((r) => r.name));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d.*\.js$/.test(f)) // numbered migrations only (skips _db.js)
    .sort();

  const pending = files.filter((f) => !applied.has(f));

  // Baseline: record all current migrations as applied WITHOUT running them.
  // Use this once on an existing DB (already at the current schema via db:sync)
  // so future `db:migrate` only runs migrations added afterwards — no replaying
  // history (which could fail on already-present tables/indexes).
  if (baseline) {
    for (const f of pending) {
      await sequelize.query('INSERT INTO schema_migrations (name) VALUES (:n) ON CONFLICT DO NOTHING', { replacements: { n: f } });
    }
    console.log(`✓ Baselined ${pending.length} migration(s) as already applied (no schema changes made).`);
    await sequelize.close();
    return;
  }

  if (statusOnly) {
    console.log(`Applied: ${applied.size}`);
    console.log('Pending:');
    pending.forEach((f) => console.log(`  ${isDestructive(f) ? '⚠ (destructive) ' : ''}${f}`));
    if (!pending.length) console.log('  (none — schema is up to date)');
    await sequelize.close();
    return;
  }

  let ran = 0;
  let skipped = 0;
  for (const f of pending) {
    if (isDestructive(f) && !includeDrops) {
      console.log(`⏭  skip (destructive — run with --include-drops if intended): ${f}`);
      skipped += 1;
      continue;
    }
    console.log(`▶ applying ${f}`);
    const migration = require(path.join(MIGRATIONS_DIR, f));
    if (typeof migration.up !== 'function') {
      throw new Error(`${f} has no exported up() — cannot run programmatically`);
    }
    await migration.up();
    await sequelize.query('INSERT INTO schema_migrations (name) VALUES (:n) ON CONFLICT DO NOTHING', { replacements: { n: f } });
    ran += 1;
  }

  console.log(`\n✓ Done — ${ran} applied, ${skipped} skipped (destructive), ${applied.size} already recorded.`);
  await sequelize.close();
})().catch((e) => {
  console.error('❌ Migration run failed:', e.message);
  process.exit(1);
});
