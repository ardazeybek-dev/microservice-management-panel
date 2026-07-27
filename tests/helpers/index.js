const crypto = require('crypto');
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/config/db');

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

/** Registers a user in the given role and returns their token. */
async function createUserAndLogin(role, password = PASSWORD) {
    const email = uniqueEmail(role.toLowerCase());

    const registered = await request(app)
        .post('/auth/register')
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

/** Restores the baseline role/permission grants defined in db/schema.sql. */
async function resetPermissions() {
    await pool.query('DELETE FROM role_permissions');
    await pool.query(`
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'Supervisor';
    `);
    await pool.query(`
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('records:read', 'ai:analyze')
        WHERE r.name = 'Student';
    `);
    await pool.query(`
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r JOIN permissions p
          ON p.code IN ('records:read', 'records:write', 'ai:analyze')
        WHERE r.name = 'School';
    `);
    await pool.query(`
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r JOIN permissions p
          ON p.code IN ('records:read', 'ai:analyze', 'rpc:execute')
        WHERE r.name = 'Company';
    `);
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
    resetPermissions,
    getRoleId,
    auth,
    PASSWORD,
};
