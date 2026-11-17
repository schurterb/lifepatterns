#!/usr/bin/env node
'use strict';

/**
 * Browser-environment shims for running www/ modules under Node.js.
 *
 * Policy: no mocks — only real implementations or environment aliases.
 *   - localStorage: real Node WebStorage when run via tests/run-all-tests.js
 *     (--experimental-webstorage --localstorage-file=<tmp>). The shim below
 *     only activates for direct `node tests/<file>` runs where Node has no
 *     localStorage at all; run the suite through `npm test` for the real
 *     implementation.
 *   - Blob, File, URL, crypto, btoa/atob: native in Node 22 — never shimmed.
 *   - window: alias for the global scope (browser parity, not a mock).
 */

if (typeof localStorage === 'undefined') {
    // Minimal spec-conforming fallback for direct file execution.
    // Prefer `npm test`, which provides real SQLite-backed WebStorage.
    class LocalStorageFallback {
        constructor() { this.store = new Map(); }
        getItem(key) {
            key = String(key);
            return this.store.has(key) ? this.store.get(key) : null;
        }
        setItem(key, value) { this.store.set(String(key), String(value)); }
        removeItem(key) { this.store.delete(String(key)); }
        clear() { this.store.clear(); }
        key(index) {
            const keys = [...this.store.keys()];
            return index >= 0 && index < keys.length ? keys[index] : null;
        }
        get length() { return this.store.size; }
    }
    global.localStorage = new LocalStorageFallback();
}

// `window` mirrors the browser global scope; modules assign `window.X`.
global.window = global;
