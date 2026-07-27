const { pool } = require('../config/db');
const { getEmbeddingProvider, toVectorLiteral } = require('./embedding.service');

const CHUNK_SIZE = Number(process.env.CHUNK_SIZE) || 1000;
const CHUNK_OVERLAP = Number(process.env.CHUNK_OVERLAP) || 150;
const MAX_CHUNKS_PER_DOCUMENT = 500;

/**
 * Marks an error as the caller's fault, with the status to answer with.
 *
 * The `expose` flag matters: without it a route cannot tell this apart from an
 * error thrown by a dependency that happens to carry a `status`. A 404 from
 * the embedding API is not a 404 for the client — their request was fine, ours
 * failed — and reflecting it says the opposite.
 */
function clientError(message, status) {
    const error = new Error(message);
    error.status = status;
    error.expose = true;
    return error;
}

/**
 * Splits text into overlapping chunks, preferring paragraph boundaries.
 *
 * The overlap is the point: a sentence that straddles a boundary would
 * otherwise be split across two chunks and retrievable from neither, because
 * neither half carries enough of it to match the question.
 */
function chunkText(text, { size = CHUNK_SIZE, overlap = CHUNK_OVERLAP } = {}) {
    const normalized = text.replace(/\r\n/g, '\n').trim();
    if (normalized.length === 0) return [];
    if (normalized.length <= size) return [normalized];

    if (overlap >= size) {
        throw new Error('CHUNK_OVERLAP must be smaller than CHUNK_SIZE.');
    }

    const chunks = [];
    let start = 0;

    while (start < normalized.length) {
        let end = Math.min(start + size, normalized.length);

        if (end < normalized.length) {
            // Prefer to break at a paragraph, then a sentence, then a space —
            // but only in the last third of the window, so a single early
            // newline cannot produce a chunk barely bigger than the overlap
            // and stall the loop.
            const floor = start + Math.floor(size * 0.6);
            const candidates = [
                normalized.lastIndexOf('\n\n', end),
                normalized.lastIndexOf('. ', end),
                normalized.lastIndexOf(' ', end),
            ];
            const boundary = candidates.find((index) => index > floor);
            if (boundary !== undefined) end = boundary;
        }

        const piece = normalized.slice(start, end).trim();
        if (piece.length > 0) chunks.push(piece);

        if (end >= normalized.length) break;
        start = Math.max(end - overlap, start + 1);
    }

    return chunks;
}

/**
 * Stores a document and its embedded chunks.
 *
 * One transaction: a document row with no chunks would be invisible to every
 * search while still looking present in the listing, which is worse than the
 * ingestion having failed outright.
 */
async function ingestDocument({ title, content, userId }) {
    const chunks = chunkText(content);

    if (chunks.length === 0) {
        throw clientError('The document has no text to index.', 400);
    }
    if (chunks.length > MAX_CHUNKS_PER_DOCUMENT) {
        throw clientError(
            `The document splits into ${chunks.length} chunks, above the ${MAX_CHUNKS_PER_DOCUMENT} limit.`,
            413
        );
    }

    const provider = getEmbeddingProvider();
    // Embed before opening the transaction: this is the slow, network-bound
    // step and holding a connection through it would pin the pool.
    const vectors = await provider.embedDocuments(chunks);

    if (vectors.length !== chunks.length) {
        throw new Error('The embedding provider returned the wrong number of vectors.');
    }
    for (const vector of vectors) {
        if (!Array.isArray(vector) || vector.length !== provider.dimensions) {
            throw new Error(
                `The embedding provider returned a ${vector?.length}-dimension vector, expected ${provider.dimensions}.`
            );
        }
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            `INSERT INTO documents (title, content, uploaded_by)
             VALUES ($1, $2, $3)
             RETURNING id, title, created_at`,
            [title, content, userId ?? null]
        );
        const document = rows[0];

        for (let index = 0; index < chunks.length; index += 1) {
            await client.query(
                `INSERT INTO document_chunks
                     (document_id, chunk_index, content, embedding, embedding_model)
                 VALUES ($1, $2, $3, $4::vector, $5)`,
                [document.id, index, chunks[index], toVectorLiteral(vectors[index]), provider.name]
            );
        }

        await client.query('COMMIT');

        return {
            id: document.id,
            title: document.title,
            createdAt: document.created_at,
            chunks: chunks.length,
            embeddingModel: provider.name,
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Nearest chunks to a question, by cosine distance.
 *
 * Filtered to the active provider's vectors. Chunks embedded by a different
 * model sit in an unrelated coordinate space, and including them does not
 * produce bad-but-ranked-low results — it produces confident nonsense.
 */
async function searchChunks(question, limit = 5) {
    const provider = getEmbeddingProvider();
    const queryVector = await provider.embedQuery(question);

    const { rows } = await pool.query(
        `SELECT c.id,
                c.document_id,
                c.chunk_index,
                c.content,
                d.title,
                1 - (c.embedding <=> $1::vector) AS similarity
           FROM document_chunks c
           JOIN documents d ON d.id = c.document_id
          WHERE c.embedding_model = $2
          ORDER BY c.embedding <=> $1::vector
          LIMIT $3`,
        [toVectorLiteral(queryVector), provider.name, limit]
    );

    return rows.map((row) => ({
        chunkId: row.id,
        documentId: row.document_id,
        documentTitle: row.title,
        chunkIndex: row.chunk_index,
        content: row.content,
        similarity: Number(row.similarity),
    }));
}

async function listDocuments() {
    const { rows } = await pool.query(
        `SELECT d.id, d.title, d.created_at, d.uploaded_by,
                COUNT(c.id)::int          AS chunks,
                MIN(c.embedding_model)    AS embedding_model,
                LENGTH(d.content)::int    AS characters
           FROM documents d
           LEFT JOIN document_chunks c ON c.document_id = d.id
          GROUP BY d.id
          ORDER BY d.id DESC`
    );
    return rows;
}

async function deleteDocument(id) {
    // Chunks go with it: document_chunks.document_id is ON DELETE CASCADE.
    const { rowCount } = await pool.query('DELETE FROM documents WHERE id = $1', [id]);
    return rowCount > 0;
}

module.exports = {
    chunkText,
    ingestDocument,
    searchChunks,
    listDocuments,
    deleteDocument,
    CHUNK_SIZE,
    CHUNK_OVERLAP,
    MAX_CHUNKS_PER_DOCUMENT,
};
