PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS customers (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL,
 password_salt TEXT NOT NULL,
 marketing_consent INTEGER NOT NULL DEFAULT 0,
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS customer_sessions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 customer_id INTEGER NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,
 expires_at TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON customer_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON customer_sessions(expires_at);
CREATE TABLE IF NOT EXISTS reservations (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 reservation_number TEXT NOT NULL UNIQUE,
 customer_id INTEGER,
 customer_name TEXT NOT NULL,
 customer_email TEXT NOT NULL,
 packs INTEGER NOT NULL CHECK(packs > 0),
 quantity_eggs INTEGER NOT NULL CHECK(quantity_eggs > 0),
 status TEXT NOT NULL DEFAULT 'pending',
 reserved_until TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_reservations_customer ON reservations(customer_id, created_at DESC);
CREATE TABLE IF NOT EXISTS inventory_movements (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 movement_type TEXT NOT NULL,
 quantity_eggs INTEGER NOT NULL,
 reference_type TEXT,
 reference_id INTEGER,
 note TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_inventory_created ON inventory_movements(created_at);
