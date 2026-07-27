# CLAUDE.md

This file guides Claude Code (claude.ai/code) when working in this repository.

## Project

Full-stack microservice project: role-based dynamic authorization, RabbitMQ RPC, PostgreSQL logging
(JSONB + trigger/procedure), and file analysis with Gemini AI.

## Structure

- **index.js** — Express backend (port 3006). Endpoints: `POST /ai-analyze` (file + Gemini),
  `GET /records` (PostgreSQL records), `GET /rpc-test` (RabbitMQ RPC).
- **db-kurulum.js** — creates tables, trigger and stored procedure (`npm run setup-db`).
- **ai-test.js** — lists the models available to your Gemini key (`npm run ai-test`).
- **frontend/** — Next.js UI; `src/app/page.js` holds the Supervisor panel and role screens.
- **db/seed.sql** — schema + sample data dump (reference only; `npm run setup-db` is the source of truth).
- **docker-compose.yml** — postgres_db, rabbitmq, backend, frontend services.

## Running

- Docker: `docker-compose up --build`
- Local backend: `npm install && npm run setup-db && npm start`
- Local frontend: `cd frontend && npm install && npm run dev`

## Rules

- **No secrets in code.** DB credentials, `GEMINI_API_KEY`, and `RABBITMQ_URL` are always read from `.env`.
  When adding a new variable, also update `.env.example`.
- The frontend gets the backend address from `process.env.NEXT_PUBLIC_API_URL`; never hard-code the URL.
- The backend connects to RabbitMQ via `RABBITMQ_URL` (`amqp://rabbitmq` in Docker, `amqp://localhost` locally).
- User files under `uploads/` are not committed (see `.gitignore`).

## Note on naming

Endpoint paths and API payload keys are English (`/records`, `/ai-analyze`, `document`). The database
schema is still Turkish (`genel_veriler`, `sistem_loglari`, `kayit_tarihi`, `veri`) — this is a known
inconsistency, scheduled to be renamed together with the upcoming auth/RBAC migration. Until then, keep
SQL identifiers matching `db-kurulum.js` and `db/seed.sql`.
