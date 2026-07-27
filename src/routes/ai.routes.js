const express = require('express');
const multer = require('multer');
const fs = require('fs/promises');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

// Ordered by preference; each is tried in turn on a real API call.
// gemini-pro used to sit at the end of this list; the API no longer serves it.
const MODEL_CANDIDATES = ['gemini-2.5-flash', 'gemini-2.0-flash'];

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, UPLOAD_DIR),
        filename: (req, file, cb) => {
            // Never trust the client's filename in a path.
            const safe = path.basename(file.originalname).replace(/[^\w.-]/g, '_');
            cb(null, `${Date.now()}-${safe}`);
        },
    }),
    limits: { fileSize: MAX_FILE_BYTES },
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'text/plain' && !file.originalname.toLowerCase().endsWith('.txt')) {
            return cb(new Error('Only .txt files are supported.'));
        }
        cb(null, true);
    },
});

/**
 * Tries each candidate model until one actually answers.
 *
 * getGenerativeModel() only builds a client object — it never throws for an
 * unavailable model, so a fallback loop around it can never fall back. The
 * real request has to be the thing that is retried.
 */
async function summarize(genAI, content) {
    let lastError;

    for (const modelName of MODEL_CANDIDATES) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent([
                'Summarize the following text briefly:\n',
                content,
            ]);
            return { text: result.response.text(), model: modelName };
        } catch (err) {
            lastError = err;
        }
    }

    throw lastError || new Error('No Gemini model was able to answer.');
}

/** POST /ai-analyze — summarizes an uploaded .txt file. */
router.post(
    '/',
    authenticate,
    requirePermission('ai:analyze'),
    upload.single('document'),
    async (req, res, next) => {
        if (!req.file) {
            return res.status(400).json({ error: 'A .txt file must be attached in the "document" field.' });
        }
        if (!process.env.GEMINI_API_KEY) {
            await fs.unlink(req.file.path).catch(() => {});
            return res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
        }

        try {
            const content = await fs.readFile(req.file.path, 'utf-8');

            if (content.trim().length === 0) {
                return res.status(400).json({ error: 'The uploaded file is empty.' });
            }

            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const { text, model } = await summarize(genAI, content);

            return res.json({
                message: 'AI analysis successful.',
                model,
                characters: content.length,
                aiAnalysis: text,
            });
        } catch (err) {
            return next(err);
        } finally {
            // Delete the upload either way; otherwise the disk fills up with
            // one-shot files that are never read again.
            await fs.unlink(req.file.path).catch(() => {});
        }
    }
);

module.exports = router;
