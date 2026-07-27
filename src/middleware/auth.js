const jwt = require('jsonwebtoken');
const { getPermissionsForRole } = require('../services/permission.service');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';

if (!JWT_SECRET && process.env.NODE_ENV !== 'test') {
    // Fail loudly at boot rather than silently signing tokens with `undefined`.
    throw new Error('JWT_SECRET is not set. Copy .env.example to .env and set it.');
}

function signToken(user) {
    return jwt.sign(
        { sub: user.id, email: user.email, roleId: user.role_id, role: user.role_name },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

/** Verifies the Bearer token and attaches req.user. */
function authenticate(req, res, next) {
    const header = req.headers.authorization || '';

    if (!header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header with a Bearer token is required.' });
    }

    try {
        const payload = jwt.verify(header.slice(7), JWT_SECRET);
        req.user = {
            id: payload.sub,
            email: payload.email,
            roleId: payload.roleId,
            role: payload.role,
        };
        return next();
    } catch (err) {
        const expired = err.name === 'TokenExpiredError';
        return res.status(401).json({ error: expired ? 'Token has expired.' : 'Invalid token.' });
    }
}

/**
 * Guards a route behind a permission code.
 *
 * The check hits the database rather than reading the role off the token, so
 * revoking a permission takes effect on the very next request instead of
 * waiting for the user's token to expire.
 */
function requirePermission(code) {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        try {
            const granted = await getPermissionsForRole(req.user.roleId);
            if (!granted.includes(code)) {
                return res.status(403).json({
                    error: 'You do not have permission to perform this action.',
                    required: code,
                });
            }
            return next();
        } catch (err) {
            return next(err);
        }
    };
}

module.exports = { signToken, authenticate, requirePermission, JWT_EXPIRES_IN };
