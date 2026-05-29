-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- accounts (no foreign key dependencies)
-- ============================================================
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    institution VARCHAR(255),
    last_four VARCHAR(4),
    currency VARCHAR(3) DEFAULT 'USD',
    is_active BOOLEAN DEFAULT true,
    color VARCHAR(7),
    icon VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- trips (no foreign key dependencies)
-- ============================================================
CREATE TABLE trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    destination VARCHAR(255),
    start_date DATE,
    end_date DATE,
    trip_type VARCHAR(20),
    budget DECIMAL(12,2),
    status VARCHAR(20) DEFAULT 'planning',
    expense_tool VARCHAR(255),
    expense_tool_reference VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- reimbursement_batches (no foreign key dependencies)
-- ============================================================
CREATE TABLE reimbursement_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255),
    source VARCHAR(50),
    submitted_date DATE,
    expected_payment_date DATE,
    total_submitted DECIMAL(12,2),
    total_received DECIMAL(12,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'draft',
    expense_tool VARCHAR(255),
    submission_reference VARCHAR(255),
    submission_method VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- subscriptions (references accounts)
-- ============================================================
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    billing_frequency VARCHAR(50),
    next_billing_date DATE,
    category VARCHAR(100),
    subcategory VARCHAR(100),
    personal_work_shared VARCHAR(20),
    is_reimbursable BOOLEAN DEFAULT false,
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    value_rating INTEGER CHECK (value_rating BETWEEN 1 AND 5),
    usage_rating VARCHAR(20),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    cancelled_at TIMESTAMP
);

-- ============================================================
-- import_batches (references accounts)
-- ============================================================
CREATE TABLE import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename VARCHAR(500),
    source_type VARCHAR(50),
    institution VARCHAR(255),
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    total_transactions INTEGER DEFAULT 0,
    imported_transactions INTEGER DEFAULT 0,
    skipped_duplicates INTEGER DEFAULT 0,
    needs_review_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'processing',
    imported_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- transactions (references accounts, trips, reimbursement_batches,
--               subscriptions, import_batches)
-- ============================================================
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    posted_date DATE,
    amount DECIMAL(12,2) NOT NULL,
    direction VARCHAR(10) NOT NULL,
    description VARCHAR(500),
    description_clean VARCHAR(500),
    merchant VARCHAR(255),
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    transaction_type VARCHAR(50),
    category VARCHAR(100),
    subcategory VARCHAR(100),
    need_want_savings VARCHAR(20),
    fixed_variable VARCHAR(20),
    personal_work_shared VARCHAR(20),
    notes TEXT,
    tags TEXT[],
    -- reimbursement
    is_reimbursable BOOLEAN DEFAULT false,
    reimbursement_source VARCHAR(50),
    reimbursement_status VARCHAR(50) DEFAULT 'not_reimbursable',
    expected_reimbursement DECIMAL(12,2),
    received_reimbursement DECIMAL(12,2) DEFAULT 0,
    net_personal_cost DECIMAL(12,2) GENERATED ALWAYS AS (amount - COALESCE(received_reimbursement, 0)) STORED,
    reimbursement_due_date DATE,
    reimbursement_received_date DATE,
    reimbursement_batch_id UUID REFERENCES reimbursement_batches(id) ON DELETE SET NULL,
    -- work/travel
    business_trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
    company_expense_category VARCHAR(255),
    expense_tool VARCHAR(255),
    -- recurring/subscription
    is_recurring BOOLEAN DEFAULT false,
    frequency VARCHAR(50),
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    -- investment
    investment_ticker VARCHAR(20),
    investment_action VARCHAR(20),
    investment_shares DECIMAL(18,6),
    investment_price_per_share DECIMAL(12,4),
    -- import metadata
    source VARCHAR(50) DEFAULT 'manual',
    import_batch_id UUID REFERENCES import_batches(id) ON DELETE SET NULL,
    raw_text TEXT,
    duplicate_hash VARCHAR(64) UNIQUE,
    -- AI metadata
    ai_category VARCHAR(100),
    ai_subcategory VARCHAR(100),
    ai_confidence DECIMAL(4,3),
    ai_flags TEXT[],
    ai_reviewed BOOLEAN DEFAULT false,
    needs_review BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- budgets
-- ============================================================
CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL,
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    budget_amount DECIMAL(12,2) NOT NULL,
    needs_pct DECIMAL(5,2),
    wants_pct DECIMAL(5,2),
    savings_pct DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
-- Partial unique indexes: category-level budgets (NULL subcategory) and subcategory-level budgets
CREATE UNIQUE INDEX uq_budgets_cat_only ON budgets (month, year, category) WHERE subcategory IS NULL;
CREATE UNIQUE INDEX uq_budgets_cat_sub ON budgets (month, year, category, subcategory) WHERE subcategory IS NOT NULL;

-- ============================================================
-- income_schedules (references accounts)
-- ============================================================
CREATE TABLE income_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_name VARCHAR(255) NOT NULL,
    expected_amount DECIMAL(12,2),
    frequency VARCHAR(50),
    custom_days INTEGER[],
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- merchant_rules (AI learning engine)
-- ============================================================
CREATE TABLE merchant_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern VARCHAR(500) NOT NULL,
    match_type VARCHAR(20),
    merchant_clean VARCHAR(255),
    category VARCHAR(100),
    subcategory VARCHAR(100),
    need_want_savings VARCHAR(20),
    fixed_variable VARCHAR(20),
    is_reimbursable BOOLEAN,
    personal_work_shared VARCHAR(20),
    is_recurring BOOLEAN,
    tags TEXT[],
    confidence DECIMAL(4,3) DEFAULT 1.0,
    times_applied INTEGER DEFAULT 0,
    times_overridden INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- user_preferences (single row, id=1)
-- ============================================================
CREATE TABLE user_preferences (
    id INTEGER PRIMARY KEY DEFAULT 1,
    default_budget_rule JSONB DEFAULT '{"needs": 50, "wants": 30, "savings": 20}',
    budget_templates JSONB DEFAULT '[]'::jsonb,
    theme VARCHAR(20) DEFAULT 'light',
    default_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    ai_provider VARCHAR(50) DEFAULT 'anthropic',
    ai_model_categorization VARCHAR(100) DEFAULT 'claude-haiku-4-5-20251001',
    ai_model_insights VARCHAR(100) DEFAULT 'claude-sonnet-4-5',
    ai_insights_opt_in BOOLEAN DEFAULT false,
    anthropic_api_key TEXT,
    openai_api_key TEXT,
    expense_tool_name VARCHAR(255),
    backup_path TEXT DEFAULT '~/Finance/Backups',
    backup_to_icloud BOOLEAN DEFAULT true,
    onboarding_complete BOOLEAN DEFAULT false,
    dashboard_layout JSONB,
    password_hash TEXT,
    webauthn_credential JSONB,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- backup_log
-- ============================================================
CREATE TABLE backup_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_path TEXT,
    backup_size_bytes BIGINT,
    triggered_by VARCHAR(50),
    status VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- db_change_log (for backup trigger debounce)
-- ============================================================
CREATE TABLE db_change_log (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(100),
    operation VARCHAR(10),
    changed_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Trigger function: write to db_change_log on major table changes
-- ============================================================
CREATE OR REPLACE FUNCTION log_db_change()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO db_change_log (table_name, operation) VALUES (TG_TABLE_NAME, TG_OP);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_accounts_change
    AFTER INSERT OR UPDATE OR DELETE ON accounts
    FOR EACH ROW EXECUTE FUNCTION log_db_change();

CREATE TRIGGER trg_transactions_change
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION log_db_change();

CREATE TRIGGER trg_budgets_change
    AFTER INSERT OR UPDATE OR DELETE ON budgets
    FOR EACH ROW EXECUTE FUNCTION log_db_change();

CREATE TRIGGER trg_subscriptions_change
    AFTER INSERT OR UPDATE OR DELETE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION log_db_change();

CREATE TRIGGER trg_merchant_rules_change
    AFTER INSERT OR UPDATE OR DELETE ON merchant_rules
    FOR EACH ROW EXECUTE FUNCTION log_db_change();

-- ============================================================
-- Seed: default user_preferences row
-- ============================================================
INSERT INTO user_preferences (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
