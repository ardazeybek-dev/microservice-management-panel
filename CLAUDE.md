# CLAUDE.md

Bu dosya, bu depoda çalışırken Claude Code'a (claude.ai/code) rehberlik eder.

## Proje

Full-stack microservice projesi: rol tabanlı dinamik yetkilendirme, RabbitMQ RPC, PostgreSQL loglama
(JSONB + trigger/procedure) ve Gemini AI ile dosya analizi.

## Yapı

- **index.js** — Express backend (port 3006). Endpoint'ler: `POST /ai-analiz` (dosya + Gemini),
  `GET /listele` (PostgreSQL kayıtları), `GET /rpc-test` (RabbitMQ RPC).
- **db-kurulum.js** — tabloları, trigger ve stored procedure'ü oluşturur (`npm run setup-db`).
- **ai-test.js** — Gemini anahtarına açık modelleri listeler (`npm run ai-test`).
- **odev-frontend/** — Next.js arayüzü; `src/app/page.js` Supervisor paneli ve rol ekranları.
- **docker-compose.yml** — postgres_db, rabbitmq, backend, frontend servisleri.

## Çalıştırma

- Docker: `docker-compose up --build`
- Yerel backend: `npm install && npm run setup-db && npm start`
- Yerel frontend: `cd odev-frontend && npm install && npm run dev`

## Kurallar

- **Sırlar koda gömülmez.** DB bilgileri, `GEMINI_API_KEY`, `RABBITMQ_URL` hep `.env`'den okunur.
  Yeni değişken eklerken `.env.example` dosyasını da güncelle.
- Frontend backend adresini `process.env.NEXT_PUBLIC_API_URL` üzerinden alır; sabit URL yazma.
- Backend RabbitMQ'ya `RABBITMQ_URL` ile bağlanır (Docker'da `amqp://rabbitmq`, yerelde `amqp://localhost`).
- `uploads/` içindeki kullanıcı dosyaları commit'lenmez (bkz. `.gitignore`).
