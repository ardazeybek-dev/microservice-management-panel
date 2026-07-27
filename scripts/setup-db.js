require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');

const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');

/**
 * Applies db/schema.sql, then optionally seeds the first Supervisor from
 * SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.
 *
 * Without that first account nobody holds permissions:manage, so the panel
 * would have no way to grant anyone anything — a chicken-and-egg lockout.
 */
async function setupDatabase() {
    console.log('Applying schema...');

    const schema = await fs.readFile(SCHEMA_PATH, 'utf-8');
    await pool.query(schema);
    console.log('Schema applied: roles, permissions, role_permissions, users, records, audit_logs.');
    console.log('Trigger records_after_insert is active.');

    const email = process.env.SEED_ADMIN_EMAIL;
    const password = process.env.SEED_ADMIN_PASSWORD;

    if (!email || !password) {
        console.log('\nNo SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD set — skipping admin seed.');
        console.log('Set them in .env and re-run to create the first Supervisor.');
        return;
    }

    if (password.length < 8) {
        throw new Error('SEED_ADMIN_PASSWORD must be at least 8 characters.');
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rowCount > 0) {
        console.log(`\nSupervisor ${email} already exists — leaving it untouched.`);
        return;
    }

    const { rows: roleRows } = await pool.query("SELECT id FROM roles WHERE name = 'Supervisor'");
    const passwordHash = await bcrypt.hash(password, 12);

    await pool.query(
        'INSERT INTO users (email, password_hash, role_id) VALUES ($1, $2, $3)',
        [email.toLowerCase(), passwordHash, roleRows[0].id]
    );
    console.log(`\nSupervisor account created: ${email}`);
}

setupDatabase()
    .then(() => {
        console.log('\nDatabase setup completed successfully.');
        return pool.end();
    })
    .then(() => process.exit(0))
    .catch(async (err) => {
        console.error('\nDatabase setup failed:', err.message);
        await pool.end().catch(() => {});
        process.exit(1);
    });
