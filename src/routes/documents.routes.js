const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { authenticate, requirePermission } = require('../middleware/auth');
const {
    ingestDocument,
    searchChunks,
    listDocuments,
    deleteDocument,
} = require('../services/document.service');
const { getEmbeddingProvider } = require('../services/embedding.service');

const router = express.Router();

const MAX_CONTENT_CHARS = 200_000;
const MAX_QUESTION_CHARS = 1_000;
const DEFAULT_TOP_K = 5;
const MAX_TOP_K = 20;
const ANSWER_MODEL_CANDIDATES = ['gemini-2.5-flash', 'gemini-2.0-flash'];

/** GET /documents — the corpus, with per-document chunk counts. */
router.get('/', authenticate, requirePermission('documents:read'), async (req, res, next) => {
    try {
        const provider = getEmbeddingProvider();
        return res.json({
            embedding: { model: provider.name, dimensions: provider.dimensions, semantic: provider.isSemantic },
            documents: await listDocuments(),
        });
    } catch (err) {
        return next(err);
    }
});

/** POST /documents — chunk, embed and store a document. */
router.post('/', authenticate, requirePermission('documents:write'), async (req, res, next) => {
    const { title, content } = req.body || {};

    if (typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({ error: 'A non-empty "title" is required.' });
    }
    if (typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ error: 'A non-empty "content" is required.' });
    }
    if (content.length > MAX_CONTENT_CHARS) {
        return res.status(413).json({
            error: `Content is ${content.length} characters, above the ${MAX_CONTENT_CHARS} limit.`,
        });
    }

    try {
        const document = await ingestDocument({
            title: title.trim().slice(0, 255),
            content,
            userId: req.user.id,
        });
        return res.status(201).json(document);
    } catch (err) {
        // Only errors this codebase raised on purpose. Anything else — an
        // embedding API refusing the model, a broken connection — is a server
        // fault and must not be reported as though the request was invalid.
        if (err.expose && err.status) return res.status(err.status).json({ error: err.message });
        return next(err);
    }
});

router.delete('/:id', authenticate, requirePermission('documents:write'), async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'id must be a number.' });

    try {
        const deleted = await deleteDocument(id);
        if (!deleted) return res.status(404).json({ error: 'Document not found.' });
        return res.status(204).end();
    } catch (err) {
        return next(err);
    }
});

/**
 * POST /documents/search — retrieval on its own, with no model behind it.
 *
 * Worth exposing separately: it is the half of RAG that decides whether an
 * answer can be right, and it needs no API key, so the ranking can be
 * inspected directly instead of being guessed at through the generated text.
 */
router.post('/search', authenticate, requirePermission('documents:read'), async (req, res, next) => {
    const { query, limit } = req.body || {};

    if (typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({ error: 'A non-empty "query" is required.' });
    }

    const topK = Math.min(Math.max(parseInt(limit, 10) || DEFAULT_TOP_K, 1), MAX_TOP_K);

    try {
        const provider = getEmbeddingProvider();
        const matches = await searchChunks(query.trim().slice(0, MAX_QUESTION_CHARS), topK);
        return res.json({ query, embeddingModel: provider.name, matches });
    } catch (err) {
        return next(err);
    }
});

async function answerFrom(client, question, passages) {
    const context = passages
        .map((match, index) => `[${index + 1}] (${match.documentTitle})\n${match.content}`)
        .join('\n\n');

    const prompt =
        'Answer the question using only the numbered passages below. ' +
        'Cite the passages you use as [1], [2] and so on. ' +
        'If the passages do not contain the answer, say so plainly instead of guessing.\n\n' +
        `Passages:\n${context}\n\nQuestion: ${question}`;

    let lastError;
    for (const modelName of ANSWER_MODEL_CANDIDATES) {
        try {
            const model = client.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            return { text: result.response.text(), model: modelName };
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error('No Gemini model was able to answer.');
}

/**
 * POST /documents/ask — retrieve, then generate an answer from what came back.
 *
 * The retrieved passages are returned alongside the answer. Without them a
 * reader cannot tell a grounded answer from a fluent invention, which is the
 * failure mode this whole approach exists to reduce.
 */
router.post('/ask', authenticate, requirePermission('documents:read'), async (req, res, next) => {
    const { question, limit } = req.body || {};

    if (typeof question !== 'string' || question.trim().length === 0) {
        return res.status(400).json({ error: 'A non-empty "question" is required.' });
    }

    const trimmed = question.trim().slice(0, MAX_QUESTION_CHARS);
    const topK = Math.min(Math.max(parseInt(limit, 10) || DEFAULT_TOP_K, 1), MAX_TOP_K);

    try {
        const matches = await searchChunks(trimmed, topK);

        if (matches.length === 0) {
            return res.json({
                question: trimmed,
                answer: null,
                sources: [],
                note: 'Nothing has been indexed yet, so there is nothing to answer from.',
            });
        }

        // Retrieval already succeeded; only generation needs the key. Saying so
        // separately makes it clear which half of the pipeline is unavailable.
        if (!process.env.GEMINI_API_KEY) {
            return res.status(503).json({
                error: 'GEMINI_API_KEY is not configured, so no answer can be generated.',
                question: trimmed,
                sources: matches,
                note: 'Retrieval ran and these are the passages an answer would have been built from.',
            });
        }

        const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const { text, model } = await answerFrom(client, trimmed, matches);

        return res.json({ question: trimmed, answer: text, model, sources: matches });
    } catch (err) {
        return next(err);
    }
});

module.exports = router;
