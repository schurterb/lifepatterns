-- Pattern Tracker D1 Migration 002
-- Phase 4 columns/tables for databases created from an older (Phase 3) schema.
-- schema.sql uses CREATE TABLE IF NOT EXISTS, which cannot ALTER an existing
-- users table — run this once on databases provisioned before Phase 4.
-- D1 executes each statement sequentially; re-running is safe if it fails partway
-- only if you delete the partially created tables first.

-- Phase 4: Subscription columns on users
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'none' CHECK(subscription_status IN ('none', 'active', 'canceled', 'past_due'));
ALTER TABLE users ADD COLUMN subscription_period_end TEXT;

-- Sync metadata for cloud backup
CREATE TABLE IF NOT EXISTS sync_metadata (
    user_id TEXT PRIMARY KEY,
    last_sync TEXT,
    blob_size INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- AI audit log for debugging and cost tracking
CREATE TABLE IF NOT EXISTS ai_audit_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    request_type TEXT NOT NULL CHECK(request_type IN ('insights', 'food_analysis')),
    provider TEXT NOT NULL CHECK(provider IN ('cloudflare', 'openai')),
    tokens_used INTEGER,
    explanation TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_log_user ON ai_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_audit_log_created ON ai_audit_log(created_at);
