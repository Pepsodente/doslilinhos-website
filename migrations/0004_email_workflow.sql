-- 0004_email_workflow.sql
CREATE TABLE IF NOT EXISTS email_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  order_id INTEGER,
  subscription_id INTEGER,
  message_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'resend',
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  FOREIGN KEY(customer_id) REFERENCES customers(id),
  FOREIGN KEY(order_id) REFERENCES orders(id),
  FOREIGN KEY(subscription_id) REFERENCES subscriptions(id)
);
CREATE INDEX IF NOT EXISTS idx_email_messages_status ON email_messages(status, created_at);
CREATE INDEX IF NOT EXISTS idx_email_messages_order ON email_messages(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_email_messages_subscription ON email_messages(subscription_id, created_at);

CREATE TABLE IF NOT EXISTS workflow_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('order','subscription')),
  entity_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  actor TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_workflow_events_entity ON workflow_events(entity_type, entity_id, created_at);

CREATE TABLE IF NOT EXISTS subscription_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL,
  proposed_eggs INTEGER,
  proposed_frequency TEXT,
  proposed_price_cents INTEGER,
  proposed_start_date TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','expired')),
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at TEXT,
  FOREIGN KEY(subscription_id) REFERENCES subscriptions(id)
);

ALTER TABLE orders ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN approval_note TEXT;
ALTER TABLE orders ADD COLUMN pickup_location TEXT;
ALTER TABLE orders ADD COLUMN pickup_at TEXT;
ALTER TABLE orders ADD COLUMN rejected_at TEXT;

ALTER TABLE subscriptions ADD COLUMN approval_note TEXT;
ALTER TABLE subscriptions ADD COLUMN price_cents INTEGER;
ALTER TABLE subscriptions ADD COLUMN first_delivery_on TEXT;
ALTER TABLE subscriptions ADD COLUMN pickup_location TEXT;
ALTER TABLE subscriptions ADD COLUMN approved_at TEXT;
ALTER TABLE subscriptions ADD COLUMN rejected_at TEXT;
