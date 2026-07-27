const express = require('express');
const { pool } = require('../config/db');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/** GET /records — paginated list, newest first. */
router.get('/', authenticate, requirePermission('records:read'), async (req, res, next) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    try {
        // Unbounded SELECT * would eventually return the whole table.
        const { rows } = await pool.query(
            `SELECT id, data, created_by, created_at
               FROM records
              ORDER BY id DESC
              LIMIT $1 OFFSET $2`,
            [limit, offset]
        );
        const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS total FROM records');

        return res.json({ total: countRows[0].total, limit, offset, items: rows });
    } catch (err) {
        return next(err);
    }
});

/** POST /records — stores an arbitrary JSON document. */
router.post('/', authenticate, requirePermission('records:write'), async (req, res, next) => {
    const { data } = req.body || {};

    if (data === undefined || data === null || typeof data !== 'object') {
        return res.status(400).json({ error: 'A "data" field containing a JSON object is required.' });
    }

    try {
        const { rows } = await pool.query(
            `INSERT INTO records (data, created_by)
             VALUES ($1, $2)
             RETURNING id, data, created_by, created_at`,
            [data, req.user.id]
        );
        return res.status(201).json(rows[0]);
    } catch (err) {
        return next(err);
    }
});

module.exports = router;
