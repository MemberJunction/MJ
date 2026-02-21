/**
 * URL Match Oracle for Computer Use tests.
 *
 * Evaluates whether the final browser URL matches an expected pattern.
 * The pattern is a regular expression string.
 *
 * Configuration:
 * - pattern: Regex pattern to match against the final URL (required)
 *   Can also be supplied via ExpectedOutcomes.finalUrlPattern.
 *
 * @example
 * ```typescript
 * const oracle = new UrlMatchOracle();
 * const result = await oracle.evaluate({
 *     test: testEntity,
 *     actualOutput: { finalUrl: 'https://example.com/dashboard' },
 *     expectedOutput: { finalUrlPattern: '^https://example\\.com/dashboard' },
 *     contextUser
 * }, { pattern: '^https://example\\.com/dashboard' });
 * ```
 */

import { IOracle, OracleInput, OracleResult } from '@memberjunction/testing-engine';
import type { OracleConfig } from '@memberjunction/testing-engine';
import type { ComputerUseActualOutput, ComputerUseExpectedOutcomes } from '../types.js';

export class UrlMatchOracle implements IOracle {
    readonly type = 'url-match';

    async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
        try {
            const actual = input.actualOutput as ComputerUseActualOutput | undefined;
            const expected = input.expectedOutput as ComputerUseExpectedOutcomes | undefined;

            // Get pattern from config first, then from expectedOutput
            const pattern = (config.pattern as string)
                ?? expected?.finalUrlPattern;

            if (!pattern) {
                return {
                    oracleType: this.type,
                    passed: false,
                    score: 0,
                    message: 'No URL pattern provided in oracle config or ExpectedOutcomes.finalUrlPattern'
                };
            }

            const finalUrl = actual?.finalUrl ?? '';
            if (!finalUrl) {
                return {
                    oracleType: this.type,
                    passed: false,
                    score: 0,
                    message: 'No final URL available from test execution',
                    details: { pattern }
                };
            }

            // Test the pattern against the final URL
            const regex = new RegExp(pattern);
            const matches = regex.test(finalUrl);

            if (matches) {
                return {
                    oracleType: this.type,
                    passed: true,
                    score: 1.0,
                    message: `Final URL matches pattern: ${finalUrl}`,
                    details: { finalUrl, pattern }
                };
            }

            return {
                oracleType: this.type,
                passed: false,
                score: 0,
                message: `Final URL does not match pattern. Expected: /${pattern}/, Got: ${finalUrl}`,
                details: { finalUrl, pattern }
            };

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            // Check if this is a regex syntax error
            if (message.includes('Invalid regular expression')) {
                return {
                    oracleType: this.type,
                    passed: false,
                    score: 0,
                    message: `Invalid URL pattern regex: ${message}`
                };
            }

            return {
                oracleType: this.type,
                passed: false,
                score: 0,
                message: `URL match evaluation error: ${message}`
            };
        }
    }
}
