/**
 * @fileoverview Trace validation oracle implementation
 * @module @memberjunction/testing-engine
 */

import { RunView } from '@memberjunction/core';
import { MJAIAgentRunEntity, MJAIAgentRunStepEntity } from '@memberjunction/core-entities';
import { IOracle } from './IOracle';
import { OracleInput, OracleConfig, OracleResult } from '../types';

/**
 * Trace Validator Oracle.
 *
 * Validates that agent execution trace has no errors.
 * Checks AgentRun status and all AgentRunStep records for error conditions.
 *
 * Configuration:
 * - allowWarnings: Whether to allow warning-level issues (default: true)
 * - requiredSteps: Minimum number of steps expected (optional)
 * - maxSteps: Maximum number of steps allowed (optional)
 *
 * @example
 * ```typescript
 * const oracle = new TraceValidatorOracle();
 * const result = await oracle.evaluate({
 *     targetEntity: agentRun,
 *     contextUser
 * }, {
 *     allowWarnings: true,
 *     requiredSteps: 2
 * });
 * ```
 */
export class TraceValidatorOracle implements IOracle {
    readonly type = 'trace-no-errors';

    /**
     * Evaluate agent run trace for errors.
     *
     * @param input - Oracle input with agent run entity
     * @param config - Oracle configuration
     * @returns Oracle result with pass/fail and trace analysis
     */
    async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
        try {
            // Get agent run entity
            const agentRun = input.targetEntity as MJAIAgentRunEntity;
            if (!agentRun) {
                return {
                    oracleType: this.type,
                    passed: false,
                    score: 0,
                    message: 'No agent run entity provided'
                };
            }

            // Check agent run status
            if (agentRun.Status === 'Failed' || agentRun.Status === 'Cancelled') {
                return {
                    oracleType: this.type,
                    passed: false,
                    score: 0,
                    message: `Agent run failed with status: ${agentRun.Status}`,
                    details: {
                        agentRunId: agentRun.ID,
                        status: agentRun.Status
                    }
                };
            }

            // Load agent run steps
            const rv = new RunView();
            const stepsResult = await rv.RunView<MJAIAgentRunStepEntity>({
                EntityName: 'MJ: AI Agent Run Steps',
                ExtraFilter: `AgentRunID='${agentRun.ID}'`,
                OrderBy: 'Sequence ASC',
                ResultType: 'entity_object'
            }, input.contextUser);

            if (!stepsResult.Success) {
                return {
                    oracleType: this.type,
                    passed: false,
                    score: 0,
                    message: `Failed to load agent run steps: ${stepsResult.ErrorMessage}`
                };
            }

            const steps = stepsResult.Results || [];

            // Check step count constraints
            const requiredSteps = config.requiredSteps as number;
            const maxSteps = config.maxSteps as number;

            if (requiredSteps && steps.length < requiredSteps) {
                return {
                    oracleType: this.type,
                    passed: false,
                    score: 0,
                    message: `Expected at least ${requiredSteps} steps, got ${steps.length}`,
                    details: { stepCount: steps.length, requiredSteps }
                };
            }

            if (maxSteps && steps.length > maxSteps) {
                return {
                    oracleType: this.type,
                    passed: false,
                    score: 0,
                    message: `Expected at most ${maxSteps} steps, got ${steps.length}`,
                    details: { stepCount: steps.length, maxSteps }
                };
            }

            // Check each step for errors
            const allowWarnings = config.allowWarnings !== false; // Default to true
            const errors: string[] = [];
            const warnings: string[] = [];

            for (const step of steps) {
                if (step.Status === 'Failed') {
                    errors.push(`Step ${step.StepNumber}: ${step.StepName} - ${step.Status}`);
                }

                // Note: Output field doesn't exist on MJAIAgentRunStepEntity
                // If we need to check output, we'd need to load it from another source
            }

            // Determine result
            if (errors.length > 0) {
                return {
                    oracleType: this.type,
                    passed: false,
                    score: 0,
                    message: `Trace contains ${errors.length} error(s)`,
                    details: { errors, warnings, stepCount: steps.length }
                };
            }

            if (!allowWarnings && warnings.length > 0) {
                return {
                    oracleType: this.type,
                    passed: false,
                    score: 0.5,
                    message: `Trace contains ${warnings.length} warning(s)`,
                    details: { warnings, stepCount: steps.length }
                };
            }

            // Success
            return {
                oracleType: this.type,
                passed: true,
                score: 1.0,
                message: `Trace clean with ${steps.length} step(s)`,
                details: {
                    stepCount: steps.length,
                    warnings: warnings.length > 0 ? warnings : undefined
                }
            };

        } catch (error) {
            return {
                oracleType: this.type,
                passed: false,
                score: 0,
                message: `Trace validation error: ${(error as Error).message}`
            };
        }
    }
}
