# 🚀 AI-Integrated Microservice Management Panel

A full-stack management system featuring role-based dynamic authorization for Student, School and
Company roles; asynchronous communication and RPC via RabbitMQ; logging with PostgreSQL (JSONB +
triggers/procedures); and file analysis powered by Google Gemini AI.

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

- **Dynamic authorization:** From the Supervisor panel, each role's list-view / CRUD / file-AI permissions can be toggled on and off.
- **RabbitMQ + RPC:** Operation results (success/failure) are pushed to subscribers in real time.
- **PostgreSQL:** JSONB fields, plus a trigger and stored procedure for automatic logging.
- **Gemini AI:** An uploaded `.txt` file is summarized/analyzed by AI.

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
cd odev-frontend
cp .env.example .env.local  # set NEXT_PUBLIC_API_URL if needed
npm install
npm run dev                 # http://localhost:3000
```

> You need to run PostgreSQL and RabbitMQ separately for local development (or just start those two
> from Docker: `docker-compose up -d postgres_db rabbitmq`).

## 🔐 Security / Environment Variables

Secrets (`GEMINI_API_KEY`, DB password) are no longer hard-coded; they are read from `.env`, which is
not committed to git. See `.env.example` and `odev-frontend/.env.example` for sample values.

## 🗄️ Database

- The schema/trigger/procedure are created by `db-kurulum.js` (`npm run setup-db`).
- Sample data backup: `veritabani_yedek.sql`.

## 👥 Contributors

See `CONTRIBUTORS.md`.
