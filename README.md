# 🚀 AI-Integrated Microservice Management Panel

A full-stack demo system built around asynchronous service communication: RabbitMQ (async publish +
RPC request/reply), PostgreSQL logging with JSONB and a trigger/procedure, document analysis powered
by Google Gemini, and a Next.js panel with Student / School / Company role screens.

## 🛠 Tech Stack

| Layer          | Technology                             |
|----------------|----------------------------------------|
| Frontend       | Next.js (React + TailwindCSS)          |
| Backend        | Node.js + Express                      |
| Database       | PostgreSQL (JSONB, triggers, procedures) |
| Message Broker | RabbitMQ (async + RPC)                 |
| AI             | Google Gemini (file analysis)          |
| Containers     | Docker & Docker Compose                |

## 🌟 Features

- **RabbitMQ + RPC:** `GET /rpc-test` publishes a message to `task_queue` with a `replyTo` queue and a
  `correlationId`, then waits for the consumer's reply — a full request/reply round trip.
- **PostgreSQL:** Records are stored in a `JSONB` column; an `AFTER INSERT` trigger calls a `plpgsql`
  procedure that writes an audit row automatically.
- **Gemini AI:** An uploaded `.txt` file is summarized by Gemini, with fallback across model versions.
- **Docker Compose:** Postgres, RabbitMQ, backend and frontend start with one command, with
  healthchecks so the backend waits until its dependencies are actually ready.

### ⚠️ Current status — what is and isn't implemented

Being explicit so nobody is misled:

| Area | Status |
|---|---|
| RabbitMQ async + RPC | ✅ Implemented (`index.js`) |
| PostgreSQL JSONB + trigger + procedure | ✅ Implemented (`db-kurulum.js`) |
| Gemini document analysis | ✅ Implemented — `.txt` only |
| Docker Compose orchestration | ✅ Implemented |
| Role-based access control | ⚠️ **UI prototype only.** The Supervisor panel toggles permissions in React state; there is no authentication and the backend does not enforce roles yet. |
| Automated tests / CI | ❌ Not yet |
| Redis caching | ❌ Not yet |
| RAG / embeddings | ❌ Not yet |

## 🗺️ Roadmap

1. Real authentication and server-enforced RBAC (JWT + bcrypt, users/roles tables, route middleware)
2. Redis caching layer in front of `GET /records`
3. Jest + Supertest integration tests and a GitHub Actions CI pipeline
4. Rename the remaining Turkish SQL identifiers alongside the auth migration
5. Retrieval-augmented document analysis (embeddings + pgvector) replacing the single-shot summary

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
# Fill in your DB details and GEMINI_API_KEY in .env

npm install
npm run setup-db            # creates tables, trigger and procedure
npm start                   # backend at http://localhost:3006
```

**Frontend:**
```bash
cd frontend
cp .env.example .env.local  # set NEXT_PUBLIC_API_URL if needed
npm install
npm run dev                 # http://localhost:3000
```

> You need to run PostgreSQL and RabbitMQ separately for local development (or just start those two
> from Docker: `docker-compose up -d postgres_db rabbitmq`).

## 🔐 Security / Environment Variables

Secrets (`GEMINI_API_KEY`, DB password) are no longer hard-coded; they are read from `.env`, which is
not committed to git. See `.env.example` and `frontend/.env.example` for sample values.

## 🗄️ Database

- The schema/trigger/procedure are created by `db-kurulum.js` (`npm run setup-db`) — this is the source of truth.
- `db/seed.sql` is a reference dump of the same schema plus sample rows.

## 👥 Contributors

See `CONTRIBUTORS.md`.
