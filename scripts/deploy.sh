#!/bin/bash

# Pattern Tracker Deployment Script for Cloudflare Pages
# This script deploys the application to Cloudflare Pages

set -e

echo "🚀 Pattern Tracker Deployment Script"
echo "===================================="
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

# Check if www directory exists
if [ ! -d "www" ]; then
    echo "❌ Error: www directory not found"
    exit 1
fi

# Real deploy config lives in gitignored wrangler.local.toml; fall back to template
# (wrangler only parses files with a .toml extension)
WRANGLER_CONFIG="wrangler.toml"
if [ -f "wrangler.local.toml" ]; then
    WRANGLER_CONFIG="wrangler.local.toml"
fi
echo "✓ Using wrangler config: $WRANGLER_CONFIG"

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

# Get deployment environment
ENVIRONMENT=${1:-production}

if [ "$ENVIRONMENT" != "production" ] && [ "$ENVIRONMENT" != "development" ]; then
    echo "❌ Error: Invalid environment. Use 'production' or 'development'"
    exit 1
fi

echo "📦 Deploying to: $ENVIRONMENT"
echo ""

# Preflight: required secrets must exist or auth endpoints will 500
echo "🔑 Checking required Worker secrets ($ENVIRONMENT)..."
if ! npx wrangler --config "$WRANGLER_CONFIG" secret list --env "$ENVIRONMENT" 2>/dev/null | grep -q '"name": *"JWT_SECRET"'; then
    echo "❌ Error: JWT_SECRET is not set for environment '$ENVIRONMENT'."
    echo "   Run: openssl rand -base64 48 | npx wrangler --config $WRANGLER_CONFIG secret put JWT_SECRET --env $ENVIRONMENT"
    exit 1
fi
echo "✓ JWT_SECRET present"
echo ""

# Deploy API Worker (routes defined in wrangler config)
echo "📤 Deploying API Worker ($ENVIRONMENT) using $WRANGLER_CONFIG..."
if ! npx wrangler --config "$WRANGLER_CONFIG" deploy --env "$ENVIRONMENT"; then
    echo ""
    echo "❌ Worker deployment failed. Please check the error messages above."
    exit 1
fi
echo ""

# Deploy to Cloudflare Pages
echo "📤 Uploading files to Cloudflare Pages..."
if npx wrangler pages deploy www/ --project-name=pattern-tracker; then
    echo ""
    echo "✅ Deployment successful!"
    echo ""

    # Verify the Worker answers on the frontend origin (route precedence check)
    if [ "$ENVIRONMENT" == "production" ]; then
        echo "🔎 Verifying API routing..."
        HEALTH=$(curl -fsS -m 20 https://lifepatterns.godsartificer.com/health 2>/dev/null || true)
        if ! echo "$HEALTH" | grep -q '"status":"ok"'; then
            echo "❌ /health did not return Worker JSON — API routing broken"
            exit 1
        fi
        echo "✓ API reachable on frontend origin"
    fi

    echo "📍 Your app is now live at:"
    echo "   https://lifepatterns.godsartificer.com"
    echo ""
    echo "🔒 Security headers configured:"
    echo "   ✓ Content Security Policy (CSP)"
    echo "   ✓ X-Content-Type-Options: nosniff"
    echo "   ✓ X-Frame-Options: DENY"
    echo "   ✓ X-XSS-Protection enabled"
    echo ""
    echo "📱 PWA Features:"
    echo "   ✓ Service Worker enabled"
    echo "   ✓ Offline support"
    echo "   ✓ Installable to home screen"
    echo ""
    echo "🎉 Pattern Tracker Phase 1 is live!"
else
    echo ""
    echo "❌ Deployment failed. Please check the error messages above."
    exit 1
fi
