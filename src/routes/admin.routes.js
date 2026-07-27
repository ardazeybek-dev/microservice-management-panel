const express = require('express');
const { pool } = require('../config/db');
const { authenticate, requirePermission } = require('../middleware/auth');
const { getPermissionMatrix, setRolePermissions } = require('../services/permission.service');

const router = express.Router();

/**
 * GET /admin/permissions — the full role → permissions matrix.
 * This is what the Supervisor panel renders.
 */
router.get('/permissions', authenticate, requirePermission('permissions:manage'), async (req, res, next) => {
    try {
        const [matrix, allPermissions] = await Promise.all([
            getPermissionMatrix(),
            pool.query('SELECT code, description FROM permissions ORDER BY code'),
        ]);
        return res.json({ roles: matrix, availablePermissions: allPermissions.rows });
    } catch (err) {
        return next(err);
    }
});

/**
 * PUT /admin/permissions/:roleId — replaces a role's permission set.
 * This is the endpoint that makes the authorization genuinely dynamic.
 */
router.put('/permissions/:roleId', authenticate, requirePermission('permissions:manage'), async (req, res, next) => {
    const roleId = parseInt(req.params.roleId, 10);
    const { permissions } = req.body || {};

    if (Number.isNaN(roleId)) {
        return res.status(400).json({ error: 'roleId must be a number.' });
    }
    if (!Array.isArray(permissions)) {
        return res.status(400).json({ error: 'A "permissions" array of permission codes is required.' });
    }

    try {
        const roleResult = await pool.query('SELECT id, name FROM roles WHERE id = $1', [roleId]);
        if (roleResult.rowCount === 0) {
            return res.status(404).json({ error: 'Role not found.' });
        }

        // Reject unknown codes instead of silently dropping them — a typo in the
        // panel would otherwise look like a successful save that did nothing.
        const known = await pool.query(
            'SELECT code FROM permissions WHERE code = ANY($1::varchar[])',
            [permissions]
        );
        const knownCodes = known.rows.map((r) => r.code);
        const unknown = permissions.filter((c) => !knownCodes.includes(c));
        if (unknown.length > 0) {
            return res.status(400).json({ error: 'Unknown permission codes.', unknown });
        }

        // Guard against locking everyone out of the permission editor.
        if (roleResult.rows[0].name === 'Supervisor' && !permissions.includes('permissions:manage')) {
            return res.status(400).json({
                error: 'Supervisor cannot drop the permissions:manage permission — that would lock the panel.',
            });
        }

        await setRolePermissions(roleId, permissions);
        return res.json({ roleId, role: roleResult.rows[0].name, permissions });
    } catch (err) {
        return next(err);
    }
});

/** GET /admin/users — directory listing; never exposes password hashes. */
router.get('/users', authenticate, requirePermission('users:read'), async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT u.id, u.email, r.name AS role, u.is_active, u.created_at
               FROM users u
               JOIN roles r ON r.id = u.role_id
              ORDER BY u.id`
        );
        return res.json({ users: rows });
    } catch (err) {
        return next(err);
    }
});

module.exports = router;
