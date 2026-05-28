/**
 * Example custom-oracle module for the generic-web example.
 *
 * Loaded at suite startup via:
 *   mj test suite --oracles-module=./oracles/mdn-oracles.cjs
 *
 * Each export that looks like an `IOracle` (has `type: string` + async
 * `evaluate(input, config)`) gets registered on the TestEngine and becomes
 * available to any test that references its `type` in `Configuration.oracles`.
 *
 * Supported export shapes (see packages/TestingFramework/CLI/src/utils/
 * oracle-module-loader.ts for the duck-type check):
 *   - A class implementing IOracle (instantiated with no args)
 *   - An object instance with `{ type: '...', async evaluate() { } }`
 *
 * This module demonstrates both shapes so adopters can copy whichever style
 * they prefer.
 */
'use strict';

/**
 * FinalUrlHostOracle — class-export style.
 *
 * Validates that the test's final URL is on a specific host. Useful as a
 * defensive check: if the agent wandered off-domain (e.g., chased an external
 * link), the URL hostname won't match and this oracle fails the test.
 *
 * Config:
 *   - host: string — the expected hostname (e.g., "developer.mozilla.org").
 *   - allowSubdomains: boolean (default true) — accept "*.host" matches too.
 */
class FinalUrlHostOracle {
    constructor() {
        this.type = 'final-url-host';
    }

    async evaluate(input, config) {
        const actual = (input && input.actualOutput) || {};
        const finalUrl = actual.finalUrl || '';
        const expectedHost = (config && config.host) || '';
        const allowSubdomains = config && config.allowSubdomains !== false;

        if (!expectedHost) {
            return {
                oracleType: this.type,
                passed: false,
                score: 0,
                message: 'No host configured for final-url-host oracle',
            };
        }
        if (!finalUrl) {
            return {
                oracleType: this.type,
                passed: false,
                score: 0,
                message: 'No final URL recorded for the test',
            };
        }

        let actualHost;
        try {
            actualHost = new URL(finalUrl).hostname.toLowerCase();
        } catch (err) {
            return {
                oracleType: this.type,
                passed: false,
                score: 0,
                message: `Final URL is not parseable: ${finalUrl}`,
            };
        }

        const expected = expectedHost.toLowerCase();
        const matches = allowSubdomains
            ? actualHost === expected || actualHost.endsWith('.' + expected)
            : actualHost === expected;

        return {
            oracleType: this.type,
            passed: matches,
            score: matches ? 1.0 : 0,
            message: matches
                ? `Final URL host matches: ${actualHost}`
                : `Final URL host mismatch — expected ${expected}, got ${actualHost}`,
            details: { actualHost, expectedHost: expected, finalUrl },
        };
    }
}

/**
 * minStepCountOracle — instance-export style.
 *
 * Inverse of the built-in step-count oracle: fails when the agent finished too
 * fast (e.g., immediately hit an error page and gave up). Useful for catching
 * silent navigation failures.
 *
 * Config:
 *   - minSteps: number — minimum acceptable step count (default 2).
 */
const minStepCountOracle = {
    type: 'min-step-count',
    async evaluate(input, config) {
        const totalSteps =
            (input && input.actualOutput && input.actualOutput.totalSteps) || 0;
        const minSteps = (config && typeof config.minSteps === 'number') ? config.minSteps : 2;
        const passed = totalSteps >= minSteps;
        return {
            oracleType: this.type,
            passed,
            score: passed ? 1.0 : 0,
            message: passed
                ? `Test took ${totalSteps} step(s) (≥ ${minSteps})`
                : `Test finished too quickly: ${totalSteps} step(s) < min ${minSteps}`,
            details: { totalSteps, minSteps },
        };
    },
};

module.exports = {
    FinalUrlHostOracle,
    minStepCountOracle,
};
