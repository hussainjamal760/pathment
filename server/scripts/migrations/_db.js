// Shared connection for migration scripts. Mirrors src/db so migrations connect
// to a TLS managed Postgres (production) exactly like the app — set DB_SSL=false
// for a plain local/staging Postgres. This is why migrations can now run on prod
// (the old `new Sequelize(DATABASE_URL)` had no SSL config and couldn't connect).
const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

function dbSsl() {
  if (String(process.env.DB_SSL).toLowerCase() === 'false') return false;
  const caPath = process.env.DB_SSL_CA_PATH;
  if (caPath && fs.existsSync(caPath)) {
    return { require: true, rejectUnauthorized: true, ca: fs.readFileSync(caPath, 'utf8') };
  }
  return { require: true, rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED).toLowerCase() === 'true' };
}

module.exports = new Sequelize(process.env.DATABASE_URL, {
  logging: false,
  dialectOptions: { ssl: dbSsl() },
});
