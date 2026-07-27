const { pool } = require('../config/db');
const { cacheGet, cacheSet, cacheDel, isReady } = require('../config/redis');

/**
 * How long a cached permission set may live without anyone touching it.
 *
 * Deliberately short. Every write path below invalidates explicitly, so the
 * TTL is not the mechanism that keeps the cache honest — it is the backstop
 * for the one case invalidation cannot cover: a DELETE that succeeded in
 * PostgreSQL while Redis was unreachable. Sixty seconds bounds how long a
 * revoked permission could survive in that window.
 */
const CACHE_TTL_SECONDS = Number(process.env.PERMISSION_CACHE_TTL_SECONDS) || 60;

const cacheKey = (roleId) => `perm:role:${roleId}`;

/**
 * Returns the permission codes granted to a role.
 *
 * Reads go through Redis when it is available and fall through to PostgreSQL
 * otherwise — including when Redis is up but erroring, since cacheGet reports
 * a failure and a miss the same way.
 *
 * The guarantee this function has to preserve is the one the whole panel is
 * built on: a Supervisor's edit applies to the very next request. That holds
 * because setRolePermissions drops this key inside the same call that writes
 * the rows, so the next read cannot be served from a stale entry.
 */
async function getPermissionsForRole(roleId) {
    const key = cacheKey(roleId);

    const cached = await cacheGet(key);
    if (cached !== null) {
        try {
            return JSON.parse(cached);
        } catch {
            // A corrupt entry is not worth failing a request over.
            await cacheDel(key);
        }
    }

    const { rows } = await pool.query(
        `SELECT p.code
           FROM permissions p
           JOIN role_permissions rp ON rp.permission_id = p.id
          WHERE rp.role_id = $1`,
        [roleId]
    );
    const codes = rows.map((row) => row.code);

    await cacheSet(key, JSON.stringify(codes), CACHE_TTL_SECONDS);
    return codes;
}

/** Full role → permissions matrix, used by the Supervisor panel. */
async function getPermissionMatrix() {
    // Not cached: it is read only by the admin screen, and it is the view a
    // Supervisor checks right after saving — the one place stale data would be
    // most visible and least excusable.
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
 *
 * The cache is dropped after COMMIT, not before. Invalidating first would open
 * a window where a concurrent read repopulates the key from the pre-commit
 * state and then nothing invalidates it again — the stale entry would outlive
 * the write.
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

    await invalidateRole(roleId);
}

/**
 * Drops a role's cached permissions.
 *
 * Exported because role_permissions can also be written outside this module —
 * a migration, a seed, a psql session — and those paths need a way to say so.
 */
async function invalidateRole(roleId) {
    const dropped = await cacheDel(cacheKey(roleId));

    if (!dropped && isReady()) {
        console.error(
            `Could not invalidate ${cacheKey(roleId)}; stale permissions may be served ` +
            `for up to ${CACHE_TTL_SECONDS}s.`
        );
    }
    return dropped;
}

module.exports = {
    getPermissionsForRole,
    getPermissionMatrix,
    setRolePermissions,
    invalidateRole,
    cacheKey,
    CACHE_TTL_SECONDS,
};
