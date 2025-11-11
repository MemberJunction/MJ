/**
 * @fileoverview Oracle interface for test evaluation
 * @module @memberjunction/testing-engine
 */

import { OracleInput, OracleConfig, OracleResult } from '../types';

/**
 * Interface for oracle implementations.
 *
 * An oracle is a source of truth that determines whether test output is correct.
 * Oracles can be deterministic (schema validation, exact match) or heuristic (LLM judge).
 *
 * Each oracle type evaluates a specific aspect of test output:
 * - SchemaValidator: Structural correctness
 * - TraceValidator: Execution safety (no errors)
 * - LLMJudge: Semantic quality
 * - ExactMatch: Deterministic output comparison
 * - SQLValidator: Database state verification
 *
 * @interface IOracle
 * @example
 * ```typescript
 * export class SchemaValidatorOracle implements IOracle {
 *     readonly type = 'schema-validate';
 *
 *     async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
 *         // Validation logic
 *         return { oracleType: this.type, passed: true, score: 1.0, message: 'Valid' };
 *     }
 * }
 * ```
 */
export interface IOracle {
    /**
     * Unique type identifier for this oracle.
     * Used in test configuration to specify which oracles to run.
     */
    readonly type: string;

    /**
     * Evaluate the test output.
     *
     * @param input - Evaluation input (test, expected/actual outputs, target entity, user)
     * @param config - Oracle-specific configuration
     * @returns Promise resolving to oracle result
     */
    evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult>;
}
