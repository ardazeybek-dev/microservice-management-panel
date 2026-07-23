require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function setupDatabase() {
    try {
        console.log("⏳ Setting up the database...");

        await pool.query(`
            CREATE TABLE IF NOT EXISTS genel_veriler (
                id SERIAL PRIMARY KEY,
                kayit_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                veri JSONB NOT NULL
            );
        `);
        console.log("✅ 'genel_veriler' table ready (JSONB supported).");

        await pool.query(`
            CREATE TABLE IF NOT EXISTS sistem_loglari (
                log_id SERIAL PRIMARY KEY,
                islem_tipi VARCHAR(50),
                aciklama TEXT,
                islem_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ 'sistem_loglari' table ready.");

        await pool.query(`
            CREATE OR REPLACE FUNCTION log_kaydi_tut()
            RETURNS TRIGGER AS $$
            BEGIN
                INSERT INTO sistem_loglari (islem_tipi, aciklama)
                VALUES ('NEW_RECORD', 'A new JSON record was added to the system. ID: ' || NEW.id);
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);
        console.log("✅ PostgreSQL function (procedure) written successfully.");

        await pool.query(`DROP TRIGGER IF EXISTS veri_eklendiginde ON genel_veriler;`);
        await pool.query(`
            CREATE TRIGGER veri_eklendiginde
            AFTER INSERT ON genel_veriler
            FOR EACH ROW
            EXECUTE FUNCTION log_kaydi_tut();
        `);
        console.log("✅ PostgreSQL trigger activated.");

        console.log("🎉 ALL DATABASE OPERATIONS COMPLETED SUCCESSFULLY! 🐘");
        process.exit(0);

    } catch (err) {
        console.error("❌ Database setup error:", err);
        process.exit(1);
    }
}

setupDatabase();
