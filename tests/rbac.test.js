const {
    app, pool, request, createUserAndLogin, resetPermissions, getRoleId, auth,
} = require('./helpers');

let supervisor;
let student;

beforeAll(async () => {
    supervisor = await createUserAndLogin('Supervisor');
    student = await createUserAndLogin('Student');
});

beforeEach(async () => {
    await resetPermissions();
});

afterAll(async () => {
    await resetPermissions();
    await pool.end();
});

describe('permission enforcement', () => {
    it('allows a Student to read records', async () => {
        const res = await request(app).get('/records').set(auth(student.token));
        expect(res.status).toBe(200);
    });

    it('blocks a Student from writing records and names the missing permission', async () => {
        const res = await request(app).post('/records')
            .set(auth(student.token))
            .send({ data: { attempt: 'denied' } });

        expect(res.status).toBe(403);
        expect(res.body.required).toBe('records:write');
    });

    it('blocks a Student from the admin panel', async () => {
        const res = await request(app).get('/admin/permissions').set(auth(student.token));
        expect(res.status).toBe(403);
    });

    it('allows a Supervisor everything', async () => {
        const [records, admin, users] = await Promise.all([
            request(app).get('/records').set(auth(supervisor.token)),
            request(app).get('/admin/permissions').set(auth(supervisor.token)),
            request(app).get('/admin/users').set(auth(supervisor.token)),
        ]);

        expect(records.status).toBe(200);
        expect(admin.status).toBe(200);
        expect(users.status).toBe(200);
    });

    it.each([
        ['/records', 'get'],
        ['/admin/permissions', 'get'],
        ['/admin/users', 'get'],
        ['/rpc-test', 'get'],
    ])('requires a token for %s', async (route, method) => {
        const res = await request(app)[method](route);
        expect(res.status).toBe(401);
    });
});

describe('dynamic permissions', () => {
    /**
     * The whole point of storing permissions in the database: a change must
     * take effect immediately, on a token that was issued before the change.
     */
    it('grants access mid-session without re-issuing the token', async () => {
        const studentRoleId = await getRoleId('Student');

        const before = await request(app).post('/records')
            .set(auth(student.token)).send({ data: { phase: 'before' } });
        expect(before.status).toBe(403);

        const granted = await request(app)
            .put(`/admin/permissions/${studentRoleId}`)
            .set(auth(supervisor.token))
            .send({ permissions: ['records:read', 'ai:analyze', 'records:write'] });
        expect(granted.status).toBe(200);

        // Same token as before — only the stored permissions changed.
        const after = await request(app).post('/records')
            .set(auth(student.token)).send({ data: { phase: 'after' } });
        expect(after.status).toBe(201);
    });

    it('revokes access mid-session just as fast', async () => {
        const studentRoleId = await getRoleId('Student');

        expect((await request(app).get('/records').set(auth(student.token))).status).toBe(200);

        await request(app)
            .put(`/admin/permissions/${studentRoleId}`)
            .set(auth(supervisor.token))
            .send({ permissions: [] });

        expect((await request(app).get('/records').set(auth(student.token))).status).toBe(403);
    });

    it('reflects the change in /auth/me', async () => {
        const studentRoleId = await getRoleId('Student');

        await request(app)
            .put(`/admin/permissions/${studentRoleId}`)
            .set(auth(supervisor.token))
            .send({ permissions: ['records:read'] });

        const me = await request(app).get('/auth/me').set(auth(student.token));
        expect(me.body.permissions).toEqual(['records:read']);
    });
});
