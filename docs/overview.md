# Pattern Tracker Application

The Pattern Tracker application ("Life Patterns") is a lightweight, privacy-first web application for tracking patterns across various data types. The intention is to aid understanding one's own life and habits.

## Features

- Simple, intuitive interface
- Progressive Web App — statically hosted, installable on iOS and Android, offline-capable
- Data stored locally in the browser (IndexedDB) by default
- Custom data types can be added to track any kind of pattern
- Default data types include:
  - Mood
  - Sleep
  - Exercise
  - Nutrition - manual entry or estimated via AI-analysis of food photos
  - Water Intake
  - Medication
  - Weight
  - Temperature
  - Pain Level
- Weather, lunar phases, geomagnetic storms, etc. pulled from internet APIs (Open-Meteo, NOAA SWPC; lunar phases computed client-side)
- Reminders prompt user for data entry at specified times (in-app + Web Push)
- Data can be exported to CSV or JSON and imported from CSV or JSON.
- Optional end-to-end-encrypted cloud sync for backup and cross-device access (paid tier)
- Pattern visualizer shows trends and correlations between different data types (including lagged correlations)
- AI-powered insights and recommendations based on pattern analysis (paid tier)

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JavaScript (no build step) with self-hosted Alpine.js, Chart.js, Dexie.js, and DOMPurify in `www/vendor/` (SRI-verified)
- **Backend:** Cloudflare Workers (ES modules) in `src/`
- **Database:** Cloudflare D1 (SQLite) for accounts, push subscriptions, and cached environmental data
- **Key-value storage:** Cloudflare KV for token revocation, rate limiting, and external-data cache
- **Object storage:** Cloudflare R2 for encrypted sync payloads (paid tier)
- **Authentication:** JWT access/refresh tokens, PBKDF2-SHA256 password hashing
- **Payments:** Stripe (paid tier for sync + AI features)
- **AI:** Cloudflare Workers AI with OpenAI fallback
- **Deployment:** Cloudflare Pages (frontend) + `wrangler deploy` (Worker)

## Development

Start the frontend with `npm run dev` (serves `www/` on port 8000 — no build step). The app works fully local-only; backend setup is optional. See the README for backend provisioning and deployment instructions.
