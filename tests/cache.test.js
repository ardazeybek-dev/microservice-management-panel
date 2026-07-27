const {
    app,
    pool,
    request,
    createUserAndLogin,
    bootstrapSupervisorToken,
    resetPermissions,
    getRoleId,
    auth,
} = require('./helpers');

const {
    getPermissionsForRole,
    setRolePermissions,
    cacheKey,
} = require('../src/services/permission.service');
const { cacheGet, isConfigured, isReady } = require('../src/config/redis');

// Nothing here is meaningful without a cache to test. The suite still runs
// without Redis — every other file covers the uncached path.
const describeCache = isConfigured() ? describe : describe.skip;

afterAll(async () => {
    await pool.end();
});

describeCache('permission cache', () => {
    beforeEach(async () => {
        await resetPermissions();
    });

    it('is actually connected, so the rest of this file means something', () => {
        expect(isReady()).toBe(true);
    });

    it('populates the cache on the first read and serves the second from it', async () => {
        const roleId = await getRoleId('Student');

        expect(await cacheGet(cacheKey(roleId))).toBeNull();

        const first = await getPermissionsForRole(roleId);
        expect(first.sort()).toEqual(['ai:analyze', 'records:read']);

        const cached = await cacheGet(cacheKey(roleId));
        expect(cached).not.toBeNull();
        expect(JSON.parse(cached).sort()).toEqual(['ai:analyze', 'records:read']);

        expect((await getPermissionsForRole(roleId)).sort()).toEqual(first.sort());
    });

    it('serves a cached read without querying PostgreSQL', async () => {
        const roleId = await getRoleId('School');
        await getPermissionsForRole(roleId); // warm

        const spy = jest.spyOn(pool, 'query');
        try {
            await getPermissionsForRole(roleId);
            expect(spy).not.toHaveBeenCalled();
        } finally {
            spy.mockRestore();
        }
    });

    it('drops the key when the role is updated', async () => {
        const roleId = await getRoleId('Company');
        await getPermissionsForRole(roleId);
        expect(await cacheGet(cacheKey(roleId))).not.toBeNull();

        await setRolePermissions(roleId, ['records:read']);

        expect(await cacheGet(cacheKey(roleId))).toBeNull();
        expect(await getPermissionsForRole(roleId)).toEqual(['records:read']);
    });

    it('leaves other roles alone when one is updated', async () => {
        const studentId = await getRoleId('Student');
        const schoolId = await getRoleId('School');

        await getPermissionsForRole(studentId);
        await getPermissionsForRole(schoolId);

        await setRolePermissions(schoolId, ['records:read']);

        // Over-invalidating would only cost a query, but a cache that clears
        // everything on every write is not a cache.
        expect(await cacheGet(cacheKey(studentId))).not.toBeNull();
        expect(await cacheGet(cacheKey(schoolId))).toBeNull();
    });

    // The guarantee the whole panel is sold on, now with a cache in the way.
    it('still applies a revoked permission to the very next request', async () => {
        const adminToken = await bootstrapSupervisorToken();
        const student = await createUserAndLogin('Student');
        const roleId = await getRoleId('Student');

        const before = await request(app).get('/records').set(auth(student.token));
        expect(before.status).toBe(200);

        await request(app)
            .put(`/admin/permissions/${roleId}`)
            .set(auth(adminToken))
            .send({ permissions: ['ai:analyze'] });

        // Same token, no re-login, immediately after the write.
        const after = await request(app).get('/records').set(auth(student.token));
        expect(after.status).toBe(403);
        expect(after.body.required).toBe('records:read');
    });

    it('grants take effect on the next request too', async () => {
        const adminToken = await bootstrapSupervisorToken();
        const student = await createUserAndLogin('Student');
        const roleId = await getRoleId('Student');

        const before = await request(app).get('/rpc-test').set(auth(student.token));
        expect(before.status).toBe(403);

        await request(app)
            .put(`/admin/permissions/${roleId}`)
            .set(auth(adminToken))
            .send({ permissions: ['records:read', 'ai:analyze', 'rpc:execute'] });

        // 503 rather than 200: the broker is deliberately unreachable in tests.
        // What matters is that it is no longer 403 — the gate opened.
        const after = await request(app).get('/rpc-test').set(auth(student.token));
        expect(after.status).not.toBe(403);
    });

    it('falls back to PostgreSQL when a cached entry is corrupt', async () => {
        const roleId = await getRoleId('Student');
        const { cacheSet } = require('../src/config/redis');

        await cacheSet(cacheKey(roleId), 'not-json-at-all', 60);

        expect((await getPermissionsForRole(roleId)).sort()).toEqual(['ai:analyze', 'records:read']);
        // The bad entry is replaced rather than left to keep failing.
        expect(JSON.parse(await cacheGet(cacheKey(roleId))).sort())
            .toEqual(['ai:analyze', 'records:read']);
    });
});
