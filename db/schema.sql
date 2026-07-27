-- =============================================================================
--  Microservice Management Panel — database schema
--  Applied by: npm run setup-db  (scripts/setup-db.js)
--
--  Safe to run repeatedly: every statement is idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  AUTHORIZATION
--
--  Permissions are NOT hard-coded in the application. They live in
--  role_permissions, which a Supervisor can edit at runtime through
--  PUT /admin/permissions. That is what makes the authorization "dynamic".
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS roles (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(64) UNIQUE NOT NULL,  -- e.g. 'records:read'
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       INTEGER NOT NULL REFERENCES roles(id)       ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,               -- bcrypt; plain text is never stored
    role_id       INTEGER NOT NULL REFERENCES roles(id),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email   ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

-- -----------------------------------------------------------------------------
--  DOMAIN DATA
--  (Renamed from genel_veriler / sistem_loglari — see git history.)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS records (
    id         SERIAL PRIMARY KEY,
    data       JSONB NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- JSONB containment queries (data @> '{"status":"ok"}') use this index.
CREATE INDEX IF NOT EXISTS idx_records_data ON records USING GIN (data);

CREATE TABLE IF NOT EXISTS audit_logs (
    id          SERIAL PRIMARY KEY,
    event_type  VARCHAR(50) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
--  AUDIT TRIGGER
--  Every insert into records writes an audit row automatically, inside the
--  same transaction — the application cannot forget to log.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_record_insert()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_logs (event_type, description)
    VALUES ('NEW_RECORD', 'A new JSON record was added to the system. ID: ' || NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS records_after_insert ON records;
CREATE TRIGGER records_after_insert
    AFTER INSERT ON records
    FOR EACH ROW
    EXECUTE FUNCTION log_record_insert();

-- -----------------------------------------------------------------------------
--  BASELINE ROLES & PERMISSIONS
--  ON CONFLICT DO NOTHING: re-running setup never clobbers a Supervisor's
--  runtime permission edits.
-- -----------------------------------------------------------------------------

INSERT INTO roles (name, description) VALUES
    ('Supervisor', 'Full access; manages role permissions'),
    ('Student',    'Reads records and runs document analysis'),
    ('School',     'Reads and writes records'),
    ('Company',    'Reads records and runs document analysis')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (code, description) VALUES
    ('records:read',       'List records'),
    ('records:write',      'Create records'),
    ('ai:analyze',         'Upload a document for AI analysis'),
    ('rpc:execute',        'Trigger a RabbitMQ RPC round trip'),
    ('permissions:manage', 'View and edit the role/permission matrix'),
    ('users:read',         'List users')
ON CONFLICT (code) DO NOTHING;

-- Supervisor gets everything.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'Supervisor'
ON CONFLICT DO NOTHING;

-- Student: read + analyze.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('records:read', 'ai:analyze')
WHERE r.name = 'Student'
ON CONFLICT DO NOTHING;

-- School: read + write + analyze.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('records:read', 'records:write', 'ai:analyze')
WHERE r.name = 'School'
ON CONFLICT DO NOTHING;

-- Company: read + analyze + rpc.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('records:read', 'ai:analyze', 'rpc:execute')
WHERE r.name = 'Company'
ON CONFLICT DO NOTHING;
