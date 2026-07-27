const { app, pool, request, createUserAndLogin, resetPermissions, auth } = require('./helpers');

let supervisor;

beforeAll(async () => {
    await resetPermissions();
    supervisor = await createUserAndLogin('Supervisor');
});

afterAll(async () => {
    await pool.end();
});

describe('POST /records', () => {
    it('stores a JSON document and attributes it to the caller', async () => {
        const res = await request(app).post('/records')
            .set(auth(supervisor.token))
            .send({ data: { operation: 'upload', status: 'ok' } });

        expect(res.status).toBe(201);
        expect(res.body.data).toEqual({ operation: 'upload', status: 'ok' });
        expect(res.body.created_by).toBe(supervisor.id);
    });

    it.each([
        ['no data field', {}],
        ['a string instead of an object', { data: 'not-an-object' }],
        ['null data', { data: null }],
    ])('rejects %s with 400', async (_label, body) => {
        const res = await request(app).post('/records').set(auth(supervisor.token)).send(body);
        expect(res.status).toBe(400);
    });

    it('fires the audit trigger for every insert', async () => {
        const before = await pool.query('SELECT COUNT(*)::int AS n FROM audit_logs');

        const created = await request(app).post('/records')
            .set(auth(supervisor.token))
            .send({ data: { audited: true } });

        const after = await pool.query('SELECT COUNT(*)::int AS n FROM audit_logs');
        expect(after.rows[0].n).toBe(before.rows[0].n + 1);

        const { rows } = await pool.query(
            'SELECT event_type, description FROM audit_logs ORDER BY id DESC LIMIT 1'
        );
        expect(rows[0].event_type).toBe('NEW_RECORD');
        expect(rows[0].description).toContain(String(created.body.id));
    });
});

describe('GET /records', () => {
    it('returns a paginated envelope, newest first', async () => {
        for (const n of [1, 2, 3]) {
            await request(app).post('/records').set(auth(supervisor.token)).send({ data: { seq: n } });
        }

        const res = await request(app).get('/records?limit=2').set(auth(supervisor.token));

        expect(res.status).toBe(200);
        expect(res.body.limit).toBe(2);
        expect(res.body.items).toHaveLength(2);
        expect(typeof res.body.total).toBe('number');
        expect(res.body.items[0].id).toBeGreaterThan(res.body.items[1].id);
    });

    it('honours offset', async () => {
        const first = await request(app).get('/records?limit=1&offset=0').set(auth(supervisor.token));
        const second = await request(app).get('/records?limit=1&offset=1').set(auth(supervisor.token));

        expect(first.body.items[0].id).not.toBe(second.body.items[0].id);
    });

    it('caps limit so a client cannot request the whole table', async () => {
        const res = await request(app).get('/records?limit=99999').set(auth(supervisor.token));
        expect(res.body.limit).toBe(200);
    });

    it('falls back to defaults for nonsense pagination values', async () => {
        const res = await request(app).get('/records?limit=abc&offset=-50').set(auth(supervisor.token));
        expect(res.status).toBe(200);
        expect(res.body.limit).toBe(50);
        expect(res.body.offset).toBe(0);
    });
});

describe('unknown routes', () => {
    it('returns a 404 payload rather than HTML', async () => {
        const res = await request(app).get('/no-such-route');
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/not found/i);
    });
});

describe('GET /rpc-test', () => {
    it('answers 503 when the broker is unavailable instead of hanging', async () => {
        // No RabbitMQ connection is opened in tests, so getChannel() is null.
        const res = await request(app).get('/rpc-test').set(auth(supervisor.token));
        expect(res.status).toBe(503);
    });
});
