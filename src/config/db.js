const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// An idle-client error would otherwise crash the process.
pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL client error:', err.message);
});

module.exports = { pool };
