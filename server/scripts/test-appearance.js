/* Verifies per-user appearance persistence: user_settings.color_theme save +
 * getProfile-style read. Run: node scripts/test-appearance.js  (self-cleans) */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { models, sequelize } = require('../src/db');

const TAG = `ap_${Date.now()}_`;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const created = { users: [] };

(async () => {
  try {
    const u = await models.User.create({ email: (TAG + 'u@x.io').toLowerCase(), passwordHash: 'x', role: 'mentee', capabilities: ['mentee'], firstName: 'Vibe', lastName: 'T', emailVerified: true, status: 'active' });
    created.users.push(u.id);

    // Default before any settings row.
    let s = await models.UserSettings.findOne({ where: { userId: u.id } });
    ok(!s, 'no settings row initially');

    // Mirror updateAppearance: findOrCreate + update.
    const [settings] = await models.UserSettings.findOrCreate({ where: { userId: u.id }, defaults: { userId: u.id } });
    ok(settings.colorTheme === 'ocean', 'colorTheme defaults to ocean');
    await settings.update({ colorTheme: 'emerald', theme: 'dark' });

    s = await models.UserSettings.findOne({ where: { userId: u.id } });
    ok(s.colorTheme === 'emerald', 'colorTheme persists (emerald)');
    ok(s.theme === 'dark', 'theme persists (dark)');

    // getProfile-style read includes colorTheme.
    const profile = await models.User.findByPk(u.id, {
      include: [{ model: models.UserSettings, as: 'settings', required: false, attributes: ['timezone', 'language', 'theme', 'colorTheme'] }],
    });
    ok(profile.settings && profile.settings.colorTheme === 'emerald', 'getProfile read returns colorTheme');

    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  } catch (err) {
    console.error('FATAL', err.message, err.stack);
    fail++;
  } finally {
    try {
      await models.UserSettings.destroy({ where: { userId: created.users } }).catch(() => {});
      await models.User.destroy({ where: { id: created.users } }).catch(() => {});
      console.log('cleanup done');
    } catch (e2) { console.error('cleanup error', e2.message); }
    await sequelize.close();
    process.exit(fail ? 1 : 0);
  }
})();
