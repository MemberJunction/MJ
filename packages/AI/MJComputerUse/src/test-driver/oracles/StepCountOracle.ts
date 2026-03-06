/**
 * Step Count Oracle for Computer Use tests.
 *
 * Evaluates whether the test completed within an acceptable number of steps.
 * Useful for ensuring the agent isn't taking an unreasonable number of steps
 * to accomplish a goal.
 *
 * Configuration:
 * - maxSteps: Maximum number of steps allowed (can also come from ExpectedOutcomes)
 *
 * @example
 * ```typescript
 * const oracle = new StepCountOracle();
 * const result = await oracle.evaluate({
 *     test: testEntity,
 *     actualOutput: { totalSteps: 8 },
 *     expectedOutput: { maxSteps: 15 },
 *     contextUser
 * }, {});
 * ```
 */

import { IOracle, OracleInput, OracleResult } from '@memberjunction/testing-engine';
import type { OracleConfig } from '@memberjunction/testing-engine';
import type { ComputerUseActualOutput, ComputerUseExpectedOutcomes } from '../types.js';

export class StepCountOracle implements IOracle {
    readonly type = 'step-count';

    async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
        try {
            const actual = input.actualOutput as ComputerUseActualOutput | undefined;
            const expected = input.expectedOutput as ComputerUseExpectedOutcomes | undefined;

            const totalSteps = actual?.totalSteps ?? 0;
            const maxSteps = (config.maxSteps as number) ?? expected?.maxSteps;

            if (maxSteps == null) {
                // No step limit defined — pass by default
                return {
                    oracleType: this.type,
                    passed: true,
                    score: 1.0,
                    message: `Completed in ${totalSteps} steps (no limit defined)`,
                    details: { totalSteps }
                };
            }

            if (totalSteps <= maxSteps) {
                // Calculate score: closer to maxSteps = lower score (but still passing)
                const efficiency = maxSteps > 0 ? 1.0 - (totalSteps / maxSteps) * 0.5 : 1.0;
                return {
                    oracleType: this.type,
                    passed: true,
                    score: Math.max(0.5, efficiency),
                    message: `Completed in ${totalSteps} steps (limit: ${maxSteps})`,
                    details: { totalSteps, maxSteps }
                };
            }

            return {
                oracleType: this.type,
                passed: false,
                score: 0,
                message: `Exceeded step limit: ${totalSteps} steps (limit: ${maxSteps})`,
                details: { totalSteps, maxSteps }
            };

        } catch (error) {
            return {
                oracleType: this.type,
                passed: false,
                score: 0,
                message: `Step count evaluation error: ${(error as Error).message}`
            };
        }
    }
}
