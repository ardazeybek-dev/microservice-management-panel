# CLAUDE.md

This file guides Claude Code (claude.ai/code) when working in this repository.

## Project

Full-stack microservice project: JWT authentication with server-enforced dynamic RBAC, RabbitMQ RPC,
PostgreSQL logging (JSONB + trigger/procedure), Gemini document analysis, and an optional Redis cache
in front of the permission lookup.

## Structure

- **index.js** — entry point. Connects PostgreSQL (required), RabbitMQ and Redis (both optional),
  then starts the server on `PORT` (default 3006).
- **src/app.js** — builds the Express app without binding a port, so tests drive it via Supertest.
- **src/middleware/auth.js** — `authenticate()` and `requirePermission(code)`.
- **src/routes/** — `auth` · `records` · `ai` · `rpc` · `admin`.
- **src/services/permission.service.js** — permission reads/writes and cache invalidation.
- **src/config/** — `db.js`, `rabbitmq.js`, `redis.js`.
- **db/schema.sql** — the schema, idempotent. Source of truth.
- **scripts/setup-db.js** — applies the schema, seeds the first Supervisor (`npm run setup-db`).
- **tests/** — integration suite against a real PostgreSQL; `globalSetup` builds a throwaway
  `*_test` database and refuses to run against anything else.
- **frontend/** — Next.js panel: `src/lib/` (api client, auth context), `src/app/login/`,
  `src/components/` (permission-gated cards).
- **docker-compose.yml** — postgres_db, rabbitmq, redis, backend, frontend.

## Running

- Docker: `docker-compose up --build`
- Local backend: `npm install && npm run setup-db && npm start`
- Local frontend: `cd frontend && npm install && npm run dev`
- Tests: `npm test`, or `TEST_REDIS_URL=redis://localhost:6379/15 npm test` to run them with the cache

## Rules

- **No secrets in code.** DB credentials, `JWT_SECRET`, `GEMINI_API_KEY`, `RABBITMQ_URL` and
  `REDIS_URL` are always read from `.env`. When adding a variable, update `.env.example` too.
- The frontend gets the backend address from `process.env.NEXT_PUBLIC_API_URL`; never hard-code it.
  It is read independently of the backend's `PORT` — changing one means changing both.
- User files under `uploads/` are not committed (see `.gitignore`).

### Authorization

- Permissions are rows in `permissions` / `role_permissions`, never constants in code. Adding a
  permission means adding it to `db/schema.sql`.
- `requirePermission` resolves permissions per request, so an edit applies to the caller's next
  call without re-issuing tokens. **Do not cache in a way that breaks this.** Anything writing
  `role_permissions` outside `setRolePermissions` must call `invalidateRole(roleId)` — including
  test helpers and any future migration or seed script.
- `POST /auth/register` requires `users:write`. It takes the role from the request body, so leaving
  it unauthenticated would let anyone create a Supervisor. The first Supervisor comes from
  `setup-db` and `SEED_ADMIN_*`; there is intentionally no bootstrap path through the API.

### Dependencies

After adding a package, run **`npm run lock:refresh`**, not just `npm install`.

An incremental `npm install` on Windows prunes the wasm32-wasi optional packages (`@emnapi/*`) from
the lock while leaving `@napi-rs/wasm-runtime`'s dependency on them, which is invisible locally and
breaks `npm ci` on Linux — CI fails at its first step with `EUSAGE ... Missing from lock file`. This
has already happened twice.
