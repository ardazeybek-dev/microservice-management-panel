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

/**
 * Caching is off unless TEST_REDIS_URL is given, and a developer's own
 * REDIS_URL is discarded either way — a test run must not evict entries the
 * running dev server is relying on. Point TEST_REDIS_URL at a dedicated
 * database index, e.g. redis://localhost:6379/15.
 *
 * CI sets it, so the whole suite runs a second time over with the cache in
 * front of every permission lookup. That is the point: the existing
 * authorization tests are the invalidation tests.
 */
if (process.env.TEST_REDIS_URL) {
    process.env.REDIS_URL = process.env.TEST_REDIS_URL;
} else {
    delete process.env.REDIS_URL;
}

// Keep it short enough that a TTL-expiry test does not stall the suite.
process.env.PERMISSION_CACHE_TTL_SECONDS = '60';

/**
 * No test may reach Gemini. Dropping the key also pins the two routes that
 * need it to their documented 503, instead of the suite behaving one way on a
 * machine that has a key and another way in CI.
 */
delete process.env.GEMINI_API_KEY;
process.env.EMBEDDING_PROVIDER = 'local';
