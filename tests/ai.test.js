const { app, pool, request, createUserAndLogin, resetPermissions, auth } = require('./helpers');

let supervisor;
let student;
const originalKey = process.env.GEMINI_API_KEY;

beforeAll(async () => {
    await resetPermissions();
    supervisor = await createUserAndLogin('Supervisor');
    student = await createUserAndLogin('Student');
});

afterAll(async () => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    await pool.end();
});

const txt = (content = 'Some text to summarize.') => Buffer.from(content, 'utf-8');

describe('POST /ai-analyze — access control', () => {
    it('requires a token', async () => {
        const res = await request(app).post('/ai-analyze').attach('document', txt(), 'a.txt');
        expect(res.status).toBe(401);
    });

    it('is reachable by a Student, who holds ai:analyze', async () => {
        // Reaches the handler rather than being rejected at the permission gate.
        const res = await request(app).post('/ai-analyze')
            .set(auth(student.token))
            .attach('document', txt(), 'a.txt');

        expect(res.status).not.toBe(403);
    });

    it('is refused once ai:analyze is revoked', async () => {
        const { rows } = await pool.query("SELECT id FROM roles WHERE name = 'Student'");
        await request(app)
            .put(`/admin/permissions/${rows[0].id}`)
            .set(auth(supervisor.token))
            .send({ permissions: ['records:read'] });

        const res = await request(app).post('/ai-analyze')
            .set(auth(student.token))
            .attach('document', txt(), 'a.txt');

        expect(res.status).toBe(403);
        await resetPermissions();
    });
});

describe('POST /ai-analyze — input validation', () => {
    beforeEach(() => {
        process.env.GEMINI_API_KEY = 'fake-key-for-validation-tests';
    });

    it('rejects a request with no file attached', async () => {
        const res = await request(app).post('/ai-analyze').set(auth(supervisor.token));
        expect(res.status).toBe(400);
    });

    it('rejects a non-.txt file', async () => {
        const res = await request(app).post('/ai-analyze')
            .set(auth(supervisor.token))
            .attach('document', Buffer.from('%PDF-1.4'), 'report.pdf');

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/\.txt/i);
    });

    it('rejects a file larger than the 2 MB limit', async () => {
        const tooBig = Buffer.alloc(3 * 1024 * 1024, 'a');
        const res = await request(app).post('/ai-analyze')
            .set(auth(supervisor.token))
            .attach('document', tooBig, 'big.txt');

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/too large/i);
    });

    it('rejects an empty file before calling the AI provider', async () => {
        const res = await request(app).post('/ai-analyze')
            .set(auth(supervisor.token))
            .attach('document', txt('   \n  '), 'blank.txt');

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/empty/i);
    });
});

describe('POST /ai-analyze — provider configuration', () => {
    it('answers 503 when GEMINI_API_KEY is not configured', async () => {
        delete process.env.GEMINI_API_KEY;

        const res = await request(app).post('/ai-analyze')
            .set(auth(supervisor.token))
            .attach('document', txt(), 'a.txt');

        expect(res.status).toBe(503);
        expect(res.body.error).toMatch(/GEMINI_API_KEY/);
    });
});

describe('error handler', () => {
    it('never leaks internal error details to the client', async () => {
        process.env.GEMINI_API_KEY = 'invalid-key-that-will-be-rejected';

        const res = await request(app).post('/ai-analyze')
            .set(auth(supervisor.token))
            .attach('document', txt(), 'a.txt');

        // Whatever the provider said, the client gets a generic message.
        if (res.status === 500) {
            expect(res.body.error).toBe('An unexpected server error occurred.');
            expect(JSON.stringify(res.body)).not.toMatch(/api[_-]?key/i);
        }
    });
});
