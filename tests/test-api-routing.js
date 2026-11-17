#!/usr/bin/env node
'use strict';

/**
 * API routing drift guard (static file checks, no network)
 *
 * Verifies that every endpoint routed inside src/worker.js is:
 *   - reachable from the frontend origin via a route pattern in the wrangler
 *     production config(s)
 *   - excluded from the service worker's cache-first handling (www/sw.js)
 * and that secrets/config drift cannot reintroduce the signup failure:
 *   - scripts/deploy.sh deploys the Worker with --env
 *   - no JWT_SECRET var assignment exists in either wrangler config
 */

const fs = require('fs');
const path = require('path');
const { TestHarness, assertTrue } = require('./test-harness');

const ROOT = path.join(__dirname, '..');
const harness = new TestHarness();

const readFile = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

const workerSrc = readFile('src/worker.js');
const swSrc = readFile('www/sw.js');
const deploySrc = readFile('scripts/deploy.sh');
const wranglerFiles = ['wrangler.toml', 'wrangler.local.toml', 'wrangler.toml.local']
    .filter(f => fs.existsSync(path.join(ROOT, f)))
    .map(readFile);

// Extract endpoint paths from `path === '/…'` checks in worker.js
const endpointPaths = [...workerSrc.matchAll(/path === '([^']+)'/g)].map(m => m[1]);

// Extract production route patterns from wrangler config(s)
const wranglerRoutePatterns = wranglerFiles.flatMap(src =>
    [...src.matchAll(/pattern\s*=\s*"([^"]+)"/g)].map(m => m[1])
);

// Extract API prefixes listed in the API_PREFIXES array in sw.js
const prefixesBlock = (swSrc.match(/API_PREFIXES\s*=\s*\[([^\]]*)\]/s) || [])[1] || '';
const apiPrefixes = [...prefixesBlock.matchAll(/'([^']+)'/g)].map(m => m[1]);

// Turns a route pattern like "host/auth/*" into a matcher for a path
function routeMatchesPath(pattern, endpoint) {
    const slashIdx = pattern.indexOf('/');
    if (slashIdx === -1) return false;
    const pathPattern = pattern.slice(slashIdx);
    if (pathPattern.endsWith('*')) {
        return endpoint.startsWith(pathPattern.slice(0, -1));
    }
    return endpoint === pathPattern;
}

harness.describe('API Routing Guard', () => {

    harness.it('should find API endpoints in src/worker.js', () => {
        assertTrue(endpointPaths.length >= 10, `expected >=10 endpoints, found ${endpointPaths.length}`);
        assertTrue(endpointPaths.includes('/auth/register'), 'worker should route /auth/register');
        assertTrue(endpointPaths.includes('/account'), 'worker should route /account');
    });

    harness.it('should cover every endpoint with a wrangler route pattern', () => {
        assertTrue(wranglerRoutePatterns.length >= 8,
            `expected >=8 route patterns, found ${wranglerRoutePatterns.length}`);
        for (const endpoint of endpointPaths) {
            const covered = wranglerRoutePatterns.some(p => routeMatchesPath(p, endpoint));
            assertTrue(covered, `endpoint ${endpoint} has no matching wrangler route pattern`);
        }
    });

    harness.it('should exclude every endpoint from the service worker cache', () => {
        assertTrue(apiPrefixes.length >= 8, `expected >=8 API_PREFIXES entries, found ${apiPrefixes.length}`);
        for (const endpoint of endpointPaths) {
            const covered = apiPrefixes.some(p => endpoint.startsWith(p));
            assertTrue(covered, `endpoint ${endpoint} not covered by sw.js API_PREFIXES`);
        }
    });

    harness.it('should have PUT /account routed in the Worker (client updateAccount)', () => {
        assertTrue(
            /path === '\/account' && method === 'PUT'/.test(workerSrc),
            'PUT /account route missing from worker.js'
        );
    });

    harness.it('should deploy the Worker in scripts/deploy.sh', () => {
        assertTrue(
            /wrangler .*deploy --env/.test(deploySrc),
            'deploy.sh should run `wrangler deploy --env`'
        );
    });

    harness.it('should verify JWT_SECRET exists before deploying', () => {
        assertTrue(
            /secret list --env/.test(deploySrc) && /JWT_SECRET/.test(deploySrc),
            'deploy.sh should preflight-check JWT_SECRET before wrangler deploy'
        );
    });

    harness.it('should not store JWT_SECRET as a var in wrangler configs', () => {
        for (const src of wranglerFiles) {
            assertTrue(
                !/^\s*JWT_SECRET\s*=/m.test(src),
                'JWT_SECRET must be set via `wrangler secret put`, not [vars]'
            );
        }
    });
});

harness.run().then(passed => process.exit(passed ? 0 : 1));
