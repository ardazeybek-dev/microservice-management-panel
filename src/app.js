const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const recordsRoutes = require('./routes/records.routes');
const aiRoutes = require('./routes/ai.routes');
const rpcRoutes = require('./routes/rpc.routes');
const adminRoutes = require('./routes/admin.routes');
const documentRoutes = require('./routes/documents.routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

/**
 * Builds the Express app without binding a port, so integration tests can
 * drive it through Supertest with no listening server.
 */
function createApp() {
    const app = express();

    app.use(cors());
    app.use(express.json({ limit: '1mb' }));

    app.get('/health', (req, res) => res.json({ status: 'ok' }));

    app.use('/auth', authRoutes);
    app.use('/records', recordsRoutes);
    app.use('/ai-analyze', aiRoutes);
    app.use('/rpc-test', rpcRoutes);
    app.use('/admin', adminRoutes);
    app.use('/documents', documentRoutes);

    app.use(notFound);
    app.use(errorHandler);

    return app;
}

module.exports = { createApp };
