#!/usr/bin/env node
'use strict';

const assert = require('assert');
const util = require('util');

class TestHarness {
    constructor() {
        this.tests = [];
        this.results = {
            passed: 0,
            failed: 0,
            skipped: 0,
            total: 0
        };
        this.currentSuite = null;
        this.verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
    }

    describe(suiteName, fn) {
        this.currentSuite = suiteName;
        console.log(`\n${suiteName}`);
        fn();
        this.currentSuite = null;
    }

    it(testName, fn) {
        this.tests.push({
            suite: this.currentSuite,
            name: testName,
            fn: fn
        });
    }

    async run() {
        console.log('\n=== Running Tests ===\n');
        
        for (const test of this.tests) {
            this.results.total++;
            const fullName = test.suite ? `${test.suite} > ${test.name}` : test.name;
            
            try {
                await test.fn();
                this.results.passed++;
                console.log(`  ✅ ${test.name}`);
            } catch (error) {
                this.results.failed++;
                console.log(`  ❌ ${test.name}`);
                console.log(`     Error: ${error.message}`);
                if (this.verbose && error.stack) {
                    console.log(`     ${error.stack.split('\n').slice(1, 4).join('\n     ')}`);
                }
            }
        }

        this.printSummary();
        return this.results.failed === 0;
    }

    printSummary() {
        console.log('\n=== Test Summary ===');
        console.log(`Total:   ${this.results.total}`);
        console.log(`Passed:  ${this.results.passed} ✅`);
        console.log(`Failed:  ${this.results.failed} ❌`);
        console.log(`Skipped: ${this.results.skipped}`);
        
        const passRate = ((this.results.passed / this.results.total) * 100).toFixed(1);
        console.log(`\nPass Rate: ${passRate}%`);
        
        if (this.results.failed === 0) {
            console.log('\n🎉 All tests passed!\n');
        } else {
            console.log('\n⚠️  Some tests failed.\n');
        }
    }
}

function assertEqual(actual, expected, message) {
    try {
        assert.strictEqual(actual, expected);
    } catch (error) {
        throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
}

function assertDeepEqual(actual, expected, message) {
    try {
        assert.deepStrictEqual(actual, expected);
    } catch (error) {
        throw new Error(message || `Expected ${util.inspect(expected)}, got ${util.inspect(actual)}`);
    }
}

function assertTrue(value, message) {
    if (!value) {
        throw new Error(message || `Expected true, got ${value}`);
    }
}

function assertFalse(value, message) {
    if (value) {
        throw new Error(message || `Expected false, got ${value}`);
    }
}

function assertThrows(fn, message) {
    let threw = false;
    try {
        fn();
    } catch (error) {
        threw = true;
    }
    if (!threw) {
        throw new Error(message || 'Expected function to throw an error');
    }
}

async function assertThrowsAsync(fn, message) {
    let threw = false;
    try {
        await fn();
    } catch (error) {
        threw = true;
    }
    if (!threw) {
        throw new Error(message || 'Expected async function to throw an error');
    }
}

function assertMatch(actual, pattern, message) {
    if (!pattern.test(actual)) {
        throw new Error(message || `Expected ${actual} to match ${pattern}`);
    }
}

function assertIncludes(array, value, message) {
    if (!array.includes(value)) {
        throw new Error(message || `Expected array to include ${value}`);
    }
}

function assertGreaterThan(actual, expected, message) {
    if (actual <= expected) {
        throw new Error(message || `Expected ${actual} to be greater than ${expected}`);
    }
}

function assertLessThan(actual, expected, message) {
    if (actual >= expected) {
        throw new Error(message || `Expected ${actual} to be less than ${expected}`);
    }
}

function assertNull(value, message) {
    if (value !== null) {
        throw new Error(message || `Expected null, got ${value}`);
    }
}

function assertNotNull(value, message) {
    if (value === null) {
        throw new Error(message || 'Expected non-null value');
    }
}

module.exports = {
    TestHarness,
    assertEqual,
    assertDeepEqual,
    assertTrue,
    assertFalse,
    assertThrows,
    assertThrowsAsync,
    assertMatch,
    assertIncludes,
    assertGreaterThan,
    assertLessThan,
    assertNull,
    assertNotNull
};
