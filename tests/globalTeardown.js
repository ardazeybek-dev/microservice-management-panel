/**
 * Drops the test database after the suite finishes.
 * Set KEEP_TEST_DB=1 to keep it around for inspection when debugging.
 */
require('./setupEnv');

const { Client } = require('pg');

module.exports = async () => {
    if (process.env.KEEP_TEST_DB === '1') return;

    const TEST_DB = process.env.DB_NAME;
    if (!TEST_DB || !TEST_DB.endsWith('_test')) return;

    const admin = new Client({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
        database: 'postgres',
    });

    await admin.connect();
    // Terminate leftover connections, otherwise DROP DATABASE blocks.
    await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
          WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [TEST_DB]
    );
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    await admin.end();
};
