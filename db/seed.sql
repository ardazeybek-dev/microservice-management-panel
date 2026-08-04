-- -----------------------------------------------------------------------------
--  HISTORICAL REFERENCE ONLY — DO NOT RUN THIS AGAINST A LIVE DATABASE.
--
--  This is the original schema from the first version of the project, kept
--  verbatim so the JSONB + trigger + procedure work can still be read in the
--  shape it was written. Its table and column names are Turkish on purpose:
--  they are what the tables were called before the rename. The schema actually
--  in use is db/schema.sql, where genel_veriler became records and
--  sistem_loglari became audit_logs.
--
--  For reference, the names below translate as:
--    genel_veriler  -> records        kayit_tarihi  -> created_at
--    sistem_loglari -> audit_logs     islem_tipi    -> event_type
--    veri           -> data           aciklama      -> description
--    log_kaydi_tut  -> write_audit_log
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS sistem_loglari CASCADE;
DROP TABLE IF EXISTS genel_veriler CASCADE;

CREATE TABLE genel_veriler (
    id SERIAL PRIMARY KEY,
    kayit_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    veri JSONB NOT NULL
);

CREATE TABLE sistem_loglari (
    log_id SERIAL PRIMARY KEY,
    islem_tipi VARCHAR(50),
    aciklama TEXT,
    islem_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION log_kaydi_tut()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO sistem_loglari (islem_tipi, aciklama)
    VALUES ('YENİ_KAYIT', 'Sisteme yeni bir JSON verisi eklendi. ID: ' || NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER veri_eklendiginde
AFTER INSERT ON genel_veriler
FOR EACH ROW
EXECUTE FUNCTION log_kaydi_tut();

INSERT INTO genel_veriler (veri) VALUES 
('{"kullanici": "ogrenci1", "islem": "dosya_yukleme", "durum": "basarili"}'),
('{"kullanici": "isletme_x", "islem": "staj_basvurusu", "not": "onay bekliyor"}'),
('{"kullanici": "supervisor", "islem": "yetki_degisimi", "detay": "okul_yetkisi_acildi"}');
