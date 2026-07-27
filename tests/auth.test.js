const jwt = require('jsonwebtoken');
const { app, pool, request, uniqueEmail, createUserAndLogin, auth, PASSWORD } = require('./helpers');

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
    it('creates a user and never returns the password', async () => {
        const email = uniqueEmail('new');
        const res = await request(app)
            .post('/auth/register')
            .send({ email, password: PASSWORD, role: 'Student' });

        expect(res.status).toBe(201);
        expect(res.body.user).toMatchObject({ email, role: 'Student' });
        expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
        expect(JSON.stringify(res.body)).not.toContain('password_hash');
    });

    it('stores the password as a bcrypt hash, not plain text', async () => {
        const email = uniqueEmail('hashed');
        await request(app).post('/auth/register').send({ email, password: PASSWORD, role: 'Student' });

        const { rows } = await pool.query('SELECT password_hash FROM users WHERE email = $1', [email]);
        expect(rows[0].password_hash).not.toBe(PASSWORD);
        expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/); // bcrypt prefix
    });

    it('lowercases the email so casing cannot create duplicates', async () => {
        const email = uniqueEmail('Case');
        await request(app).post('/auth/register')
            .send({ email: email.toUpperCase(), password: PASSWORD, role: 'Student' });

        const duplicate = await request(app).post('/auth/register')
            .send({ email: email.toLowerCase(), password: PASSWORD, role: 'Student' });

        expect(duplicate.status).toBe(409);
    });

    it.each([
        ['missing fields', { email: 'a@b.test' }],
        ['malformed email', { email: 'not-an-email', password: PASSWORD, role: 'Student' }],
        ['short password', { email: 'short@b.test', password: 'abc', role: 'Student' }],
        ['unknown role', { email: 'role@b.test', password: PASSWORD, role: 'Wizard' }],
    ])('rejects %s with 400', async (_label, body) => {
        const res = await request(app).post('/auth/register').send(body);
        expect(res.status).toBe(400);
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
