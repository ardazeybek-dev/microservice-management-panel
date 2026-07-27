/**
 * Runs before any module is imported, so JWT_SECRET is in place by the time
 * src/middleware/auth.js reads it at load time.
 *
 * The database name is forced to a dedicated *_test database — the test suite
 * truncates tables, and it must never be able to do that to real data.
 */
require('dotenv').config();

process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'microservice_panel_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-not-used-in-production';
process.env.JWT_EXPIRES_IN = '1h';

// Never let a test run reach a real broker.
delete process.env.RABBITMQ_URL;
