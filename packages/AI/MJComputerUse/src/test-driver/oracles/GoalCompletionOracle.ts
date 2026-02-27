/**
 * Goal Completion Oracle for Computer Use tests.
 *
 * Evaluates whether the Computer Use engine's judge determined
 * that the goal was achieved. This is the primary oracle for
 * Computer Use tests — it checks the FinalJudgeVerdict from the
 * engine's run result.
 *
 * Configuration:
 * - minConfidence: Minimum judge confidence to consider passed (default: 0.5)
 *
 * @example
 * ```typescript
 * const oracle = new GoalCompletionOracle();
 * const result = await oracle.evaluate({
 *     test: testEntity,
 *     actualOutput: {
 *         success: true,
 *         status: 'Completed',
 *         finalJudgeVerdict: { Done: true, Confidence: 0.9, Reason: 'Goal met' }
 *     },
 *     contextUser
 * }, { minConfidence: 0.7 });
 * ```
 */

import { IOracle, OracleInput, OracleResult } from '@memberjunction/testing-engine';
import type { OracleConfig } from '@memberjunction/testing-engine';
import type { ComputerUseActualOutput } from '../types.js';

export class GoalCompletionOracle implements IOracle {
    readonly type = 'goal-completion';

    async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
        try {
            const actual = input.actualOutput as ComputerUseActualOutput | undefined;
            if (!actual) {
                return {
                    oracleType: this.type,
                    passed: false,
                    score: 0,
                    message: 'No actual output provided'
                };
            }

            const minConfidence = (config.minConfidence as number) ?? 0.5;

            // Check if the engine reported success
            if (!actual.success) {
                return {
                    oracleType: this.type,
                    passed: false,
                    score: 0,
                    message: `Engine reported failure with status: ${actual.status}`,
                    details: {
                        status: actual.status,
                        error: actual.error,
                        totalSteps: actual.totalSteps
                    }
                };
            }

            // Check the judge verdict
            const verdict = actual.finalJudgeVerdict;
            if (!verdict) {
                return {
                    oracleType: this.type,
                    passed: false,
                    score: 0.5,
                    message: 'Engine succeeded but no judge verdict available',
                    details: {
                        status: actual.status,
                        totalSteps: actual.totalSteps
                    }
                };
            }

            if (!verdict.Done) {
                return {
                    oracleType: this.type,
                    passed: false,
                    score: verdict.Confidence * 0.5, // Partial credit based on confidence
                    message: `Judge did not confirm goal completion: ${verdict.Reason}`,
                    details: {
                        done: verdict.Done,
                        confidence: verdict.Confidence,
                        reason: verdict.Reason,
                        totalSteps: actual.totalSteps
                    }
                };
            }

            // Judge says Done — check confidence threshold
            if (verdict.Confidence < minConfidence) {
                return {
                    oracleType: this.type,
                    passed: false,
                    score: verdict.Confidence,
                    message: `Judge confirmed goal but confidence ${verdict.Confidence.toFixed(2)} is below threshold ${minConfidence}`,
                    details: {
                        done: verdict.Done,
                        confidence: verdict.Confidence,
                        minConfidence,
                        reason: verdict.Reason,
                        totalSteps: actual.totalSteps
                    }
                };
            }

            // Success
            return {
                oracleType: this.type,
                passed: true,
                score: verdict.Confidence,
                message: `Goal completed with confidence ${verdict.Confidence.toFixed(2)}: ${verdict.Reason}`,
                details: {
                    done: verdict.Done,
                    confidence: verdict.Confidence,
                    reason: verdict.Reason,
                    totalSteps: actual.totalSteps,
                    finalUrl: actual.finalUrl
                }
            };

        } catch (error) {
            return {
                oracleType: this.type,
                passed: false,
                score: 0,
                message: `Goal completion evaluation error: ${(error as Error).message}`
            };
        }
    }
}
