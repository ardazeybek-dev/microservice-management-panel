require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function veritabaniAyarla() {
    try {
        console.log("⏳ Veritabanı masaya yatırılıyor, ameliyat başlıyor...");

        await pool.query(`
            CREATE TABLE IF NOT EXISTS genel_veriler (
                id SERIAL PRIMARY KEY,
                kayit_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                veri JSONB NOT NULL
            );
        `);
        console.log("✅ 'genel_veriler' tablosu hazır (JSONB destekli).");

        await pool.query(`
            CREATE TABLE IF NOT EXISTS sistem_loglari (
                log_id SERIAL PRIMARY KEY,
                islem_tipi VARCHAR(50),
                aciklama TEXT,
                islem_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ 'sistem_loglari' tablosu hazır.");

        await pool.query(`
            CREATE OR REPLACE FUNCTION log_kaydi_tut()
            RETURNS TRIGGER AS $$
            BEGIN
                INSERT INTO sistem_loglari (islem_tipi, aciklama)
                VALUES ('YENİ_KAYIT', 'Sisteme yeni bir JSON verisi eklendi. ID: ' || NEW.id);
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);
        console.log("✅ PostgreSQL Fonksiyonu (Procedure) başarıyla yazıldı.");

        await pool.query(`DROP TRIGGER IF EXISTS veri_eklendiginde ON genel_veriler;`);
        await pool.query(`
            CREATE TRIGGER veri_eklendiginde
            AFTER INSERT ON genel_veriler
            FOR EACH ROW
            EXECUTE FUNCTION log_kaydi_tut();
        `);
        console.log("✅ PostgreSQL Trigger (Tetikleyici) aktifleştirildi.");

        console.log("🎉 BÜTÜN VERİTABANI İŞLEMLERİ (MADDE 10, 11, 12) KUSURSUZ TAMAMLANDI! 🐘");
        process.exit(0);

    } catch (err) {
        console.error("❌ Veritabanı Kurulum Hatası:", err);
        process.exit(1);
    }
}

veritabaniAyarla();
