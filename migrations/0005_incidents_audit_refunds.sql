-- Executar uma única vez
CREATE TABLE IF NOT EXISTS audit_log (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL, reference TEXT,
 action TEXT NOT NULL, from_status TEXT, to_status TEXT, actor TEXT NOT NULL,
 result TEXT NOT NULL DEFAULT 'success', amount_cents INTEGER, reason TEXT,
 provider_reference TEXT, webhook_event_id TEXT, ip_hash TEXT, details TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type,entity_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
ALTER TABLE orders ADD COLUMN incident_status TEXT;
ALTER TABLE orders ADD COLUMN incident_reason TEXT;
ALTER TABLE orders ADD COLUMN incident_customer_note TEXT;
ALTER TABLE orders ADD COLUMN incident_reported_at TEXT;
ALTER TABLE orders ADD COLUMN refund_status TEXT;
ALTER TABLE orders ADD COLUMN refund_amount_cents INTEGER;
ALTER TABLE orders ADD COLUMN refund_reference TEXT;
ALTER TABLE orders ADD COLUMN refunded_at TEXT;
ALTER TABLE payments ADD COLUMN provider_payment_intent TEXT;
