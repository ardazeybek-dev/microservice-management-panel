# 🚀 AI-Integrated Microservice Management Panel

[![CI](https://github.com/ardazeybek-dev/microservice-management-panel/actions/workflows/ci.yml/badge.svg)](https://github.com/ardazeybek-dev/microservice-management-panel/actions/workflows/ci.yml)

A full-stack demo system built around asynchronous service communication: RabbitMQ (async publish +
RPC request/reply), PostgreSQL logging with JSONB and a trigger/procedure, document analysis powered
by Google Gemini, and a Next.js panel whose every screen is gated by permissions the server actually
enforces.

## 🛠 Tech Stack

| Layer          | Technology                             |
|----------------|----------------------------------------|
| Frontend       | Next.js (React + TailwindCSS)          |
| Backend        | Node.js + Express                      |
| Database       | PostgreSQL (JSONB, triggers, procedures) |
| Message Broker | RabbitMQ (async + RPC)                 |
| Cache          | Redis (optional)                       |
| AI             | Google Gemini (file analysis)          |
| Containers     | Docker & Docker Compose                |

## 🌟 Features

- **Authentication & dynamic RBAC:** JWT + bcrypt login, with permissions stored in
  `role_permissions` rather than hard-coded. Every guarded route resolves the caller's permissions
  from the database on each request, so a Supervisor granting or revoking a permission through
  `PUT /admin/permissions/:roleId` takes effect on the very next call — the user does not need to log
  in again.
- **RabbitMQ + RPC:** `GET /rpc-test` publishes a message to `task_queue` with a `replyTo` queue and a
  `correlationId`, then waits for the consumer's reply — a full request/reply round trip.
- **PostgreSQL:** Records are stored in a `JSONB` column; an `AFTER INSERT` trigger calls a `plpgsql`
  procedure that writes an audit row automatically.
- **Gemini AI:** An uploaded `.txt` file is summarized by Gemini, with fallback across model versions.
- **Panel bound to the real API:** The Next.js frontend logs in, stores the JWT and reads its
  permissions from `GET /auth/me` — never from the token payload. Each feature card declares the
  permission code it needs; a card the caller cannot use renders locked, with a button that fires the
  request anyway and prints the server's `403`, so the enforcement is visible rather than claimed.
- **Redis caching:** The per-request permission lookup is served from Redis when it is available.
  The interesting part is what the cache must not break — a Supervisor's edit still has to apply to
  the very next request — so `setRolePermissions` drops the role's key *after* the transaction
  commits, and only that role's key. The cache is optional: with no `REDIS_URL` every lookup goes to
  PostgreSQL, and if Redis fails mid-request the read falls through rather than erroring.
- **Docker Compose:** Postgres, RabbitMQ, Redis, backend and frontend start with one command, with
  healthchecks so the backend waits until its dependencies are actually ready.

### ⚠️ Current status — what is and isn't implemented

Being explicit so nobody is misled:

| Area | Status |
|---|---|
| RabbitMQ async + RPC | ✅ Implemented (`src/config/rabbitmq.js`, `src/routes/rpc.routes.js`) |
| PostgreSQL JSONB + trigger + procedure | ✅ Implemented (`db/schema.sql`) |
| Gemini document analysis | ✅ Implemented — `.txt` only |
| Docker Compose orchestration | ✅ Implemented |
| Authentication (JWT + bcrypt) | ✅ Implemented |
| Server-enforced dynamic RBAC | ✅ Implemented — permissions live in the database and are checked per request |
| Automated tests + CI | ✅ 71 integration tests against a real PostgreSQL, run on Node 20 and 22, twice — with and without the cache |
| Frontend wired to real auth | ✅ Implemented — login, token storage, and permission-gated panels |
| Redis caching | ✅ Implemented — optional, in front of the permission lookup, invalidated on write |
| RAG / embeddings | ❌ Not yet |

## 📡 API

All routes except `/health` and `/auth/login` require an `Authorization: Bearer <token>` header.
Permission codes are enforced server-side.

Note that `/auth/register` is **not** open self-service. It takes the new user's role from the
request body, so leaving it unauthenticated would let anyone hand themselves a Supervisor account and
rewrite the permission matrix. Creating accounts is an administrative act and sits behind
`users:write`; the first Supervisor is seeded by `npm run setup-db`, and there is deliberately no
bootstrap path through the API.

| Method | Route | Required permission |
|---|---|---|
| `GET` | `/health` | — |
| `POST` | `/auth/login` | — |
| `POST` | `/auth/register` | `users:write` |
| `GET` | `/auth/me` | authenticated |
| `GET` | `/records` | `records:read` |
| `POST` | `/records` | `records:write` |
| `POST` | `/ai-analyze` | `ai:analyze` |
| `GET` | `/rpc-test` | `rpc:execute` |
| `GET` | `/admin/permissions` | `permissions:manage` |
| `PUT` | `/admin/permissions/:roleId` | `permissions:manage` |
| `GET` | `/admin/users` | `users:read` |

Default roles: **Supervisor** (all permissions), **School** (read/write/analyze),
**Company** (read/analyze/rpc), **Student** (read/analyze).

Permission codes: `records:read`, `records:write`, `ai:analyze`, `rpc:execute`,
`permissions:manage`, `users:read`, `users:write`. They are rows in the `permissions` table, so a
Supervisor edits who holds what at runtime rather than through a redeploy.

## 📁 Project structure

```
index.js                    entry point — connects services, starts the server
src/
  app.js                    builds the Express app (exported so tests can drive it)
  config/db.js              PostgreSQL pool
  config/rabbitmq.js        broker connection + task_queue consumer
  config/redis.js           optional cache; every helper degrades to a no-op
  middleware/auth.js        authenticate() and requirePermission()
  middleware/errorHandler.js
  routes/                   auth · records · ai · rpc · admin
  services/permission.service.js
db/schema.sql               full schema, idempotent
scripts/setup-db.js         applies the schema, seeds the first Supervisor
tests/                      integration suite + globalSetup/globalTeardown
frontend/
  src/lib/api.js            fetch wrapper — attaches the token, normalises errors
  src/lib/auth-context.js   session state; permissions come from GET /auth/me
  src/app/login/page.js     login screen
  src/app/page.js           dashboard
  src/components/           Panel (permission gate) · matrix · records · rpc · ai
```

## 🧪 Tests

```bash
npm test              # 63 tests; the 8 cache tests skip without Redis

# Same suite with the cache in front of every permission lookup — 71 tests.
# Use a dedicated database index so a run cannot evict a dev server's entries.
TEST_REDIS_URL=redis://localhost:6379/15 npm test

npm run test:coverage # with a coverage report
```

CI runs both passes on Node 20 and 22. The second one is the real cache test:
if invalidation were wrong, the existing authorization assertions would start
failing rather than some cache-specific assertion.

The suite runs against a **real PostgreSQL instance**, not mocks — the schema, the audit trigger and
the JSONB queries are all genuinely exercised. `tests/globalSetup.js` creates a throwaway
`microservice_panel_test` database, applies `db/schema.sql`, and drops it afterwards. It refuses to
run at all unless the database name ends in `_test`, so a mistyped variable cannot touch real data.

What is covered: registration and login (including bcrypt hashing, timing-safe rejection of unknown
emails, expired and forged tokens), permission enforcement per route, permissions granted and revoked
mid-session on an already-issued token, pagination limits, the audit trigger, upload validation, and
the error handler not leaking internals. Three tests specifically pin the registration route shut: an
anonymous caller gets 401, a Student registering anyone gets 403, and a Student cannot mint a
Supervisor — each asserting the row was never created, not merely that the status code was right.

Current line coverage is ~79%. The gap is `rpc.routes.js` and `config/rabbitmq.js`, which need a live
broker; only their failure paths are covered today.

## 🗺️ Roadmap

1. ~~Real authentication and server-enforced RBAC~~ ✅ done
2. ~~Integration tests and a CI pipeline~~ ✅ done
3. ~~Wire the Next.js panel to the real auth API~~ ✅ done
4. ~~Redis caching layer in front of the per-request permission lookup~~ ✅ done
5. Cover the RabbitMQ paths with a broker service container in CI
6. Retrieval-augmented document analysis (embeddings + pgvector) replacing the single-shot summary

## ⚙️ Setup

### Option A — Docker (recommended)

1. Docker and Docker Compose must be installed.
2. Provide your Gemini key to the environment (optional, for the AI feature):
   ```bash
   export GEMINI_API_KEY=your_key   # Windows PowerShell: $env:GEMINI_API_KEY="your_key"
   ```
3. Start all services:
   ```bash
   docker-compose up --build
   ```
4. Services:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3006
   - RabbitMQ panel: http://localhost:15672 (user/password: `guest` / `guest`)

### Option B — Local development

**Backend:**
```bash
# Prepare the .env file
cp .env.example .env        # Windows: copy .env.example .env
# Fill in .env: DB details, GEMINI_API_KEY, and a JWT_SECRET.
# The server refuses to start without JWT_SECRET. Generate one with:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# Set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD to create the first Supervisor.

npm install
npm run setup-db            # applies db/schema.sql, seeds the first Supervisor
npm start                   # backend at http://localhost:3006
```

**Frontend:**
```bash
cd frontend
cp .env.example .env.local  # set NEXT_PUBLIC_API_URL if needed
npm install
npm run dev                 # http://localhost:3000
```

> You need to run PostgreSQL, RabbitMQ and (optionally) Redis separately for local development, or
> just start them from Docker: `docker-compose up -d postgres_db rabbitmq redis`.
>
> Leaving `REDIS_URL` blank is fine — the server says so at boot and reads permissions straight from
> PostgreSQL.
>
> `NEXT_PUBLIC_API_URL` and the backend's `PORT` are read independently and will not agree on their
> own — if you move the backend off 3006, change both.

### Signing in the first time

`npm run setup-db` creates one Supervisor from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`; sign in
with those. Everyone else is created from that account, since `/auth/register` requires
`users:write`:

```bash
curl -X POST http://localhost:3006/auth/register \
  -H "Authorization: Bearer <supervisor-token>" \
  -H "Content-Type: application/json" \
  -d '{"email":"student@example.com","password":"at-least-8-chars","role":"Student"}'
```

Grab `<supervisor-token>` from the `token` field of `POST /auth/login`.

## 🔐 Security / Environment Variables

Secrets (`GEMINI_API_KEY`, DB password) are no longer hard-coded; they are read from `.env`, which is
not committed to git. See `.env.example` and `frontend/.env.example` for sample values.

## 🗄️ Database

- `db/schema.sql` is the source of truth for the schema, trigger and procedure. `npm run setup-db`
  (`scripts/setup-db.js`) applies it and then seeds the first Supervisor from `SEED_ADMIN_*`. Every
  statement is idempotent, so re-running it never clobbers a Supervisor's runtime permission edits.
- `db/seed.sql` is an older reference dump kept for illustration only.

## 👥 Contributors

See `CONTRIBUTORS.md`.
