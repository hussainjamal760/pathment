'use strict';

/**
 * TC-M06  Verify email with valid token
 * TC-M07  Verify email with expired token
 *
 * Note: invite-based registration sets emailVerified=true immediately.
 * These tests cover the standalone email-verification endpoint which is
 * used when an admin creates a user account directly (non-invite path).
 * We seed users with emailVerified=false and an EmailVerificationToken.
 */

const request = require('supertest');
const app = require('../../src/index');
const {
  cleanDb,
  createUser,
  createEmailVerificationToken,
} = require('../helpers/seed');

const BASE = '/api/auth/verify-email';

describe('POST /api/auth/verify-email — Email Verification', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  // TC-M06
  it('TC-M06: activates account with a valid verification token', async () => {
    const user = await createUser({
      role: 'mentee',
      email: 'awaisfatehali@gmail.com',
      emailVerified: false,
      status: 'pending',
    });
    const token = await createEmailVerificationToken(user.id);

    const res = await request(app).post(BASE).send({ token });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/verified/i);
  });

  // TC-M07
  it('TC-M07: returns error for an expired verification token', async () => {
    const user = await createUser({
      role: 'mentee',
      email: 'expired@test.com',
      emailVerified: false,
      status: 'pending',
    });
    const expiredToken = await createEmailVerificationToken(user.id, { expired: true });

    const res = await request(app).post(BASE).send({ token: expiredToken });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message.toLowerCase()).toMatch(/expired|invalid/i);
  });
});
