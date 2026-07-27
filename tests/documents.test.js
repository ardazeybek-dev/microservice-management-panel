const {
    app,
    pool,
    request,
    createUserAndLogin,
    resetPermissions,
    auth,
} = require('./helpers');

const { chunkText } = require('../src/services/document.service');
const { getEmbeddingProvider, localProvider, DIMENSIONS } = require('../src/services/embedding.service');

let curator; // School: documents:read + documents:write
let reader; // Student: documents:read only

beforeAll(async () => {
    await resetPermissions();
    curator = await createUserAndLogin('School');
    reader = await createUserAndLogin('Student');
});

beforeEach(async () => {
    // documents cascades into document_chunks.
    await pool.query('DELETE FROM documents');
});

afterAll(async () => {
    await pool.end();
});

describe('embedding provider', () => {
    it('uses the offline provider in tests, with the column dimensions', () => {
        const provider = getEmbeddingProvider();
        expect(provider.name).toBe(localProvider.name);
        expect(provider.dimensions).toBe(DIMENSIONS);
        expect(provider.isSemantic).toBe(false);
    });

    it('is deterministic and unit length', async () => {
        const [a] = await localProvider.embedDocuments(['the quick brown fox']);
        const [b] = await localProvider.embedDocuments(['the quick brown fox']);

        expect(a).toEqual(b);
        expect(a).toHaveLength(DIMENSIONS);

        const norm = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
        expect(norm).toBeCloseTo(1, 6);
    });

    it('gives an empty string a usable vector rather than a zero one', async () => {
        const [vector] = await localProvider.embedDocuments(['']);
        const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
        // Cosine distance against a zero vector is undefined, and pgvector
        // would happily store one.
        expect(norm).toBeCloseTo(1, 6);
    });
});

describe('chunkText', () => {
    it('returns a short document as a single chunk', () => {
        expect(chunkText('short enough to stay whole')).toEqual(['short enough to stay whole']);
    });

    it('returns nothing for whitespace', () => {
        expect(chunkText('   \n\n  ')).toEqual([]);
    });

    it('splits a long document and overlaps the pieces', () => {
        const sentence = 'Kayit sistemi belgeleri yetki matrisini aciklar. ';
        const chunks = chunkText(sentence.repeat(80), { size: 400, overlap: 100 });

        expect(chunks.length).toBeGreaterThan(1);
        for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(400);

        // The overlap exists so a sentence spanning a boundary stays findable;
        // consecutive chunks must therefore share some text.
        const tail = chunks[0].slice(-50);
        expect(chunks[1].includes(tail.trim().split(' ').slice(-3).join(' '))).toBe(true);
    });

    it('terminates on text with no natural boundaries', () => {
        const chunks = chunkText('x'.repeat(5000), { size: 500, overlap: 100 });
        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.join('').length).toBeGreaterThanOrEqual(5000 - chunks.length * 100);
    });
});

describe('POST /documents', () => {
    it('stores the document, its chunks and the model that embedded them', async () => {
        const res = await request(app)
            .post('/documents')
            .set(auth(curator.token))
            .send({ title: 'Permission guide', content: 'A short note about the permission matrix.' });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ title: 'Permission guide', chunks: 1 });
        expect(res.body.embeddingModel).toBe(localProvider.name);

        const { rows } = await pool.query(
            'SELECT chunk_index, embedding_model, vector_dims(embedding) AS dims FROM document_chunks WHERE document_id = $1',
            [res.body.id]
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].dims).toBe(DIMENSIONS);
        expect(rows[0].embedding_model).toBe(localProvider.name);
    });

    it('splits a long document into several chunks', async () => {
        const content = 'Yetki matrisi rolleri ve izinleri iliskilendirir. '.repeat(120);

        const res = await request(app)
            .post('/documents')
            .set(auth(curator.token))
            .send({ title: 'Long guide', content });

        expect(res.status).toBe(201);
        expect(res.body.chunks).toBeGreaterThan(1);

        const { rows } = await pool.query(
            'SELECT COUNT(*)::int AS total FROM document_chunks WHERE document_id = $1',
            [res.body.id]
        );
        expect(rows[0].total).toBe(res.body.chunks);
    });

    it.each([
        ['no title', { content: 'text' }],
        ['blank title', { title: '   ', content: 'text' }],
        ['no content', { title: 'Title' }],
        ['blank content', { title: 'Title', content: '   ' }],
    ])('rejects %s with 400', async (_label, body) => {
        const res = await request(app).post('/documents').set(auth(curator.token)).send(body);
        expect(res.status).toBe(400);
    });

    it('leaves nothing behind when ingestion fails', async () => {
        const before = await pool.query('SELECT COUNT(*)::int AS total FROM documents');

        const res = await request(app)
            .post('/documents')
            .set(auth(curator.token))
            .send({ title: 'Empty', content: '\n\n\n' });

        expect(res.status).toBe(400);
        const after = await pool.query('SELECT COUNT(*)::int AS total FROM documents');
        expect(after.rows[0].total).toBe(before.rows[0].total);
    });

    it('refuses a reader without documents:write', async () => {
        const res = await request(app)
            .post('/documents')
            .set(auth(reader.token))
            .send({ title: 'Nope', content: 'text' });

        expect(res.status).toBe(403);
        expect(res.body.required).toBe('documents:write');
    });

    it('refuses an anonymous caller', async () => {
        const res = await request(app).post('/documents').send({ title: 'Nope', content: 'text' });
        expect(res.status).toBe(401);
    });
});

describe('POST /documents/search', () => {
    beforeEach(async () => {
        const documents = [
            { title: 'RabbitMQ', content: 'The broker delivers messages through task_queue with a correlation id.' },
            { title: 'Permissions', content: 'A supervisor edits the permission matrix and revokes a role permission.' },
            { title: 'Backups', content: 'Nightly database backups are written to cold storage every evening.' },
        ];
        for (const document of documents) {
            await request(app).post('/documents').set(auth(curator.token)).send(document);
        }
    });

    it('ranks the passage that shares the question wording first', async () => {
        const res = await request(app)
            .post('/documents/search')
            .set(auth(reader.token))
            .send({ query: 'who revokes a role permission' });

        expect(res.status).toBe(200);
        expect(res.body.matches.length).toBeGreaterThan(0);
        expect(res.body.matches[0].documentTitle).toBe('Permissions');
        expect(res.body.matches[0].similarity).toBeGreaterThan(0);
        expect(res.body.embeddingModel).toBe(localProvider.name);
    });

    it('orders results by descending similarity', async () => {
        const res = await request(app)
            .post('/documents/search')
            .set(auth(reader.token))
            .send({ query: 'message broker correlation id' });

        const scores = res.body.matches.map((match) => match.similarity);
        expect(scores).toEqual([...scores].sort((a, b) => b - a));
    });

    it('honours the limit and caps it', async () => {
        const one = await request(app)
            .post('/documents/search')
            .set(auth(reader.token))
            .send({ query: 'backups', limit: 1 });
        expect(one.body.matches).toHaveLength(1);

        const capped = await request(app)
            .post('/documents/search')
            .set(auth(reader.token))
            .send({ query: 'backups', limit: 9999 });
        expect(capped.body.matches.length).toBeLessThanOrEqual(20);
    });

    it('ignores chunks embedded by a different model', async () => {
        // Vectors from another model occupy an unrelated space; including them
        // would not rank them badly, it would rank them arbitrarily.
        await pool.query("UPDATE document_chunks SET embedding_model = 'some-other-model'");

        const res = await request(app)
            .post('/documents/search')
            .set(auth(reader.token))
            .send({ query: 'permission matrix' });

        expect(res.status).toBe(200);
        expect(res.body.matches).toEqual([]);
    });

    it('rejects an empty query with 400', async () => {
        const res = await request(app)
            .post('/documents/search')
            .set(auth(reader.token))
            .send({ query: '   ' });
        expect(res.status).toBe(400);
    });
});

describe('POST /documents/ask', () => {
    it('reports nothing indexed rather than failing', async () => {
        const res = await request(app)
            .post('/documents/ask')
            .set(auth(reader.token))
            .send({ question: 'anything at all' });

        expect(res.status).toBe(200);
        expect(res.body.answer).toBeNull();
        expect(res.body.sources).toEqual([]);
    });

    it('still retrieves when generation is unavailable', async () => {
        await request(app)
            .post('/documents')
            .set(auth(curator.token))
            .send({ title: 'Guide', content: 'The supervisor revokes a permission from the matrix.' });

        const res = await request(app)
            .post('/documents/ask')
            .set(auth(reader.token))
            .send({ question: 'how is a permission revoked' });

        // No GEMINI_API_KEY in tests: retrieval succeeded, only the generation
        // half is missing, and the response has to say which.
        expect(res.status).toBe(503);
        expect(res.body.sources.length).toBeGreaterThan(0);
        expect(res.body.sources[0].content).toContain('supervisor');
    });

    it('refuses a caller without documents:read', async () => {
        const outsider = await createUserAndLogin('Supervisor');
        await pool.query(
            `DELETE FROM role_permissions
              WHERE role_id = (SELECT id FROM roles WHERE name = 'Supervisor')
                AND permission_id = (SELECT id FROM permissions WHERE code = 'documents:read')`
        );
        const { invalidateAllRoles } = require('./helpers');
        await invalidateAllRoles();

        const res = await request(app)
            .post('/documents/ask')
            .set(auth(outsider.token))
            .send({ question: 'anything' });

        expect(res.status).toBe(403);
        expect(res.body.required).toBe('documents:read');

        await resetPermissions();
    });
});

describe('DELETE /documents/:id', () => {
    it('removes the document and its chunks', async () => {
        const created = await request(app)
            .post('/documents')
            .set(auth(curator.token))
            .send({ title: 'Temporary', content: 'This document will not be kept.' });

        const res = await request(app)
            .delete(`/documents/${created.body.id}`)
            .set(auth(curator.token));
        expect(res.status).toBe(204);

        const { rows } = await pool.query(
            'SELECT COUNT(*)::int AS total FROM document_chunks WHERE document_id = $1',
            [created.body.id]
        );
        expect(rows[0].total).toBe(0);
    });

    it('404s on an unknown id', async () => {
        const res = await request(app).delete('/documents/999999').set(auth(curator.token));
        expect(res.status).toBe(404);
    });

    it('refuses a reader', async () => {
        const created = await request(app)
            .post('/documents')
            .set(auth(curator.token))
            .send({ title: 'Kept', content: 'A reader must not be able to delete this.' });

        const res = await request(app)
            .delete(`/documents/${created.body.id}`)
            .set(auth(reader.token));
        expect(res.status).toBe(403);
    });
});

describe('GET /documents', () => {
    it('lists documents with chunk counts and the active embedding model', async () => {
        await request(app)
            .post('/documents')
            .set(auth(curator.token))
            .send({ title: 'Listed', content: 'A document that should appear in the listing.' });

        const res = await request(app).get('/documents').set(auth(reader.token));

        expect(res.status).toBe(200);
        expect(res.body.embedding).toMatchObject({
            model: localProvider.name,
            dimensions: DIMENSIONS,
            semantic: false,
        });
        expect(res.body.documents[0]).toMatchObject({ title: 'Listed', chunks: 1 });
    });
});
