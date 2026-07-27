const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/db');
const { invalidateRole } = require('../../src/services/permission.service');

const app = createApp();

/**
 * Unique address per call, so tests never collide on the users.email unique index.
 *
 * A per-module counter is not enough: Jest gives each test file its own module
 * registry, so the counter restarts at zero in every file and the same address
 * would be generated more than once.
 */
function uniqueEmail(prefix = 'user') {
    return `${prefix}-${crypto.randomUUID()}@example.test`;
}

const PASSWORD = 'TestPassword123';

let bootstrapTokenPromise = null;

/**
 * A Supervisor token, for tests that need to call an admin-only route.
 *
 * The account is written straight into the table rather than through
 * POST /auth/register, because that route now requires users:write — there is
 * deliberately no way to create the first administrator through the API. This
 * mirrors what scripts/setup-db.js does from SEED_ADMIN_*.
 *
 * Cached per module registry: Jest gives each test file its own, so this costs
 * one bcrypt hash per file rather than one per call.
 */
function bootstrapSupervisorToken() {
    if (!bootstrapTokenPromise) {
        bootstrapTokenPromise = (async () => {
            const email = uniqueEmail('bootstrap-supervisor');
            const passwordHash = await bcrypt.hash(PASSWORD, 12);

            const { rows } = await pool.query("SELECT id FROM roles WHERE name = 'Supervisor'");
            await pool.query(
                'INSERT INTO users (email, password_hash, role_id) VALUES ($1, $2, $3)',
                [email, passwordHash, rows[0].id]
            );

            const loggedIn = await request(app).post('/auth/login').send({ email, password: PASSWORD });
            if (loggedIn.status !== 200) {
                throw new Error(
                    `Could not log in the bootstrap Supervisor: ${loggedIn.status} ${loggedIn.text}`
                );
            }
            return loggedIn.body.token;
        })();
    }
    return bootstrapTokenPromise;
}

/** Registers a user in the given role and returns their token. */
async function createUserAndLogin(role, password = PASSWORD) {
    const email = uniqueEmail(role.toLowerCase());
    const adminToken = await bootstrapSupervisorToken();

    const registered = await request(app)
        .post('/auth/register')
        .set({ Authorization: `Bearer ${adminToken}` })
        .send({ email, password, role });

    if (registered.status !== 201) {
        throw new Error(`Could not create ${role}: ${registered.status} ${registered.text}`);
    }

    const loggedIn = await request(app).post('/auth/login').send({ email, password });
    if (loggedIn.status !== 200) {
        throw new Error(`Could not log in as ${role}: ${loggedIn.status} ${loggedIn.text}`);
    }

    return { email, password, token: loggedIn.body.token, id: registered.body.user.id };
}

/**
 * The baseline grant statements, lifted straight out of db/schema.sql.
 *
 * These used to be copied into this file by hand, which meant the tests
 * asserted against a baseline that quietly stopped matching the schema — the
 * day documents:read was added, every document test failed with 403 for a
 * reason that had nothing to do with the code under test. Parsing the real
 * file keeps one definition instead of two.
 */
let baselineGrantsCache = null;

function baselineGrantStatements() {
    if (baselineGrantsCache) return baselineGrantsCache;

    const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf-8');

    baselineGrantsCache = schema
        .split(';')
        .map((statement) => statement.trim())
        .filter((statement) => /INSERT\s+INTO\s+role_permissions/i.test(statement));

    if (baselineGrantsCache.length === 0) {
        throw new Error('No role_permissions grants found in db/schema.sql — has it been restructured?');
    }
    return baselineGrantsCache;
}

/**
 * Restores the baseline role/permission grants defined in db/schema.sql.
 *
 * Writes role_permissions directly, so it has to invalidate the cache itself —
 * setRolePermissions is not involved. Skipping that would let a cached set
 * from a previous test survive the reset, and the suite would start passing
 * for reasons that have nothing to do with the code under test.
 */
async function resetPermissions() {
    await pool.query('DELETE FROM role_permissions');

    for (const statement of baselineGrantStatements()) {
        await pool.query(statement);
    }

    await invalidateAllRoles();
}

/** Drops every role's cached permission set. No-op when the cache is off. */
async function invalidateAllRoles() {
    const { rows } = await pool.query('SELECT id FROM roles');
    await Promise.all(rows.map((row) => invalidateRole(row.id)));
}

async function getRoleId(name) {
    const { rows } = await pool.query('SELECT id FROM roles WHERE name = $1', [name]);
    return rows[0].id;
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = {
    app,
    pool,
    request,
    uniqueEmail,
    createUserAndLogin,
    bootstrapSupervisorToken,
    resetPermissions,
    invalidateAllRoles,
    getRoleId,
    auth,
    PASSWORD,
};
