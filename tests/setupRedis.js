/**
 * Opens the cache connection for each test file and closes it afterwards.
 *
 * The application connects to Redis from index.js, which the tests never load
 * — they build the app through createApp(). Without this the cache would sit
 * permanently disabled and every "does invalidation work" assertion would pass
 * for the wrong reason.
 */
const { connectRedis, disconnectRedis, isConfigured } = require('../src/config/redis');

beforeAll(async () => {
    if (!isConfigured()) return;
    await connectRedis();
});

afterAll(async () => {
    await disconnectRedis();
});
