'use strict';

/**
 * TC-M08   Login with valid credentials (mentee)
 * TC-M09   Login with incorrect password
 * TC-M10   Login with unverified account
 * TC-MR01  Mentor login with valid credentials
 * TC-MR02  Mentor login with invalid password
 * TC-A01   Admin login with valid credentials
 * TC-A02   Admin login with invalid credentials
 */

const request = require('supertest');
const app = require('../../src/index');
const { cleanDb, createUser, createAdmin, createMentor } = require('../helpers/seed');

const BASE = '/api/auth/login';

describe('POST /api/auth/login — Login', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  // TC-M08
  it('TC-M08: returns JWT tokens for a valid mentee login', async () => {
    await createUser({ role: 'mentee', email: 'awaisfatehali@gmail.com', password: 'Test@1234!' });

    const res = await request(app).post(BASE).send({
      email: 'awaisfatehali@gmail.com',
      password: 'Test@1234!',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    expect(res.body.data.tokens.refreshToken).toBeTruthy();
    expect(res.body.data.user.role).toBe('mentee');
  });

  // TC-M09
  it('TC-M09: returns 401 for incorrect password', async () => {
    await createUser({ role: 'mentee', email: 'awaisfatehali@gmail.com', password: 'Test@1234!' });

    const res = await request(app).post(BASE).send({
      email: 'awaisfatehali@gmail.com',
      password: 'wrong99',
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message.toLowerCase()).toMatch(/invalid/i);
  });

  // TC-M10
  it('TC-M10: returns 401 when email is not verified', async () => {
    await createUser({
      role: 'mentee',
      email: 'unverified@test.com',
      password: 'Verified@1234',
      emailVerified: false,
      status: 'active',
    });

    const res = await request(app).post(BASE).send({
      email: 'unverified@test.com',
      password: 'Verified@1234',
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message.toLowerCase()).toMatch(/verify|verified/i);
  });

  // TC-MR01
  it('TC-MR01: returns JWT tokens for a valid mentor login', async () => {
    await createMentor({ email: 'malikjunaid26039@gmail.com', password: 'Junaid123@' });

    const res = await request(app).post(BASE).send({
      email: 'malikjunaid26039@gmail.com',
      password: 'Junaid123@',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe('mentor');
    expect(res.body.data.tokens.accessToken).toBeTruthy();
  });

  // TC-MR02
  it('TC-MR02: returns 401 for mentor with invalid password', async () => {
    await createMentor({ email: 'malikjunaid26039@gmail.com', password: 'Junaid123@' });

    const res = await request(app).post(BASE).send({
      email: 'malikjunaid26039@gmail.com',
      password: 'wrong123',
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message.toLowerCase()).toMatch(/invalid/i);
  });

  // TC-A01
  it('TC-A01: returns JWT tokens for a valid admin login', async () => {
    await createAdmin();

    const res = await request(app).post(BASE).send({
      email: 'admin@ue.edu',
      password: 'Admin@2024',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe('admin');
    expect(res.body.data.tokens.accessToken).toBeTruthy();
  });

  // TC-A02
  it('TC-A02: returns 401 for admin with invalid credentials', async () => {
    await createAdmin();

    const res = await request(app).post(BASE).send({
      email: 'admin@ue.edu',
      password: 'wrongpass123',
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message.toLowerCase()).toMatch(/invalid/i);
  });
});
