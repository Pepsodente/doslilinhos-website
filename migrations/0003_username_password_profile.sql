ALTER TABLE customers ADD COLUMN username TEXT;
CREATE UNIQUE INDEX idx_customers_username ON customers(username COLLATE NOCASE) WHERE username IS NOT NULL;
