'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/env.js'],              // load .env.test before anything
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],    // jest.mock calls go here
  testTimeout: 30000,
  maxWorkers: 1,          // Run serially to avoid DB race conditions
  forceExit: true,        // Force exit after all tests complete
  verbose: true,
  collectCoverageFrom: ['src/**/*.js'],
  coveragePathIgnorePatterns: ['/node_modules/', '/src/socket/', '/src/config/'],
};
