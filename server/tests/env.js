'use strict';

/**
 * Loaded via jest `setupFiles` — runs BEFORE the test framework is installed.
 * Only safe to use Node.js APIs here (no jest.fn(), jest.mock()).
 * Purpose: set environment variables so src/db/index.js picks up the test DATABASE_URL.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.test') });

// Safety guard — never run tests against a non-test database
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('test')) {
  throw new Error(
    'TEST SAFETY: DATABASE_URL does not contain "test". ' +
    'Set DATABASE_URL in .env.test to a dedicated test database before running tests.'
  );
}
