# <img src="www/assets/icons/favicon.svg" alt="Life Patterns logo" width="48" valign="middle"> Life Patterns

A privacy-first, local-first PWA for tracking daily metrics and discovering patterns in your own life.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: In Development](https://img.shields.io/badge/Status-In%20Development-orange.svg)]()

> **Disclaimer:** Life Patterns is a personal wellness tracking tool — it does **not** provide medical advice. Insights and correlations are observational. Consult a healthcare professional for medical concerns.
>
> **Status:** This project is in active development. Some features — including accounts, cloud sync, and other paid-tier features — are not yet fully implemented.

Log mood, sleep, exercise, nutrition, and more — then visualize trends and surface correlations between what you do and how you feel. All data stays on your device by default; optional end-to-end-encrypted cloud sync is available for backup and multi-device access.

<!-- TODO: Add screenshots
![Home screen](docs/screenshot-home.png)
![Pattern visualizer](docs/screenshot-visualizer.png)
-->

## Features

- **Local-first storage** — all entries live in IndexedDB on your device; no account required
- **Flexible tracking** — mood, sleep, exercise, nutrition, water, medication, weight, temperature, and pain out of the box, plus user-defined custom data types
- **Pattern visualizer** — interactive charts with lagged correlation analysis (e.g., "how does yesterday's sleep affect today's mood?")
- **Environmental context** — weather (Open-Meteo), geomagnetic activity (NOAA SWPC), and more, logged alongside your entries
- **Import/export** — full CSV and JSON backup/restore with hardened import validation
- **Installable PWA** — service worker for offline use, add-to-home-screen on mobile
- **Reminders** — in-app prompts and Web Push notifications at configurable times
- **Optional accounts & sync** *(in development)* — JWT-authenticated backend with end-to-end-encrypted cloud sync (AES-GCM-256; the server only ever stores ciphertext)
- **AI-powered insights** *(in development)* — pattern summaries via Cloudflare Workers AI (OpenAI fallback) and photo-based nutrition estimation (paid tier)
- **Subscriptions** *(in development)* — Stripe-powered paid tier for sync and AI features

## Getting Started (Users)

Life Patterns is a Progressive Web App — no app store needed.

1. Open **https://lifepatterns.godsartificer.com** in your phone's browser
2. Install it:
   - **Android (Chrome):** tap the ⋮ menu → **Add to Home screen** / **Install app**
   - **iOS (Safari):** tap **Share** → **Add to Home Screen**
3. Launch **Life Patterns** from your home screen — it works offline

> **iOS note:** push reminders require the Home Screen install above and iOS 16.4+.

## Getting Started (Developers)

Requires Python 3 (static dev server) and Node.js + npm (tests and Wrangler).

```bash
npm install
npm run dev        # serves www/ at http://localhost:8000
npm test           # runs the full test suite (11 suites)
```

The app is fully usable offline/local-only — no backend needed for core tracking.

## Backend Setup (optional)

Only needed to run the Worker API (accounts, sync, push, AI, subscriptions).

```bash
npx wrangler login

# 1. Provision D1 + KV resources (writes .resource_ids.tmp)
./scripts/provision.sh development

# 2. Fill resource IDs into wrangler.toml placeholders
./scripts/update-wrangler.sh

# 3. Initialize the database schema
npx wrangler d1 execute pattern-tracker-db-dev --file=src/db/schema.sql

# 4. Set secrets (never committed)
npx wrangler secret put JWT_SECRET --env development
# For local `wrangler dev`, create .dev.vars with: JWT_SECRET=<value>

# 5. Deploy the worker
npx wrangler deploy --env development
```

Optional paid-tier setup (R2 bucket, Stripe keys, OpenAI key):

```bash
./scripts/setup-phase4.sh development
```

## Deployment

- **`npm run deploy`** (production) or **`npm run deploy:dev`** (development) — deploys the API Worker first, then the static frontend to Cloudflare Pages, then verifies `GET /health` returns Worker JSON on the app origin.
- **`npm run deploy:worker`** — deploys only the Worker (`--config wrangler.prod.toml --env production`).

The API is served **same-origin**: production Worker routes (`<host>/auth/*`, `/account*`, `/push/*`, `/data/*`, `/subscription/*`, `/sync/*`, `/ai/*`, `/health`) are defined under `[env.production]` in the wrangler config and take precedence over Pages static serving on the shared hostname. This keeps HttpOnly cookie auth and CSP `connect-src 'self'` working with no client-side API base URL.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Static frontend (www/) — Cloudflare Pages   │
│  Vanilla JS + vendored libs, zero build      │
│  IndexedDB (Dexie) + LocalStorage            │
└──────────────┬──────────────────────────────┘
               │ HTTPS (JWT auth)
┌──────────────▼──────────────────────────────┐
│  Cloudflare Worker API (src/)                │
│  auth · push · data · account · sync · ai    │
│  ┌────────┬──────────────┬────────┬───────┐  │
│  │ D1 DB  │ KV (tokens,  │ R2     │Workers│  │
│  │ users, │ rate limit,  │ sync   │ AI    │  │
│  │ cache) │ external)    │ bucket │ +OA*  │  │
│  └────────┴──────────────┴────────┴───────┘  │
└─────────────────────────────────────────────┘
              *OpenAI fallback
```

## Tech Stack

**Frontend** — no build step; libraries vendored in `www/vendor/` with SRI hashes (see `www/vendor/MANIFEST.json`):

- Alpine.js 3.14.1 — reactive UI
- Chart.js 4.4.1 — visualization
- Dexie.js 3.2.4 — IndexedDB wrapper
- DOMPurify 3.0.9 — XSS-safe sanitization

**Backend** — Cloudflare Workers (ES modules):

- D1 (SQLite) — users, push subscriptions, cached environmental data
- KV — token revocation, rate limiting, external-data cache
- R2 — encrypted sync payloads
- Workers AI — insights and food-photo analysis (OpenAI fallback)
- Stripe — subscription billing

**Security** — PBKDF2-SHA256 (600k iterations) password hashing, JWT access/refresh with KV-backed revocation, per-route KV rate limiting, strict CSP via `www/_headers`, client-side AES-GCM encryption for sync, CSV formula-injection escaping on export.

## Project Structure

```
pattern_tracker/
├── src/            # Cloudflare Worker API
│   ├── controllers/  # auth, push, data, account, subscription, sync, ai
│   ├── services/     # password, jwt, stripe, ai-provider
│   ├── middleware/   # rate limiter
│   └── db/schema.sql # D1 schema
├── www/            # Static frontend (PWA)
│   ├── js/           # app, db, auth, sync, encryption, correlation, ...
│   ├── css/, vendor/ # styles + self-hosted libraries (SRI-verified)
│   ├── sw.js         # service worker
│   └── _headers / _redirects / manifest.json
├── tests/          # Node test harness + suites (npm test)
├── scripts/        # provisioning, deployment, phase-4 setup
├── docs/           # project documentation
└── wrangler.toml   # Cloudflare config (placeholders — see Backend Setup)
```

## License

[MIT](LICENSE)

## Author

Built by [schurterb — God's Artificer](https://godsartificer.com)
