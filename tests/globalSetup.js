/**
 * Creates a throwaway test database and applies db/schema.sql to it.
 * Runs once, before the whole suite.
 */
require('./setupEnv');

const fs = require('fs/promises');
const path = require('path');
const { Client, Pool } = require('pg');

const TEST_DB = process.env.DB_NAME;

module.exports = async () => {
    // Refuse to touch anything that is not obviously a test database. Without
    // this guard a mistyped env var could drop a real one.
    if (!TEST_DB || !TEST_DB.endsWith('_test')) {
        throw new Error(
            `Refusing to run: test database name must end with "_test" (got "${TEST_DB}").`
        );
    }

    const admin = new Client({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
        database: 'postgres',
    });

    await admin.connect();
    // Start from a clean slate so a previous failed run cannot leak state.
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    await admin.query(`CREATE DATABASE ${TEST_DB}`);
    await admin.end();

    const schema = await fs.readFile(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');
    const pool = new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
        database: TEST_DB,
    });

    await pool.query(schema);
    await pool.end();
};
