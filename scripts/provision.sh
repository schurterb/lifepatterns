#!/bin/bash

# Pattern Tracker - Cloudflare Resources Provisioning Script
# Creates D1 database and KV namespaces for Phase 3 backend

set -e

echo "🔧 Pattern Tracker Resource Provisioning"
echo "========================================="
echo ""

# Check if wrangler is installed
if ! command -v npx &> /dev/null; then
    echo "❌ Error: Node.js/npm is not installed"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "wrangler.toml" ]; then
    echo "❌ Error: wrangler.toml not found. Please run this script from the project root."
    exit 1
fi

echo "✓ Environment check passed"
echo ""

# Verify Wrangler authentication
echo "🔐 Checking Cloudflare authentication..."
if ! npx wrangler whoami > /dev/null 2>&1; then
    echo "❌ Error: Not authenticated with Cloudflare"
    echo "Please run: npx wrangler login"
    exit 1
fi
echo "✓ Authenticated with Cloudflare"
echo ""

# Get environment (default to development)
ENVIRONMENT=${1:-development}

if [ "$ENVIRONMENT" != "production" ] && [ "$ENVIRONMENT" != "development" ]; then
    echo "❌ Error: Invalid environment. Use 'production' or 'development'"
    exit 1
fi

echo "🎯 Provisioning for environment: $ENVIRONMENT"
echo ""

# Set resource suffix based on environment
if [ "$ENVIRONMENT" == "production" ]; then
    DB_NAME="pattern-tracker-db-prod"
    SUFFIX="prod"
else
    DB_NAME="pattern-tracker-db-dev"
    SUFFIX="dev"
fi

# Track created resource IDs
DB_ID=""
TOKEN_KV_ID=""
RATE_LIMIT_KV_ID=""
EXTERNAL_KV_ID=""

# Create D1 Database
echo "📦 Creating D1 Database: $DB_NAME..."
DB_OUTPUT=$(npx wrangler d1 create "$DB_NAME" 2>&1) || {
    if echo "$DB_OUTPUT" | grep -q "already exists"; then
        echo "   ℹ️  Database already exists, retrieving ID..."
        # Extract existing database ID
        DB_ID=$(npx wrangler d1 list --json 2>/dev/null | grep -o '"name":"'$DB_NAME'"[^}]*' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        if [ -z "$DB_ID" ]; then
            echo "❌ Could not retrieve existing database ID"
            exit 1
        fi
        echo "   ✓ Retrieved existing database ID: $DB_ID"
    else
        echo "❌ Failed to create database: $DB_OUTPUT"
        exit 1
    fi
}

if [ -z "$DB_ID" ]; then
    # Extract database ID from creation output
    DB_ID=$(echo "$DB_OUTPUT" | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -z "$DB_ID" ]; then
        DB_ID=$(echo "$DB_OUTPUT" | grep -oP 'id = "\K[^"]+' | head -1)
    fi
fi

if [ -n "$DB_ID" ]; then
    echo "   ✓ Database created/retrieved with ID: $DB_ID"
else
    echo "   ⚠️  Could not extract database ID from output"
    echo "   Output was: $DB_OUTPUT"
fi
echo ""

# Create KV Namespaces
echo "🗃️  Creating KV Namespaces..."

# Token KV
TOKEN_KV_NAME="pattern-tracker-tokens-$SUFFIX"
echo "   Creating $TOKEN_KV_NAME..."
TOKEN_OUTPUT=$(npx wrangler kv:namespace create "$TOKEN_KV_NAME" 2>&1) || {
    if echo "$TOKEN_OUTPUT" | grep -q "already exists\|title has already been taken"; then
        echo "      ℹ️  Namespace already exists, retrieving ID..."
        TOKEN_KV_ID=$(npx wrangler kv:namespace list --json 2>/dev/null | grep -o '"title":"'$TOKEN_KV_NAME'"[^}]*' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        if [ -n "$TOKEN_KV_ID" ]; then
            echo "      ✓ Retrieved existing ID: $TOKEN_KV_ID"
        fi
    else
        echo "      ⚠️  Failed to create token KV: $TOKEN_OUTPUT"
    fi
}
if [ -z "$TOKEN_KV_ID" ]; then
    TOKEN_KV_ID=$(echo "$TOKEN_OUTPUT" | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -z "$TOKEN_KV_ID" ]; then
        TOKEN_KV_ID=$(echo "$TOKEN_OUTPUT" | grep -oP 'id = "\K[^"]+' | head -1)
    fi
fi
if [ -n "$TOKEN_KV_ID" ]; then
    echo "      ✓ Token KV ID: $TOKEN_KV_ID"
fi

# Rate Limit KV
RATE_LIMIT_KV_NAME="pattern-tracker-rate-limit-$SUFFIX"
echo "   Creating $RATE_LIMIT_KV_NAME..."
RATE_OUTPUT=$(npx wrangler kv:namespace create "$RATE_LIMIT_KV_NAME" 2>&1) || {
    if echo "$RATE_OUTPUT" | grep -q "already exists\|title has already been taken"; then
        echo "      ℹ️  Namespace already exists, retrieving ID..."
        RATE_LIMIT_KV_ID=$(npx wrangler kv:namespace list --json 2>/dev/null | grep -o '"title":"'$RATE_LIMIT_KV_NAME'"[^}]*' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        if [ -n "$RATE_LIMIT_KV_ID" ]; then
            echo "      ✓ Retrieved existing ID: $RATE_LIMIT_KV_ID"
        fi
    else
        echo "      ⚠️  Failed to create rate limit KV: $RATE_OUTPUT"
    fi
}
if [ -z "$RATE_LIMIT_KV_ID" ]; then
    RATE_LIMIT_KV_ID=$(echo "$RATE_OUTPUT" | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -z "$RATE_LIMIT_KV_ID" ]; then
        RATE_LIMIT_KV_ID=$(echo "$RATE_OUTPUT" | grep -oP 'id = "\K[^"]+' | head -1)
    fi
fi
if [ -n "$RATE_LIMIT_KV_ID" ]; then
    echo "      ✓ Rate Limit KV ID: $RATE_LIMIT_KV_ID"
fi

# External Data KV
EXTERNAL_KV_NAME="pattern-tracker-external-$SUFFIX"
echo "   Creating $EXTERNAL_KV_NAME..."
EXTERNAL_OUTPUT=$(npx wrangler kv:namespace create "$EXTERNAL_KV_NAME" 2>&1) || {
    if echo "$EXTERNAL_OUTPUT" | grep -q "already exists\|title has already been taken"; then
        echo "      ℹ️  Namespace already exists, retrieving ID..."
        EXTERNAL_KV_ID=$(npx wrangler kv:namespace list --json 2>/dev/null | grep -o '"title":"'$EXTERNAL_KV_NAME'"[^}]*' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        if [ -n "$EXTERNAL_KV_ID" ]; then
            echo "      ✓ Retrieved existing ID: $EXTERNAL_KV_ID"
        fi
    else
        echo "      ⚠️  Failed to create external KV: $EXTERNAL_OUTPUT"
    fi
}
if [ -z "$EXTERNAL_KV_ID" ]; then
    EXTERNAL_KV_ID=$(echo "$EXTERNAL_OUTPUT" | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -z "$EXTERNAL_KV_ID" ]; then
        EXTERNAL_KV_ID=$(echo "$EXTERNAL_OUTPUT" | grep -oP 'id = "\K[^"]+' | head -1)
    fi
fi
if [ -n "$EXTERNAL_KV_ID" ]; then
    echo "      ✓ External KV ID: $EXTERNAL_KV_ID"
fi

echo ""
echo "========================================="
echo "✅ Resource Provisioning Complete!"
echo ""
echo "Created Resources:"
if [ -n "$DB_ID" ]; then
    echo "   D1 Database:       $DB_ID"
fi
if [ -n "$TOKEN_KV_ID" ]; then
    echo "   Token KV:          $TOKEN_KV_ID"
fi
if [ -n "$RATE_LIMIT_KV_ID" ]; then
    echo "   Rate Limit KV:     $RATE_LIMIT_KV_ID"
fi
if [ -n "$EXTERNAL_KV_ID" ]; then
    echo "   External Data KV:  $EXTERNAL_KV_ID"
fi
echo ""

# Output for wrangler.toml update
echo "📝 Update your wrangler.toml with these IDs:"
echo ""
if [ "$ENVIRONMENT" == "production" ]; then
    echo "[env.production.d1_databases]"
    echo "binding = \"DB\""
    echo "database_name = \"$DB_NAME\""
    echo "database_id = \"$DB_ID\""
    echo ""
    echo "[[env.production.kv_namespaces]]"
    echo "binding = \"TOKEN_KV\""
    echo "id = \"$TOKEN_KV_ID\""
    echo ""
    echo "[[env.production.kv_namespaces]]"
    echo "binding = \"RATE_LIMIT_KV\""
    echo "id = \"$RATE_LIMIT_KV_ID\""
    echo ""
    echo "[[env.production.kv_namespaces]]"
    echo "binding = \"EXTERNAL_KV\""
    echo "id = \"$EXTERNAL_KV_ID\""
else
    echo "[[d1_databases]]"
    echo "binding = \"DB\""
    echo "database_name = \"$DB_NAME\""
    echo "database_id = \"$DB_ID\""
    echo ""
    echo "[[kv_namespaces]]"
    echo "binding = \"TOKEN_KV\""
    echo "id = \"$TOKEN_KV_ID\""
    echo ""
    echo "[[kv_namespaces]]"
    echo "binding = \"RATE_LIMIT_KV\""
    echo "id = \"$RATE_LIMIT_KV_ID\""
    echo ""
    echo "[[kv_namespaces]]"
    echo "binding = \"EXTERNAL_KV\""
    echo "id = \"$EXTERNAL_KV_ID\""
fi
echo ""

# Save IDs to a temp file for automated update
cat > .resource_ids.tmp <<EOF
ENVIRONMENT=$ENVIRONMENT
DB_ID=$DB_ID
TOKEN_KV_ID=$TOKEN_KV_ID
RATE_LIMIT_KV_ID=$RATE_LIMIT_KV_ID
EXTERNAL_KV_ID=$EXTERNAL_KV_ID
DB_NAME=$DB_NAME
EOF

echo "💡 To automatically update wrangler.toml, run:"
echo "   ./scripts/update-wrangler.sh"
echo ""
echo "🎉 Provisioning complete!"
