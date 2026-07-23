# 🚀 Yapay Zeka Entegreli Microservice Yönetim Paneli

Öğrenci, Okul ve İşletme rolleri için dinamik yetkilendirme; RabbitMQ ile asenkron iletişim/RPC;
PostgreSQL (JSONB + trigger/procedure) ile loglama ve Gemini AI ile dosya analizi içeren full-stack
bir yönetim sistemi.

## 🛠 Teknolojiler

| Katman         | Teknoloji                              |
|----------------|----------------------------------------|
| Frontend       | Next.js (React + TailwindCSS)          |
| Backend        | Node.js + Express                      |
| Veritabanı     | PostgreSQL (JSONB, trigger, procedure) |
| Message Broker | RabbitMQ (asenkron + RPC)              |
| Yapay Zeka     | Google Gemini (dosya analizi)          |
| Konteyner      | Docker & Docker Compose                |

## 🌟 Özellikler

- **Dinamik Yetkilendirme:** Supervisor paneli üzerinden her rolün liste görme / CRUD / dosya-AI yetkileri açılıp kapatılır.
- **RabbitMQ + RPC:** İşlemlerin sonucu (başarılı/başarısız) anlık olarak abonelere bildirilir.
- **PostgreSQL:** JSONB alanlar, otomatik loglama için trigger ve stored procedure.
- **Gemini AI:** Yüklenen `.txt` dosyası yapay zekâ ile özetlenir/analiz edilir.

## ⚙️ Kurulum

### Seçenek A — Docker (önerilen)

1. Docker ve Docker Compose kurulu olmalı.
2. Gemini anahtarınızı ortama verin (opsiyonel, AI özelliği için):
   ```bash
   export GEMINI_API_KEY=your_key   # Windows PowerShell: $env:GEMINI_API_KEY="your_key"
   ```
3. Tüm servisleri başlatın:
   ```bash
   docker-compose up --build
   ```
4. Servisler:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3006
   - RabbitMQ paneli: http://localhost:15672 (kullanıcı/şifre: `guest` / `guest`)

### Seçenek B — Yerel geliştirme

**Backend:**
```bash
# .env dosyasını hazırlayın
cp .env.example .env        # Windows: copy .env.example .env
# .env içine DB bilgilerinizi ve GEMINI_API_KEY'i girin

npm install
npm run setup-db            # tabloları, trigger ve procedure'ü oluşturur
npm start                   # backend http://localhost:3006
```

**Frontend:**
```bash
cd odev-frontend
cp .env.example .env.local  # gerekiyorsa NEXT_PUBLIC_API_URL'i ayarlayın
npm install
npm run dev                 # http://localhost:3000
```

> PostgreSQL ve RabbitMQ'yu yerelde ayrıca çalıştırmanız gerekir (ya da sadece bu ikisini Docker'dan alın:
> `docker-compose up -d postgres_db rabbitmq`).

## 🔐 Güvenlik / Ortam Değişkenleri

Sırlar (`GEMINI_API_KEY`, DB şifresi) artık koda gömülü değildir; `.env` dosyasından okunur ve `.env`
git'e gönderilmez. Örnek değerler için `.env.example` ve `odev-frontend/.env.example` dosyalarına bakın.

## 🗄️ Veritabanı

- Şema/trigger/procedure `db-kurulum.js` ile oluşturulur (`npm run setup-db`).
- Örnek veri yedeği: `veritabani_yedek.sql`.

## 👥 Katkıda Bulunanlar

Bkz. `HAZIRLAYANLAR.md`.
