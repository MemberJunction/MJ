/**
 * @fileoverview Exact match oracle implementation
 * @module @memberjunction/testing-engine
 */

import { IOracle } from './IOracle';
import { OracleInput, OracleConfig, OracleResult } from '../types';

/**
 * Exact Match Oracle.
 *
 * Performs deterministic comparison between expected and actual output.
 * Supports various comparison modes (exact, contains, regex, deep equality).
 *
 * Configuration:
 * - mode: Comparison mode ('exact' | 'contains' | 'regex' | 'deep' | 'partial')
 * - caseSensitive: Whether string comparisons are case-sensitive (default: true)
 * - ignoreWhitespace: Whether to normalize whitespace before comparison (default: false)
 * - fields: For 'partial' mode, which fields to compare (array of paths)
 *
 * @example
 * ```typescript
 * const oracle = new ExactMatchOracle();
 *
 * // Exact match
 * const result1 = await oracle.evaluate({
 *     expectedOutput: { status: 'success', count: 5 },
 *     actualOutput: { status: 'success', count: 5 }
 * }, { mode: 'exact' });
 *
 * // Contains mode (actual must contain all expected fields)
 * const result2 = await oracle.evaluate({
 *     expectedOutput: { status: 'success' },
 *     actualOutput: { status: 'success', count: 5, extra: 'data' }
 * }, { mode: 'contains' });
 *
 * // Regex match
 * const result3 = await oracle.evaluate({
 *     expectedOutput: { pattern: 'sales.*region' },
 *     actualOutput: { response: 'Sales by region report' }
 * }, { mode: 'regex' });
 * ```
 */
export class ExactMatchOracle implements IOracle {
    readonly type = 'exact-match';

    /**
     * Evaluate exact match between expected and actual output.
     *
     * @param input - Oracle input with expected and actual output
     * @param config - Oracle configuration
     * @returns Oracle result with match details
     */
    async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
        try {
            const mode = (config.mode as string) || 'exact';
            const caseSensitive = config.caseSensitive !== false; // Default true
            const ignoreWhitespace = config.ignoreWhitespace === true; // Default false

            const expected = input.expectedOutput;
            const actual = input.actualOutput;

            if (!expected) {
                return {
                    oracleType: this.type,
                    passed: false,
                    score: 0,
                    message: 'No expected output provided'
                };
            }

            if (!actual) {
                return {
                    oracleType: this.type,
                    passed: false,
                    score: 0,
                    message: 'No actual output provided'
                };
            }

            // Perform comparison based on mode
            let result: { passed: boolean; score: number; message: string; details?: unknown };

            switch (mode) {
                case 'exact':
                    result = this.exactMatch(expected, actual);
                    break;

                case 'contains':
                    result = this.containsMatch(expected, actual);
                    break;

                case 'regex':
                    result = this.regexMatch(expected, actual, caseSensitive);
                    break;

                case 'deep':
                    result = this.deepEqual(expected, actual);
                    break;

                case 'partial':
                    result = this.partialMatch(
                        expected,
                        actual,
                        config.fields as string[]
                    );
                    break;

                default:
                    return {
                        oracleType: this.type,
                        passed: false,
                        score: 0,
                        message: `Unknown comparison mode: ${mode}`
                    };
            }

            return {
                oracleType: this.type,
                ...result
            };

        } catch (error) {
            return {
                oracleType: this.type,
                passed: false,
                score: 0,
                message: `Exact match error: ${(error as Error).message}`
            };
        }
    }

    /**
     * Exact JSON string match.
     * @private
     */
    private exactMatch(
        expected: unknown,
        actual: unknown
    ): { passed: boolean; score: number; message: string; details?: unknown } {
        const expectedStr = JSON.stringify(expected);
        const actualStr = JSON.stringify(actual);

        if (expectedStr === actualStr) {
            return {
                passed: true,
                score: 1.0,
                message: 'Output exactly matches expected'
            };
        } else {
            return {
                passed: false,
                score: 0,
                message: 'Output does not match expected',
                details: {
                    expected: expectedStr.substring(0, 200),
                    actual: actualStr.substring(0, 200)
                }
            };
        }
    }

    /**
     * Check if actual contains all expected fields.
     * @private
     */
    private containsMatch(
        expected: unknown,
        actual: unknown
    ): { passed: boolean; score: number; message: string; details?: unknown } {
        const missingFields = this.findMissingFields(expected, actual, '');

        if (missingFields.length === 0) {
            return {
                passed: true,
                score: 1.0,
                message: 'Output contains all expected fields'
            };
        } else {
            return {
                passed: false,
                score: 0,
                message: `Missing ${missingFields.length} expected field(s)`,
                details: { missingFields }
            };
        }
    }

    /**
     * Find missing fields in actual compared to expected.
     * @private
     */
    private findMissingFields(
        expected: unknown,
        actual: unknown,
        path: string
    ): string[] {
        const missing: string[] = [];

        if (typeof expected === 'object' && expected !== null) {
            if (typeof actual !== 'object' || actual === null) {
                return [path || 'root'];
            }

            const expectedObj = expected as Record<string, unknown>;
            const actualObj = actual as Record<string, unknown>;

            for (const key in expectedObj) {
                const fieldPath = path ? `${path}.${key}` : key;

                if (!(key in actualObj)) {
                    missing.push(fieldPath);
                } else {
                    const nested = this.findMissingFields(
                        expectedObj[key],
                        actualObj[key],
                        fieldPath
                    );
                    missing.push(...nested);
                }
            }
        }

        return missing;
    }

    /**
     * Regex pattern matching.
     * @private
     */
    private regexMatch(
        expected: unknown,
        actual: unknown,
        caseSensitive: boolean
    ): { passed: boolean; score: number; message: string; details?: unknown } {
        // Convert expected to regex patterns
        const patterns = this.extractPatterns(expected);
        const actualStr = JSON.stringify(actual);

        const failed: string[] = [];

        for (const pattern of patterns) {
            const flags = caseSensitive ? '' : 'i';
            const regex = new RegExp(pattern, flags);

            if (!regex.test(actualStr)) {
                failed.push(pattern);
            }
        }

        if (failed.length === 0) {
            return {
                passed: true,
                score: 1.0,
                message: `All ${patterns.length} pattern(s) matched`
            };
        } else {
            return {
                passed: false,
                score: 1 - (failed.length / patterns.length),
                message: `${failed.length} of ${patterns.length} pattern(s) failed`,
                details: { failedPatterns: failed }
            };
        }
    }

    /**
     * Extract regex patterns from expected output.
     * @private
     */
    private extractPatterns(expected: unknown): string[] {
        const patterns: string[] = [];

        if (typeof expected === 'string') {
            patterns.push(expected);
        } else if (Array.isArray(expected)) {
            patterns.push(...expected.filter(p => typeof p === 'string'));
        } else if (typeof expected === 'object' && expected !== null) {
            const obj = expected as Record<string, unknown>;
            if (obj.responsePatterns && Array.isArray(obj.responsePatterns)) {
                patterns.push(...obj.responsePatterns.filter(p => typeof p === 'string'));
            }
        }

        return patterns;
    }

    /**
     * Deep equality check.
     * @private
     */
    private deepEqual(
        expected: unknown,
        actual: unknown
    ): { passed: boolean; score: number; message: string } {
        const isEqual = this.deepEquality(expected, actual);

        return {
            passed: isEqual,
            score: isEqual ? 1.0 : 0,
            message: isEqual ? 'Output deeply equals expected' : 'Output does not deeply equal expected'
        };
    }

    /**
     * Recursive deep equality check.
     * @private
     */
    private deepEquality(a: unknown, b: unknown): boolean {
        if (a === b) {
            return true;
        }

        if (a === null || b === null || a === undefined || b === undefined) {
            return a === b;
        }

        if (typeof a !== typeof b) {
            return false;
        }

        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) {
                return false;
            }

            return a.every((item, index) => this.deepEquality(item, b[index]));
        }

        if (typeof a === 'object' && typeof b === 'object') {
            const aKeys = Object.keys(a as object);
            const bKeys = Object.keys(b as object);

            if (aKeys.length !== bKeys.length) {
                return false;
            }

            const aObj = a as Record<string, unknown>;
            const bObj = b as Record<string, unknown>;

            return aKeys.every(key =>
                bKeys.includes(key) && this.deepEquality(aObj[key], bObj[key])
            );
        }

        return false;
    }

    /**
     * Partial match on specific fields.
     * @private
     */
    private partialMatch(
        expected: unknown,
        actual: unknown,
        fields?: string[]
    ): { passed: boolean; score: number; message: string; details?: unknown } {
        if (!fields || fields.length === 0) {
            return {
                passed: false,
                score: 0,
                message: 'No fields specified for partial match'
            };
        }

        const failed: string[] = [];

        for (const field of fields) {
            const expectedValue = this.getFieldValue(expected, field);
            const actualValue = this.getFieldValue(actual, field);

            if (!this.deepEquality(expectedValue, actualValue)) {
                failed.push(field);
            }
        }

        if (failed.length === 0) {
            return {
                passed: true,
                score: 1.0,
                message: `All ${fields.length} field(s) matched`
            };
        } else {
            return {
                passed: false,
                score: 1 - (failed.length / fields.length),
                message: `${failed.length} of ${fields.length} field(s) failed`,
                details: { failedFields: failed }
            };
        }
    }

    /**
     * Get field value by path (e.g., 'user.name' or 'items[0].id').
     * @private
     */
    private getFieldValue(obj: unknown, path: string): unknown {
        if (!obj || typeof obj !== 'object') {
            return undefined;
        }

        const parts = path.split('.');
        let current: unknown = obj;

        for (const part of parts) {
            if (!current || typeof current !== 'object') {
                return undefined;
            }

            // Handle array indices
            const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
            if (arrayMatch) {
                const key = arrayMatch[1];
                const index = parseInt(arrayMatch[2]);
                current = (current as Record<string, unknown>)[key];

                if (!Array.isArray(current)) {
                    return undefined;
                }

                current = current[index];
            } else {
                current = (current as Record<string, unknown>)[part];
            }
        }

        return current;
    }
}
