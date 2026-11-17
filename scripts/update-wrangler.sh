#!/bin/bash

# Update wrangler.toml with actual resource IDs from provisioning

set -e

echo "📝 Updating wrangler.toml with provisioned resource IDs..."
echo ""

# Check if resource IDs file exists
if [ ! -f ".resource_ids.tmp" ]; then
    echo "❌ Resource IDs file not found. Please run ./scripts/provision.sh first."
    exit 1
fi

# Source the resource IDs
source .resource_ids.tmp

echo "Updating for environment: $ENVIRONMENT"
echo "   DB_ID: $DB_ID"
echo "   TOKEN_KV_ID: $TOKEN_KV_ID"
echo "   RATE_LIMIT_KV_ID: $RATE_LIMIT_KV_ID"
echo "   EXTERNAL_KV_ID: $EXTERNAL_KV_ID"
echo ""

# Validate we have the IDs
if [ -z "$DB_ID" ] || [ -z "$TOKEN_KV_ID" ] || [ -z "$RATE_LIMIT_KV_ID" ] || [ -z "$EXTERNAL_KV_ID" ]; then
    echo "❌ Missing some resource IDs. Cannot update wrangler.toml."
    echo "   Please check .resource_ids.tmp and run provision.sh again if needed."
    exit 1
fi

# Update wrangler.toml based on environment
if [ "$ENVIRONMENT" == "production" ]; then
    # Update production D1 database ID
    sed -i "s/database_id = \"placeholder-prod-d1-id\"/database_id = \"$DB_ID\"/g" wrangler.toml
    
    # Update production KV IDs
    sed -i "s/id = \"placeholder-prod-token-kv-id\"/id = \"$TOKEN_KV_ID\"/g" wrangler.toml
    sed -i "s/id = \"placeholder-prod-rate-limit-kv-id\"/id = \"$RATE_LIMIT_KV_ID\"/g" wrangler.toml
    sed -i "s/id = \"placeholder-prod-external-kv-id\"/id = \"$EXTERNAL_KV_ID\"/g" wrangler.toml
else
    # Update development D1 database ID
    sed -i "s/database_id = \"placeholder-d1-database-id\"/database_id = \"$DB_ID\"/g" wrangler.toml
    sed -i "s/database_id = \"placeholder-dev-d1-id\"/database_id = \"$DB_ID\"/g" wrangler.toml
    
    # Update development KV IDs
    sed -i "s/id = \"placeholder-token-kv-id\"/id = \"$TOKEN_KV_ID\"/g" wrangler.toml
    sed -i "s/id = \"placeholder-dev-token-kv-id\"/id = \"$TOKEN_KV_ID\"/g" wrangler.toml
    
    sed -i "s/id = \"placeholder-rate-limit-kv-id\"/id = \"$RATE_LIMIT_KV_ID\"/g" wrangler.toml
    sed -i "s/id = \"placeholder-dev-rate-limit-kv-id\"/id = \"$RATE_LIMIT_KV_ID\"/g" wrangler.toml
    
    sed -i "s/id = \"placeholder-external-kv-id\"/id = \"$EXTERNAL_KV_ID\"/g" wrangler.toml
    sed -i "s/id = \"placeholder-dev-external-kv-id\"/id = \"$EXTERNAL_KV_ID\"/g" wrangler.toml
fi

echo "✅ wrangler.toml updated successfully!"
echo ""

# Show the relevant sections
echo "Updated configuration:"
if [ "$ENVIRONMENT" == "production" ]; then
    grep -A 20 "\[env.production\]" wrangler.toml | head -25
else
    grep -A 5 "\[\[d1_databases\]\]" wrangler.toml | head -10
    echo "..."
    grep -A 3 "TOKEN_KV" wrangler.toml | head -5
fi

echo ""
echo "💡 Next steps:"
echo "   1. Initialize database schema: npx wrangler d1 execute $DB_NAME --file=src/db/schema.sql"
echo "   2. Deploy worker: npx wrangler deploy"
echo "   3. Run tests: node tests/run-all-tests.js"

# Clean up temp file
rm .resource_ids.tmp
