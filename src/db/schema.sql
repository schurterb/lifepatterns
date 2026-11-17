-- Pattern Tracker D1 Database Schema
-- Phase 3: Backend Foundation
-- Version: 1

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    tier TEXT DEFAULT 'free' CHECK(tier IN ('free', 'paid')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    reminder_time TEXT, -- HH:MM format for push reminders
    reminder_types TEXT, -- JSON array of enabled types for reminders
    -- Phase 4: Subscription fields
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    subscription_status TEXT DEFAULT 'none' CHECK(subscription_status IN ('none', 'active', 'canceled', 'past_due')),
    subscription_period_end TEXT
);

-- Index for email lookups (login)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Push subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    user_agent_hash TEXT, -- For token binding validation
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for user's subscriptions
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- Cached weather data
CREATE TABLE IF NOT EXISTS weather_cache (
    id TEXT PRIMARY KEY,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    temperature REAL,
    humidity REAL,
    pressure REAL,
    conditions TEXT,
    fetched_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

-- Index for location-based lookups
CREATE INDEX IF NOT EXISTS idx_weather_cache_location ON weather_cache(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_weather_cache_expires ON weather_cache(expires_at);

-- Cached geomagnetic data
CREATE TABLE IF NOT EXISTS geomagnetic_cache (
    id TEXT PRIMARY KEY,
    kp_index REAL,
    storm_level TEXT CHECK(storm_level IN ('none', 'minor', 'moderate', 'strong', 'severe', 'extreme')),
    fetched_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

-- Index for expiration cleanup
CREATE INDEX IF NOT EXISTS idx_geomagnetic_cache_expires ON geomagnetic_cache(expires_at);

-- Token revocation list (alternative to KV for persistence)
-- Note: KV is preferred for TTL-based revocation, this is backup
CREATE TABLE IF NOT EXISTS revoked_tokens (
    token_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    revoked_at TEXT NOT NULL,
    expires_at TEXT NOT NULL -- TTL for cleanup
);

-- Index for cleanup and user lookups
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_user ON revoked_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens(expires_at);

-- ============================================
-- Phase 4: Premium Features
-- ============================================

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

-- Index for user's AI usage
CREATE INDEX IF NOT EXISTS idx_ai_audit_log_user ON ai_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_audit_log_created ON ai_audit_log(created_at);
