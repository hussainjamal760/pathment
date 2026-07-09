'use strict';

/**
 * "Remember me" drives the real session length. Checked → a 30-day refresh
 * token; unchecked → a short 1-day session. Verified end to end through the
 * real authService.login: both the signed JWT expiry AND the stored
 * RefreshToken.expiresAt must reflect the choice.
 */

const jwt = require('jsonwebtoken');
const { models } = require('../../src/db');
const authService = require('../../src/services/authService');
const { cleanDb, createUser } = require('../helpers/seed');

const DAY = 24 * 60 * 60 * 1000;
const ttlMs = (token) => (jwt.decode(token).exp * 1000) - Date.now();

describe('login "remember me" session length', () => {
  beforeEach(async () => {
    await cleanDb();
    await createUser({ email: 'u@test.com', password: 'Secret@123', role: 'mentee' });
  });

  it('remembered login → ~30-day refresh token + stored expiry', async () => {
    const res = await authService.login('u@test.com', 'Secret@123', true);
    // JWT exp ~30 days out (allow a generous ±1 day tolerance).
    expect(ttlMs(res.refreshToken)).toBeGreaterThan(29 * DAY);
    expect(ttlMs(res.refreshToken)).toBeLessThan(31 * DAY);
    // DB row matches.
    const row = await models.RefreshToken.findOne({ where: { token: res.refreshToken } });
    const dbMs = new Date(row.expiresAt).getTime() - Date.now();
    expect(dbMs).toBeGreaterThan(29 * DAY);
    expect(dbMs).toBeLessThan(31 * DAY);
  });

  it('unremembered login → ~1-day session', async () => {
    const res = await authService.login('u@test.com', 'Secret@123', false);
    expect(ttlMs(res.refreshToken)).toBeGreaterThan(0.5 * DAY);
    expect(ttlMs(res.refreshToken)).toBeLessThan(1.5 * DAY);
    const row = await models.RefreshToken.findOne({ where: { token: res.refreshToken } });
    const dbMs = new Date(row.expiresAt).getTime() - Date.now();
    expect(dbMs).toBeLessThan(1.5 * DAY);
  });

  it('defaults to the short session when the flag is omitted', async () => {
    const res = await authService.login('u@test.com', 'Secret@123');
    expect(ttlMs(res.refreshToken)).toBeLessThan(1.5 * DAY);
  });
});
