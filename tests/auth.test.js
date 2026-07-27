const jwt = require('jsonwebtoken');
const {
    app,
    pool,
    request,
    uniqueEmail,
    createUserAndLogin,
    bootstrapSupervisorToken,
    auth,
    PASSWORD,
} = require('./helpers');

afterAll(async () => {
    await pool.end();
});

describe('GET /health', () => {
    it('reports ok without a token', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: 'ok' });
    });
});

describe('POST /auth/register', () => {
    let adminToken;

    beforeAll(async () => {
        adminToken = await bootstrapSupervisorToken();
    });

    const register = (body, token = adminToken) =>
        request(app).post('/auth/register').set(auth(token)).send(body);

    it('creates a user and never returns the password', async () => {
        const email = uniqueEmail('new');
        const res = await register({ email, password: PASSWORD, role: 'Student' });

        expect(res.status).toBe(201);
        expect(res.body.user).toMatchObject({ email, role: 'Student' });
        expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
        expect(JSON.stringify(res.body)).not.toContain('password_hash');
    });

    it('stores the password as a bcrypt hash, not plain text', async () => {
        const email = uniqueEmail('hashed');
        await register({ email, password: PASSWORD, role: 'Student' });

        const { rows } = await pool.query('SELECT password_hash FROM users WHERE email = $1', [email]);
        expect(rows[0].password_hash).not.toBe(PASSWORD);
        expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/); // bcrypt prefix
    });

    it('lowercases the email so casing cannot create duplicates', async () => {
        const email = uniqueEmail('Case');
        await register({ email: email.toUpperCase(), password: PASSWORD, role: 'Student' });

        const duplicate = await register({ email: email.toLowerCase(), password: PASSWORD, role: 'Student' });

        expect(duplicate.status).toBe(409);
    });

    it.each([
        ['missing fields', { email: 'a@b.test' }],
        ['malformed email', { email: 'not-an-email', password: PASSWORD, role: 'Student' }],
        ['short password', { email: 'short@b.test', password: 'abc', role: 'Student' }],
        ['unknown role', { email: 'role@b.test', password: PASSWORD, role: 'Wizard' }],
    ])('rejects %s with 400', async (_label, body) => {
        const res = await register(body);
        expect(res.status).toBe(400);
    });

    // Registration used to be unauthenticated while still taking the role from
    // the request body, so anyone who could reach the API could hand themselves
    // a Supervisor account and rewrite the permission matrix.
    it('refuses an anonymous caller with 401', async () => {
        const res = await request(app)
            .post('/auth/register')
            .send({ email: uniqueEmail('anon'), password: PASSWORD, role: 'Supervisor' });

        expect(res.status).toBe(401);
    });

    it('refuses a caller without users:write, even for a harmless role', async () => {
        const student = await createUserAndLogin('Student');
        const email = uniqueEmail('escalated');

        const res = await register({ email, password: PASSWORD, role: 'Student' }, student.token);

        expect(res.status).toBe(403);
        expect(res.body.required).toBe('users:write');

        const { rowCount } = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
        expect(rowCount).toBe(0);
    });

    it('does not let a non-admin create a Supervisor', async () => {
        const student = await createUserAndLogin('Student');
        const email = uniqueEmail('selfmade-supervisor');

        const res = await register({ email, password: PASSWORD, role: 'Supervisor' }, student.token);

        expect(res.status).toBe(403);

        const { rowCount } = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
        expect(rowCount).toBe(0);
    });
});

describe('POST /auth/login', () => {
    it('returns a JWT carrying the user id and role', async () => {
        const user = await createUserAndLogin('School');
        const payload = jwt.verify(user.token, process.env.JWT_SECRET);

        expect(payload.sub).toBe(user.id);
        expect(payload.email).toBe(user.email);
        expect(payload.role).toBe('School');
    });

    it('rejects a wrong password with 401', async () => {
        const user = await createUserAndLogin('Student');
        const res = await request(app).post('/auth/login')
            .send({ email: user.email, password: 'WrongPassword123' });

        expect(res.status).toBe(401);
    });

    it('gives the same error for unknown email as for wrong password', async () => {
        const user = await createUserAndLogin('Student');

        const wrongPassword = await request(app).post('/auth/login')
            .send({ email: user.email, password: 'WrongPassword123' });
        const unknownEmail = await request(app).post('/auth/login')
            .send({ email: uniqueEmail('ghost'), password: PASSWORD });

        // Distinguishable errors would let an attacker enumerate accounts.
        expect(unknownEmail.status).toBe(wrongPassword.status);
        expect(unknownEmail.body.error).toBe(wrongPassword.body.error);
    });

    it('refuses a deactivated account', async () => {
        const user = await createUserAndLogin('Student');
        await pool.query('UPDATE users SET is_active = FALSE WHERE email = $1', [user.email]);

        const res = await request(app).post('/auth/login')
            .send({ email: user.email, password: user.password });

        expect(res.status).toBe(403);
    });
});

describe('GET /auth/me', () => {
    it('returns the caller identity and permissions', async () => {
        const user = await createUserAndLogin('Student');
        const res = await request(app).get('/auth/me').set(auth(user.token));

        expect(res.status).toBe(200);
        expect(res.body.email).toBe(user.email);
        expect(res.body.role).toBe('Student');
        expect(res.body.permissions).toEqual(
            expect.arrayContaining(['records:read', 'ai:analyze'])
        );
        expect(res.body.permissions).not.toContain('permissions:manage');
    });

    it.each([
        ['no header', undefined],
        ['wrong scheme', 'Basic abc123'],
        ['garbage token', 'Bearer not.a.jwt'],
    ])('rejects %s with 401', async (_label, header) => {
        const req = request(app).get('/auth/me');
        if (header) req.set('Authorization', header);
        expect((await req).status).toBe(401);
    });

    it('rejects an expired token', async () => {
        const user = await createUserAndLogin('Student');
        const payload = jwt.verify(user.token, process.env.JWT_SECRET);
        const expired = jwt.sign(
            { sub: payload.sub, email: payload.email, roleId: payload.roleId, role: payload.role },
            process.env.JWT_SECRET,
            { expiresIn: '-1s' }
        );

        const res = await request(app).get('/auth/me').set(auth(expired));
        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/expired/i);
    });

    it('rejects a token signed with a different secret', async () => {
        const forged = jwt.sign({ sub: 1, email: 'a@b.test', roleId: 1, role: 'Supervisor' }, 'attacker-secret');
        const res = await request(app).get('/auth/me').set(auth(forged));
        expect(res.status).toBe(401);
    });
});
