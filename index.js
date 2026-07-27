require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { createApp } = require('./src/app');
const { pool } = require('./src/config/db');
const { connectRabbitMQ } = require('./src/config/rabbitmq');

const port = process.env.PORT || 3006;

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

async function start() {
    try {
        await pool.query('SELECT 1');
        console.log('Connected to PostgreSQL successfully.');
    } catch (err) {
        console.error('Could not connect to PostgreSQL:', err.message);
        process.exit(1);
    }

    // The broker is optional at boot: everything except /rpc-test still works
    // without it, and /rpc-test answers 503 until it reconnects.
    try {
        await connectRabbitMQ();
    } catch (err) {
        console.error('Could not connect to RabbitMQ:', err.message);
        console.error('The server will start, but /rpc-test will return 503.');
    }

    const server = createApp().listen(port, () => {
        console.log(`Backend is ready at http://localhost:${port}`);
    });

    const shutdown = async (signal) => {
        console.log(`\n${signal} received, shutting down.`);
        server.close(() => pool.end().then(() => process.exit(0)));
        setTimeout(() => process.exit(1), 10_000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
