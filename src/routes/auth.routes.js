const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { signToken, authenticate, requirePermission, JWT_EXPIRES_IN } = require('../middleware/auth');
const { getPermissionsForRole } = require('../services/permission.service');

const router = express.Router();

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A precomputed hash of a throwaway value. Compared against when the email is
// unknown so that "user does not exist" costs the same time as "wrong
// password" — otherwise response timing leaks which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('invalid-placeholder-password', BCRYPT_ROUNDS);

/**
 * POST /auth/register — creates a user in the given role.
 *
 * Deliberately NOT open self-service. The role comes from the request body, so
 * an unauthenticated version of this route lets anyone mint themselves a
 * Supervisor and take over the permission matrix — which would make every other
 * check in this codebase decorative. Account creation is an administrative act
 * and sits behind users:write.
 *
 * The first Supervisor is seeded out-of-band by scripts/setup-db.js; there is
 * no bootstrap path through the API.
 */
router.post('/register', authenticate, requirePermission('users:write'), async (req, res, next) => {
    const { email, password, role } = req.body || {};

    if (!email || !password || !role) {
        return res.status(400).json({ error: 'email, password and role are required.' });
    }
    if (!EMAIL_PATTERN.test(email)) {
        return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({
            error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        });
    }

    try {
        const roleResult = await pool.query('SELECT id, name FROM roles WHERE name = $1', [role]);
        if (roleResult.rowCount === 0) {
            return res.status(400).json({ error: `Unknown role: ${role}` });
        }

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        const { rows } = await pool.query(
            `INSERT INTO users (email, password_hash, role_id)
             VALUES ($1, $2, $3)
             RETURNING id, email, role_id, created_at`,
            [email.toLowerCase(), passwordHash, roleResult.rows[0].id]
        );

        return res.status(201).json({
            message: 'User created.',
            user: {
                id: rows[0].id,
                email: rows[0].email,
                role: roleResult.rows[0].name,
                createdAt: rows[0].created_at,
            },
        });
    } catch (err) {
        if (err.code === '23505') { // unique_violation on users.email
            return res.status(409).json({ error: 'This email address is already registered.' });
        }
        return next(err);
    }
});

/** POST /auth/login — exchanges credentials for a JWT. */
router.post('/login', async (req, res, next) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required.' });
    }

    try {
        const { rows } = await pool.query(
            `SELECT u.id, u.email, u.password_hash, u.role_id, u.is_active, r.name AS role_name
               FROM users u
               JOIN roles r ON r.id = u.role_id
              WHERE u.email = $1`,
            [email.toLowerCase()]
        );

        const user = rows[0];
        // Always run a comparison, even with no user, to keep timing constant.
        const passwordMatches = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

        if (!user || !passwordMatches) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }
        if (!user.is_active) {
            return res.status(403).json({ error: 'This account has been deactivated.' });
        }

        return res.json({
            token: signToken(user),
            expiresIn: JWT_EXPIRES_IN,
            user: { id: user.id, email: user.email, role: user.role_name },
        });
    } catch (err) {
        return next(err);
    }
});

/** GET /auth/me — the caller's identity plus their current permissions. */
router.get('/me', authenticate, async (req, res, next) => {
    try {
        const permissions = await getPermissionsForRole(req.user.roleId);
        return res.json({
            id: req.user.id,
            email: req.user.email,
            role: req.user.role,
            permissions,
        });
    } catch (err) {
        return next(err);
    }
});

module.exports = router;
