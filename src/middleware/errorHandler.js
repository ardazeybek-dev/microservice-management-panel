const multer = require('multer');

/** 404 for anything no router claimed. */
function notFound(req, res) {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

/**
 * Central error handler.
 *
 * Internal error messages are logged but never returned to the client — a
 * database error string can leak table names and query structure.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies handlers by arity.
function errorHandler(err, req, res, next) {
    if (err instanceof multer.MulterError) {
        const tooLarge = err.code === 'LIMIT_FILE_SIZE';
        return res.status(400).json({
            error: tooLarge ? 'The uploaded file is too large.' : `Upload error: ${err.message}`,
        });
    }

    // Errors raised by multer's fileFilter arrive as plain Errors.
    if (err.message === 'Only .txt files are supported.') {
        return res.status(400).json({ error: err.message });
    }

    console.error(`[${req.method} ${req.originalUrl}]`, err);
    return res.status(500).json({ error: 'An unexpected server error occurred.' });
}

module.exports = { notFound, errorHandler };
