const { pool } = require('../config/db');

/**
 * Returns the permission codes granted to a role.
 *
 * Read straight from the database on every call, so a Supervisor's edit via
 * PUT /admin/permissions takes effect immediately — no restart, no stale
 * in-memory copy. This is the query the Redis caching layer will sit in
 * front of (see the roadmap in README).
 */
async function getPermissionsForRole(roleId) {
    const { rows } = await pool.query(
        `SELECT p.code
           FROM permissions p
           JOIN role_permissions rp ON rp.permission_id = p.id
          WHERE rp.role_id = $1`,
        [roleId]
    );
    return rows.map((row) => row.code);
}

/** Full role → permissions matrix, used by the Supervisor panel. */
async function getPermissionMatrix() {
    const { rows } = await pool.query(
        `SELECT r.id   AS role_id,
                r.name AS role_name,
                COALESCE(
                    ARRAY_AGG(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL),
                    '{}'
                ) AS permissions
           FROM roles r
           LEFT JOIN role_permissions rp ON rp.role_id = r.id
           LEFT JOIN permissions p       ON p.id = rp.permission_id
          GROUP BY r.id, r.name
          ORDER BY r.id`
    );
    return rows;
}

/**
 * Replaces a role's permission set.
 *
 * Wrapped in a transaction: a failure halfway through must not leave the role
 * with no permissions at all.
 */
async function setRolePermissions(roleId, permissionCodes) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);

        if (permissionCodes.length > 0) {
            await client.query(
                `INSERT INTO role_permissions (role_id, permission_id)
                 SELECT $1, id FROM permissions WHERE code = ANY($2::varchar[])`,
                [roleId, permissionCodes]
            );
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { getPermissionsForRole, getPermissionMatrix, setRolePermissions };
