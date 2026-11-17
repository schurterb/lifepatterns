#!/bin/bash
# Phase 4 Setup Script
# Configures R2, Stripe, and OpenAI for premium features

set -e

ENV="${1:-development}"
echo "=== Phase 4 Setup ($ENV) ==="

# Check wrangler
if ! command -v wrangler &> /dev/null && ! command -v npx &> /dev/null; then
    echo "Error: wrangler not found"
    exit 1
fi

WRANGLER="npx wrangler"

# Step 1: R2 Bucket
echo ""
echo "--- Step 1: R2 Bucket ---"
echo "Checking R2 status..."

if $WRANGLER r2 bucket list 2>&1 | grep -q "pattern-tracker-sync"; then
    echo "✓ Bucket 'pattern-tracker-sync' exists"
else
    echo "Creating R2 bucket..."
    if $WRANGLER r2 bucket create pattern-tracker-sync 2>&1 | grep -q "error"; then
        echo ""
        echo "⚠️  R2 not enabled. Please:"
        echo "   1. Go to Cloudflare Dashboard"
        echo "   2. Click R2 in sidebar"
        echo "   3. Enable R2 (requires payment method)"
        echo "   4. Re-run this script"
        echo ""
        read -p "Press Enter after enabling R2..."
        $WRANGLER r2 bucket create pattern-tracker-sync
    fi
    echo "✓ Bucket created"
fi

# Step 2: Enable R2 binding in wrangler.toml
echo ""
echo "--- Step 2: R2 Binding ---"
TOML_FILE="wrangler.toml"

if grep -q "^# \[\[env.$ENV.r2_buckets\]\]" "$TOML_FILE"; then
    echo "Uncommenting R2 binding in wrangler.toml..."
    sed -i "s/^# \[\[env.$ENV.r2_buckets\]\]/[[env.$ENV.r2_buckets]]/" "$TOML_FILE"
    sed -i "s/^# binding = \"SYNC_BUCKET\"/binding = \"SYNC_BUCKET\"/" "$TOML_FILE"
    sed -i "s/^# bucket_name = \"pattern-tracker-sync\"/bucket_name = \"pattern-tracker-sync\"/" "$TOML_FILE"
    echo "✓ R2 binding enabled"
else
    echo "✓ R2 binding already configured"
fi

# Step 3: Stripe secrets
echo ""
echo "--- Step 3: Stripe Secrets ---"
echo "Get these from: https://dashboard.stripe.com/apikeys"
echo ""

read -p "Enter Stripe Secret Key (sk_...): " STRIPE_SK
if [ -n "$STRIPE_SK" ]; then
    echo "$STRIPE_SK" | $WRANGLER secret put STRIPE_SECRET_KEY --env "$ENV"
    echo "✓ STRIPE_SECRET_KEY set"
fi

read -p "Enter Stripe Webhook Secret (whsec_...): " STRIPE_WH
if [ -n "$STRIPE_WH" ]; then
    echo "$STRIPE_WH" | $WRANGLER secret put STRIPE_WEBHOOK_SECRET --env "$ENV"
    echo "✓ STRIPE_WEBHOOK_SECRET set"
fi

# Step 4: Stripe Price IDs
echo ""
echo "--- Step 4: Stripe Price IDs ---"
echo "Create products at: https://dashboard.stripe.com/products"
echo "  - Monthly: \$4/month"
echo "  - Annual: \$40/year"
echo ""

read -p "Enter Monthly Price ID (price_...): " PRICE_MONTHLY
if [ -n "$PRICE_MONTHLY" ]; then
    echo "$PRICE_MONTHLY" | $WRANGLER secret put STRIPE_MONTHLY_PRICE_ID --env "$ENV"
    echo "✓ STRIPE_MONTHLY_PRICE_ID set"
fi

read -p "Enter Annual Price ID (price_...): " PRICE_ANNUAL
if [ -n "$PRICE_ANNUAL" ]; then
    echo "$PRICE_ANNUAL" | $WRANGLER secret put STRIPE_ANNUAL_PRICE_ID --env "$ENV"
    echo "✓ STRIPE_ANNUAL_PRICE_ID set"
fi

# Step 5: OpenAI (fallback)
echo ""
echo "--- Step 5: OpenAI API Key (fallback) ---"
echo "Get from: https://platform.openai.com/api-keys"
echo ""

read -p "Enter OpenAI API Key (sk-...): " OPENAI_KEY
if [ -n "$OPENAI_KEY" ]; then
    echo "$OPENAI_KEY" | $WRANGLER secret put OPENAI_API_KEY --env "$ENV"
    echo "✓ OPENAI_API_KEY set"
fi

# Step 6: Deploy
echo ""
echo "--- Step 6: Deploy ---"
read -p "Deploy worker now? [y/N]: " DEPLOY
if [[ "$DEPLOY" =~ ^[Yy]$ ]]; then
    $WRANGLER deploy --env "$ENV"
    echo "✓ Deployed"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Verify endpoints:"
echo "  curl https://pattern-tracker-dev.gods-artificer.workers.dev/health"
echo ""
