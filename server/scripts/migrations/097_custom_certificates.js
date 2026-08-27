/**
 * Migration: 097_custom_certificates
 *
 * Sets up custom certificate system tables:
 * 1. certificate_templates: holds layout configs, coordinates, logo options, background image
 * 2. certificate_instances: issued certificates tracking mentee, template, issuer, and PDF Cloudinary url
 * 3. certificate_queue: outbox queue to render certificates in the background using Puppeteer
 *
 * Run:      node server/scripts/migrations/097_custom_certificates.js
 * Rollback: node server/scripts/migrations/097_custom_certificates.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function tableExists(table, t) {
  const [r] = await sequelize.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name='${table}'`, { transaction: t });
  return r.length > 0;
}

async function indexExists(name, t) {
  const [r] = await sequelize.query(`SELECT 1 FROM pg_indexes WHERE indexname='${name}'`, { transaction: t });
  return r.length > 0;
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 097: custom certificate system');

  await sequelize.transaction(async (t) => {
    // 1. Create certificate_templates
    if (await tableExists('certificate_templates', t)) {
      console.log('  ℹ certificate_templates exists, skipping create');
    } else {
      await qi.createTable('certificate_templates', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        name: { type: Sequelize.STRING(255), allowNull: false },
        bg_image_url: { type: Sequelize.TEXT, allowNull: true },
        logo_url: { type: Sequelize.TEXT, allowNull: true },
        logo_config: { type: Sequelize.JSONB, allowNull: true },
        gold_badge_url: { type: Sequelize.TEXT, allowNull: true },
        silver_badge_url: { type: Sequelize.TEXT, allowNull: true },
        bronze_badge_url: { type: Sequelize.TEXT, allowNull: true },
        participation_badge_url: { type: Sequelize.TEXT, allowNull: true },
        criteria: { type: Sequelize.JSONB, allowNull: true },
        config: { type: Sequelize.JSONB, allowNull: false },
        program_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'programs', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE',
        },
        created_by: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE',
        },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'active' },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      }, { transaction: t });
      console.log('  ✓ Created certificate_templates');
    }

    // 2. Create certificate_instances
    if (await tableExists('certificate_instances', t)) {
      console.log('  ℹ certificate_instances exists, skipping create');
    } else {
      await qi.createTable('certificate_instances', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        template_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'certificate_templates', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE',
        },
        mentee_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE',
        },
        mentor_id: {
          type: Sequelize.UUID, allowNull: true,
          references: { model: 'users', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE',
        },
        issued_by: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE',
        },
        tier: { type: Sequelize.STRING(50), allowNull: false, defaultValue: 'participation' },
        pdf_url: { type: Sequelize.TEXT, allowNull: true },
        image_url: { type: Sequelize.TEXT, allowNull: true },
        metadata: { type: Sequelize.JSONB, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      }, { transaction: t });
      console.log('  ✓ Created certificate_instances');
    }

    // 3. Create certificate_queue
    if (await tableExists('certificate_queue', t)) {
      console.log('  ℹ certificate_queue exists, skipping create');
    } else {
      await qi.createTable('certificate_queue', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        instance_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'certificate_instances', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE',
        },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
        attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        error: { type: Sequelize.TEXT, allowNull: true },
        locked_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      }, { transaction: t });
      console.log('  ✓ Created certificate_queue');
    }

    // Add indexes for queue performance
    const qStatusIdx = 'certificate_queue_status_attempts';
    if (await indexExists(qStatusIdx, t)) {
      console.log(`  ℹ ${qStatusIdx} exists, skipping`);
    } else {
      await qi.addIndex('certificate_queue', ['status', 'attempts'], { name: qStatusIdx, transaction: t });
      console.log(`  ✓ Created index ${qStatusIdx}`);
    }

    // Add indexes for instances lookups
    const instMenteeIdx = 'certificate_instances_mentee_id';
    if (await indexExists(instMenteeIdx, t)) {
      console.log(`  ℹ ${instMenteeIdx} exists, skipping`);
    } else {
      await qi.addIndex('certificate_instances', ['mentee_id'], { name: instMenteeIdx, transaction: t });
      console.log(`  ✓ Created index ${instMenteeIdx}`);
    }
  });

  console.log('✅ Migration 097 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('◀ Rolling back migration 097');

  await sequelize.transaction(async (t) => {
    if (await tableExists('certificate_queue', t)) {
      await qi.dropTable('certificate_queue', { transaction: t });
      console.log('  ✓ Dropped certificate_queue');
    }
    if (await tableExists('certificate_instances', t)) {
      await qi.dropTable('certificate_instances', { transaction: t });
      console.log('  ✓ Dropped certificate_instances');
    }
    if (await tableExists('certificate_templates', t)) {
      await qi.dropTable('certificate_templates', { transaction: t });
      console.log('  ✓ Dropped certificate_templates');
    }
  });

  console.log('✅ Rollback 097 complete');
}

if (require.main === module) {
  (async () => {
    try {
      await (process.argv.includes('--rollback') ? down() : up());
      process.exit(0);
    } catch (err) {
      console.error('❌ Migration 097 failed:', err);
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
