const {
    app, pool, request, createUserAndLogin, resetPermissions, getRoleId, auth,
} = require('./helpers');

let supervisor;

beforeAll(async () => {
    supervisor = await createUserAndLogin('Supervisor');
});

beforeEach(async () => {
    await resetPermissions();
});

afterAll(async () => {
    await resetPermissions();
    await pool.end();
});

describe('GET /admin/permissions', () => {
    it('returns every role with its permissions and the available codes', async () => {
        const res = await request(app).get('/admin/permissions').set(auth(supervisor.token));

        expect(res.status).toBe(200);
        expect(res.body.roles.map((r) => r.role_name).sort())
            .toEqual(['Company', 'School', 'Student', 'Supervisor']);

        const student = res.body.roles.find((r) => r.role_name === 'Student');
        expect(student.permissions.sort()).toEqual(['ai:analyze', 'documents:read', 'records:read']);

        expect(res.body.availablePermissions.map((p) => p.code))
            .toEqual(expect.arrayContaining(['records:read', 'permissions:manage']));
    });
});

describe('PUT /admin/permissions/:roleId', () => {
    it('replaces a role permission set', async () => {
        const roleId = await getRoleId('Company');
        const res = await request(app)
            .put(`/admin/permissions/${roleId}`)
            .set(auth(supervisor.token))
            .send({ permissions: ['records:read'] });

        expect(res.status).toBe(200);

        const { rows } = await pool.query(
            `SELECT p.code FROM permissions p
               JOIN role_permissions rp ON rp.permission_id = p.id
              WHERE rp.role_id = $1`,
            [roleId]
        );
        expect(rows.map((r) => r.code)).toEqual(['records:read']);
    });

    it('accepts an empty array as "revoke everything"', async () => {
        const roleId = await getRoleId('Company');
        const res = await request(app)
            .put(`/admin/permissions/${roleId}`)
            .set(auth(supervisor.token))
            .send({ permissions: [] });

        expect(res.status).toBe(200);
    });

    it('rejects unknown permission codes instead of silently dropping them', async () => {
        const roleId = await getRoleId('Student');
        const res = await request(app)
            .put(`/admin/permissions/${roleId}`)
            .set(auth(supervisor.token))
            .send({ permissions: ['records:read', 'made:up'] });

        expect(res.status).toBe(400);
        expect(res.body.unknown).toEqual(['made:up']);
    });

    it('leaves existing permissions untouched when the request is rejected', async () => {
        const roleId = await getRoleId('Student');

        const codesFor = async () => {
            const { rows } = await pool.query(
                `SELECT p.code FROM permissions p
                   JOIN role_permissions rp ON rp.permission_id = p.id
                  WHERE rp.role_id = $1 ORDER BY p.code`,
                [roleId]
            );
            return rows.map((row) => row.code);
        };

        // Compared against itself rather than a hard-coded count: the point is
        // that a rejected write changes nothing, which stays true whatever the
        // baseline happens to be.
        const before = await codesFor();

        await request(app)
            .put(`/admin/permissions/${roleId}`)
            .set(auth(supervisor.token))
            .send({ permissions: ['made:up'] });

        expect(await codesFor()).toEqual(before);
        expect(before.length).toBeGreaterThan(0);
    });

    it('refuses to strip permissions:manage from Supervisor', async () => {
        const roleId = await getRoleId('Supervisor');
        const res = await request(app)
            .put(`/admin/permissions/${roleId}`)
            .set(auth(supervisor.token))
            .send({ permissions: ['records:read'] });

        // Otherwise nobody could ever edit permissions again.
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/lock/i);
    });

    it.each([
        ['a non-numeric role id', 'abc', { permissions: [] }, 400],
        ['a missing permissions array', null, {}, 400],
        ['a non-array permissions value', null, { permissions: 'records:read' }, 400],
    ])('rejects %s', async (_label, rawId, body, expected) => {
        const roleId = rawId ?? (await getRoleId('Student'));
        const res = await request(app)
            .put(`/admin/permissions/${roleId}`)
            .set(auth(supervisor.token))
            .send(body);

        expect(res.status).toBe(expected);
    });

    it('returns 404 for a role that does not exist', async () => {
        const res = await request(app)
            .put('/admin/permissions/999999')
            .set(auth(supervisor.token))
            .send({ permissions: [] });

        expect(res.status).toBe(404);
    });
});

describe('GET /admin/users', () => {
    it('lists users without leaking password hashes', async () => {
        const res = await request(app).get('/admin/users').set(auth(supervisor.token));

        expect(res.status).toBe(200);
        expect(res.body.users.length).toBeGreaterThan(0);
        expect(res.body.users[0]).toHaveProperty('role');

        const serialized = JSON.stringify(res.body);
        expect(serialized).not.toContain('password_hash');
        expect(serialized).not.toContain('$2b$');
    });
});
