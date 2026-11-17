#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const testFiles = [
    // Phase 2 tests
    'test-import-export.js',
    'test-custom-types.js',
    'test-correlation.js',
    'test-external-data.js',
    // Phase 3 tests
    'test-password.js',
    'test-jwt.js',
    'test-auth-client.js',
    'test-api-routing.js',
    // Phase 4 tests
    'test-stripe.js',
    'test-sync.js',
    'test-ai.js',
    'test-food-analysis.js'
];

const testDir = __dirname;

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║       Pattern Tracker - Phase 2+3+4 Test Suite             ║');
console.log('╚════════════════════════════════════════════════════════════╝');

let totalPassed = 0;
let totalFailed = 0;
let totalTests = 0;

async function runTest(testFile) {
    return new Promise((resolve, reject) => {
        const testPath = path.join(testDir, testFile);
        
        if (!fs.existsSync(testPath)) {
            console.error(`\n❌ Test file not found: ${testFile}`);
            resolve({ passed: 0, failed: 1, total: 1 });
            return;
        }

        console.log(`\n${'='.repeat(60)}`);
        console.log(`Running: ${testFile}`);
        console.log('='.repeat(60));

        // Real Node WebStorage (SQLite-backed) — each suite gets an isolated
        // localStorage file so suites cannot leak state into each other.
        const storageFile = path.join(os.tmpdir(), `pt-test-ls-${testFile}.sqlite`);
        const child = spawn('node', [
            '--experimental-webstorage',
            `--localstorage-file=${storageFile}`,
            testPath
        ], {
            stdio: 'inherit',
            cwd: testDir,
            env: { ...process.env, NODE_NO_WARNINGS: '1' }
        });

        child.on('close', (code) => {
            for (const suffix of ['', '-shm', '-wal']) {
                try { fs.unlinkSync(storageFile + suffix); } catch (_e) { /* missing */ }
            }
            if (code === 0) {
                resolve({ success: true });
            } else {
                resolve({ success: false });
            }
        });

        child.on('error', (error) => {
            console.error(`\n❌ Error running ${testFile}:`, error.message);
            resolve({ success: false });
        });
    });
}

async function runAllTests() {
    const results = [];
    const startTime = Date.now();

    for (const testFile of testFiles) {
        const result = await runTest(testFile);
        results.push({ file: testFile, ...result });
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log('\n\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    FINAL SUMMARY                           ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    results.forEach(result => {
        const status = result.success ? '✅ PASS' : '❌ FAIL';
        console.log(`  ${status}  ${result.file}`);
    });

    console.log('\n' + '─'.repeat(60));
    console.log(`Test Suites: ${successCount} passed, ${failureCount} failed, ${results.length} total`);
    console.log(`Time:        ${duration}s`);
    console.log('─'.repeat(60));

    if (failureCount === 0) {
        console.log('\n🎉 All test suites passed!\n');
        process.exit(0);
    } else {
        console.log('\n⚠️  Some test suites failed.\n');
        process.exit(1);
    }
}

runAllTests().catch(error => {
    console.error('\n❌ Fatal error running tests:', error);
    process.exit(1);
});
