PRAGMA foreign_keys = ON;

/* =========================================================
   1. CATÁLOGO FISCAL
   ========================================================= */

CREATE TABLE IF NOT EXISTS product_tax_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    product_code TEXT NOT NULL,
    product_name TEXT NOT NULL,

    tax_country TEXT NOT NULL DEFAULT 'PT',
    tax_region TEXT NOT NULL DEFAULT 'CONTINENT',

    vat_rate_bps INTEGER,
    vat_category TEXT NOT NULL,

    prices_include_vat INTEGER NOT NULL DEFAULT 1
        CHECK (prices_include_vat IN (0, 1)),

    tax_treatment TEXT NOT NULL DEFAULT 'direct'
        CHECK (
            tax_treatment IN (
                'direct',
                'composite'
            )
        ),

    tax_status TEXT NOT NULL DEFAULT 'confirmed'
        CHECK (
            tax_status IN (
                'confirmed',
                'review_required',
                'inactive'
            )
        ),

    accounting_notes TEXT,

    valid_from TEXT NOT NULL,
    valid_until TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (
        product_code,
        tax_region,
        valid_from
    )
);

CREATE INDEX IF NOT EXISTS idx_product_tax_lookup
ON product_tax_profiles (
    product_code,
    tax_region,
    tax_status,
    valid_from,
    valid_until
);


/* =========================================================
   2. SEQUÊNCIA INTERNA DOS RECIBOS
   ========================================================= */

CREATE TABLE IF NOT EXISTS receipt_sequences (
    receipt_year INTEGER PRIMARY KEY,
    last_number INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


/* =========================================================
   3. RECIBOS / COMPROVATIVOS DE PAGAMENTO
   ========================================================= */

CREATE TABLE IF NOT EXISTS payment_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    order_id INTEGER NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL,

    receipt_number TEXT NOT NULL UNIQUE,
    payment_reference TEXT NOT NULL UNIQUE,

    payment_method TEXT,
    payment_brand TEXT,
    payment_last4 TEXT,

    paid_at TEXT NOT NULL,

    net_total_cents INTEGER NOT NULL
        CHECK (net_total_cents >= 0),

    vat_total_cents INTEGER NOT NULL
        CHECK (vat_total_cents >= 0),

    gross_total_cents INTEGER NOT NULL
        CHECK (gross_total_cents >= 0),

    vat_breakdown_json TEXT NOT NULL DEFAULT '[]',
    customer_snapshot_json TEXT NOT NULL,
    order_snapshot_json TEXT NOT NULL,

    email_sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_customer
ON payment_receipts (
    customer_id,
    created_at DESC
);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_order
ON payment_receipts (
    order_id
);


/* =========================================================
   4. CATÁLOGO INICIAL DE IVA
   Taxas guardadas em pontos-base:
   600  = 6%
   1300 = 13%
   2300 = 23%
   ========================================================= */

INSERT OR IGNORE INTO product_tax_profiles (
    product_code,
    product_name,
    vat_rate_bps,
    vat_category,
    prices_include_vat,
    tax_treatment,
    tax_status,
    accounting_notes,
    valid_from
)
VALUES
(
    'EGG-06',
    'Caixa de 6 ovos',
    600,
    'fresh_eggs',
    1,
    'direct',
    'confirmed',
    'Ovos em natureza.',
    '2026-01-01'
),
(
    'EGG-12',
    'Caixa de 12 ovos',
    600,
    'fresh_eggs',
    1,
    'direct',
    'confirmed',
    'Ovos em natureza.',
    '2026-01-01'
),
(
    'EGG-18',
    'Caixa de 18 ovos',
    600,
    'fresh_eggs',
    1,
    'direct',
    'confirmed',
    'Ovos em natureza.',
    '2026-01-01'
),
(
    'EGG-30',
    'Caixa de 30 ovos',
    600,
    'fresh_eggs',
    1,
    'direct',
    'confirmed',
    'Ovos em natureza.',
    '2026-01-01'
),
(
    'CHK-WHOLE',
    'Frango de pasto inteiro',
    600,
    'fresh_poultry',
    1,
    'direct',
    'confirmed',
    'Frango fresco ou refrigerado.',
    '2026-01-01'
),
(
    'CHK-CUT',
    'Frango de pasto em peças',
    600,
    'fresh_poultry',
    1,
    'direct',
    'confirmed',
    'Frango fresco ou refrigerado.',
    '2026-01-01'
),
(
    'VEG-FRESH',
    'Hortícolas frescos',
    600,
    'fresh_vegetables',
    1,
    'direct',
    'confirmed',
    'Produtos hortícolas em natureza.',
    '2026-01-01'
),
(
    'FRUIT-FRESH',
    'Fruta fresca',
    600,
    'fresh_fruit',
    1,
    'direct',
    'confirmed',
    'Fruta em natureza.',
    '2026-01-01'
),
(
    'ALHEIRA',
    'Alheira',
    2300,
    'processed_meat',
    1,
    'direct',
    'confirmed',
    'Produto transformado à base de carne.',
    '2026-01-01'
),
(
    'CHOURICO',
    'Chouriço',
    2300,
    'processed_meat',
    1,
    'direct',
    'confirmed',
    'Produto transformado à base de carne.',
    '2026-01-01'
),
(
    'JAM',
    'Doce, compota, geleia ou marmelada',
    1300,
    'processed_fruit',
    1,
    'direct',
    'confirmed',
    'Produto transformado à base de fruta.',
    '2026-01-01'
),
(
    'DRIED-FRUIT-NATURAL',
    'Fruta seca ou desidratada sem adições',
    600,
    'dried_fruit_natural',
    1,
    'direct',
    'confirmed',
    'Sem açúcar, cobertura ou transformação adicional.',
    '2026-01-01'
),
(
    'DRIED-FRUIT-PREPARED',
    'Fruta seca preparada ou açucarada',
    2300,
    'dried_fruit_prepared',
    1,
    'direct',
    'confirmed',
    'Fruta açucarada, coberta ou transformada.',
    '2026-01-01'
),
(
    'BABY-PORRIDGE',
    'Papas para bebés',
    600,
    'infant_food',
    1,
    'direct',
    'review_required',
    'Confirmar classificação e apresentação como alimentação infantil antes da venda.',
    '2026-01-01'
),
(
    'PORRIDGE-GENERAL',
    'Papas de consumo geral',
    2300,
    'prepared_cereal',
    1,
    'direct',
    'confirmed',
    'Mistura preparada não classificada como alimentação infantil.',
    '2026-01-01'
),
(
    'HOMEMADE-CAKE',
    'Bolo caseiro',
    2300,
    'pastry',
    1,
    'direct',
    'confirmed',
    'Produto de pastelaria.',
    '2026-01-01'
),
(
    'HOMEMADE-BISCUITS',
    'Bolachas ou biscoitos caseiros',
    2300,
    'biscuits',
    1,
    'direct',
    'confirmed',
    'Produto de pastelaria ou biscoitaria.',
    '2026-01-01'
),
(
    'MIXED-BASKET',
    'Cabaz misto',
    NULL,
    'mixed_basket',
    1,
    'composite',
    'confirmed',
    'Cada componente mantém a sua taxa de IVA.',
    '2026-01-01'
),
(
    'DELIVERY-INDEPENDENT',
    'Serviço autónomo de entrega',
    2300,
    'independent_transport',
    1,
    'direct',
    'confirmed',
    'Entrega cobrada separadamente em função da transportadora, peso, dimensões, destino e manuseamento.',
    '2026-01-01'
);
