/**
 * @fileoverview SQL validation oracle implementation
 * @module @memberjunction/testing-engine
 */

import { Metadata, DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { IOracle } from './IOracle';
import { OracleInput, OracleConfig, OracleResult } from '../types';

/**
 * SQL Validator Oracle.
 *
 * Validates database state by executing SQL queries and comparing results.
 * Useful for testing that agent actions had the expected database effects.
 *
 * Configuration:
 * - queries: Array of SQL validation queries
 * - requireAll: Whether all queries must pass (default: true)
 *
 * Each query object contains:
 * - sql: The SQL query to execute
 * - expectedResult: Expected result (can be value, row count, or boolean)
 * - description: Human-readable description of what the query validates
 *
 * @example
 * ```typescript
 * const oracle = new SQLValidatorOracle();
 * const result = await oracle.evaluate({
 *     expectedOutput: {
 *         sqlValidations: [
 *             {
 *                 sql: "SELECT COUNT(*) FROM Reports WHERE Name LIKE '%Sales%'",
 *                 expectedResult: { count: 1 },
 *                 description: "Sales report was created"
 *             },
 *             {
 *                 sql: "SELECT Status FROM Reports WHERE ID = @ReportID",
 *                 expectedResult: { status: 'Published' },
 *                 description: "Report status is Published"
 *             }
 *         ]
 *     },
 *     actualOutput: {
 *         reportId: 'abc-123'
 *     },
 *     contextUser
 * }, {});
 * ```
 */
export class SQLValidatorOracle implements IOracle {
    readonly type = 'sql-validate';

    /**
     * Evaluate database state using SQL queries.
     *
     * @param input - Oracle input with SQL validations and actual output
     * @param config - Oracle configuration
     * @returns Oracle result with query validation details
     */
    async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
        try {
            // Get SQL validations from expected outcomes
            const validations = ((input.expectedOutput as any)?.sqlValidations as Array<{
                sql: string;
                expectedResult: unknown;
                description?: string;
            }>) || [];

            if (validations.length === 0) {
                return {
                    oracleType: this.type,
                    passed: false,
                    score: 0,
                    message: 'No SQL validations provided in ExpectedOutcomes.sqlValidations'
                };
            }

            const requireAll = config.requireAll !== false; // Default true
            const results: Array<{
                description: string;
                sql: string;
                passed: boolean;
                expected: unknown;
                actual: unknown;
                error?: string;
            }> = [];

            // Execute each validation query
            for (const validation of validations) {
                const queryResult = await this.executeValidation(
                    validation,
                    input.actualOutput,
                    input.contextUser
                );
                results.push(queryResult);
            }

            // Calculate score and determine pass/fail
            const passedCount = results.filter(r => r.passed).length;
            const totalCount = results.length;
            const score = totalCount > 0 ? passedCount / totalCount : 0;
            const passed = requireAll ? passedCount === totalCount : passedCount > 0;

            return {
                oracleType: this.type,
                passed,
                score,
                message: requireAll
                    ? `${passedCount}/${totalCount} validation(s) passed`
                    : `At least one validation passed (${passedCount}/${totalCount})`,
                details: { validations: results }
            };

        } catch (error) {
            return {
                oracleType: this.type,
                passed: false,
                score: 0,
                message: `SQL validation error: ${(error as Error).message}`
            };
        }
    }

    /**
     * Execute a single validation query.
     * @private
     */
    private async executeValidation(
        validation: { sql: string; expectedResult: unknown; description?: string },
        actualOutput: unknown,
        contextUser: UserInfo
    ): Promise<{
        description: string;
        sql: string;
        passed: boolean;
        expected: unknown;
        actual: unknown;
        error?: string;
    }> {
        try {
            // Replace parameters in SQL with values from actualOutput
            const sql = this.replaceParameters(validation.sql, actualOutput);

            // Get database provider from Metadata.Provider
            const dbProvider = Metadata.Provider as DatabaseProviderBase;

            // Execute the SQL query
            const queryResults = await dbProvider.ExecuteSQL<Record<string, unknown>>(
                sql,
                undefined,  // No parameters (already substituted in SQL string)
                { description: validation.description || 'SQL Validation' },
                contextUser
            );

            // Extract result (handle single value, single row, or multiple rows)
            const actualResult = this.extractResult(queryResults);

            // Compare with expected result
            const passed = this.compareResults(validation.expectedResult, actualResult);

            return {
                description: validation.description || 'SQL validation',
                sql: validation.sql,
                passed,
                expected: validation.expectedResult,
                actual: actualResult
            };

        } catch (error) {
            return {
                description: validation.description || 'SQL validation',
                sql: validation.sql,
                passed: false,
                expected: validation.expectedResult,
                actual: null,
                error: (error as Error).message
            };
        }
    }

    /**
     * Replace parameters in SQL query with actual values.
     * @private
     */
    private replaceParameters(sql: string, actualOutput: unknown): string {
        if (!actualOutput || typeof actualOutput !== 'object') {
            return sql;
        }

        let result = sql;
        const outputObj = actualOutput as Record<string, unknown>;

        // Replace @ParameterName with values from actualOutput
        const paramMatches = sql.matchAll(/@(\w+)/g);
        for (const match of paramMatches) {
            const paramName = match[1];
            const camelCaseParam = paramName.charAt(0).toLowerCase() + paramName.slice(1);

            // Try both original and camelCase versions
            const value = outputObj[paramName] || outputObj[camelCaseParam];

            if (value !== undefined) {
                // Properly escape and quote the value
                const escapedValue = typeof value === 'string'
                    ? `'${value.replace(/'/g, "''")}'`
                    : String(value);

                result = result.replace(new RegExp(`@${paramName}`, 'g'), escapedValue);
            }
        }

        return result;
    }

    /**
     * Extract result from query result set.
     * @private
     */
    private extractResult(results: unknown[]): unknown {
        if (!results || results.length === 0) {
            return null;
        }

        // If single row, single column, return the value
        if (results.length === 1) {
            const row = results[0] as Record<string, unknown>;
            const keys = Object.keys(row);

            if (keys.length === 1) {
                return row[keys[0]];
            }

            return row;
        }

        // Multiple rows
        return results;
    }

    /**
     * Compare expected and actual results.
     * @private
     */
    private compareResults(expected: unknown, actual: unknown): boolean {
        // Handle null/undefined
        if (expected === null || expected === undefined) {
            return actual === null || actual === undefined;
        }

        // Handle boolean
        if (typeof expected === 'boolean') {
            return Boolean(actual) === expected;
        }

        // Handle number
        if (typeof expected === 'number') {
            return Number(actual) === expected;
        }

        // Handle string
        if (typeof expected === 'string') {
            return String(actual) === expected;
        }

        // Handle object/array
        if (typeof expected === 'object') {
            return JSON.stringify(expected) === JSON.stringify(actual);
        }

        return false;
    }
}
