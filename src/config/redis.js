const { createClient } = require('redis');

/**
 * Optional Redis connection used only as a cache.
 *
 * Nothing in this application depends on Redis being up. If REDIS_URL is
 * unset the cache is simply disabled, and if the server goes away mid-request
 * every read falls through to PostgreSQL. A cache that can take the API down
 * with it is worse than no cache at all.
 */

let client = null;
let ready = false;

function isConfigured() {
    return Boolean(process.env.REDIS_URL);
}

/** True only when a command has a real chance of succeeding. */
function isReady() {
    return Boolean(client && ready && client.isOpen);
}

async function connectRedis() {
    if (!isConfigured()) return null;
    if (client) return client;

    client = createClient({
        url: process.env.REDIS_URL,
        socket: {
            // Give up after a handful of attempts instead of reconnecting
            // forever: the app is fully functional without the cache, and an
            // endless retry loop just fills the logs.
            reconnectStrategy: (retries) => (retries > 5 ? false : Math.min(2 ** retries * 50, 2000)),
        },
    });

    // node-redis exits the process if 'error' has no listener.
    client.on('error', (err) => {
        if (ready) console.error('Redis error, falling back to PostgreSQL:', err.message);
        ready = false;
    });
    client.on('ready', () => {
        ready = true;
    });
    client.on('end', () => {
        ready = false;
    });

    await client.connect();
    ready = true;
    return client;
}

async function disconnectRedis() {
    if (!client) return;
    try {
        if (client.isOpen) await client.quit();
    } catch {
        client.destroy();
    } finally {
        client = null;
        ready = false;
    }
}

/**
 * Cache reads and writes never throw.
 *
 * Every caller treats a miss and a failure identically, so swallowing the
 * error here keeps the fallback logic in one place rather than wrapping each
 * call site in its own try/catch.
 */
async function cacheGet(key) {
    if (!isReady()) return null;
    try {
        return await client.get(key);
    } catch (err) {
        console.error(`Redis GET ${key} failed:`, err.message);
        return null;
    }
}

async function cacheSet(key, value, ttlSeconds) {
    if (!isReady()) return false;
    try {
        await client.set(key, value, { EX: ttlSeconds });
        return true;
    } catch (err) {
        console.error(`Redis SET ${key} failed:`, err.message);
        return false;
    }
}

/**
 * Returns false when the key could not be dropped.
 *
 * Callers must care about this one: a failed delete is the case where the
 * cache and the database disagree, and the TTL is the only thing that will
 * eventually resolve it.
 */
async function cacheDel(key) {
    if (!isReady()) return false;
    try {
        await client.del(key);
        return true;
    } catch (err) {
        console.error(`Redis DEL ${key} failed:`, err.message);
        return false;
    }
}

module.exports = {
    connectRedis,
    disconnectRedis,
    isConfigured,
    isReady,
    cacheGet,
    cacheSet,
    cacheDel,
};
