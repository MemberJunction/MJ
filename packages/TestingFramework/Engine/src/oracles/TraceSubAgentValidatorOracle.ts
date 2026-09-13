/**
 * @fileoverview Sub-agent dispatch oracle — the shipped-but-missing `trace-validate-sub-agents`.
 * @module @memberjunction/testing-engine
 */

import { RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { MJAIAgentRunEntity, MJAIAgentRunStepEntity } from '@memberjunction/core-entities';
import { IOracle } from './IOracle';
import { OracleInput, OracleConfig, OracleResult } from '../types';
import { evaluateSubAgentTrace, type SubAgentTraceConfig, type SubAgentTraceFacts } from '../eval/subAgentTrace';

/**
 * Validates which sub-agents an agent run dispatched, and how many iterations it took.
 *
 * **This oracle was referenced by shipped metadata before it existed.** Both stock research-agent
 * tests configure `trace-validate-sub-agents` and weight it at 0.25 and 0.3 respectively; with no
 * implementation registered, the engine logged `Oracle not found` and a quarter to a third of each
 * test's weight silently vanished from the score. The tests reported green on the remaining
 * oracles. That is the defect this closes (test plan §2, gap 5).
 *
 * **Traversal.** Sub-agent runs are reached through the **Sub-Agent step's `TargetLogID`**, not
 * through `AIAgentRun.ParentRunID`. The generated ORM is explicit that ParentRunID "records
 * parentage but is not a link the tree traverses", and the platform's own run-tree walk uses the
 * step link — so querying by ParentRunID would find runs the platform does not consider part of
 * this tree, and miss none that it does. The walk recurses, because a sub-agent may dispatch its
 * own, and a required agent two levels down was still dispatched by this run.
 *
 * Configuration (as the shipped tests already supply it):
 * - `requiredAgents`: names that must appear
 * - `forbiddenAgents`: names that must not
 * - `minIterations`: minimum Prompt steps on the top-level run
 *
 * @example
 * ```json
 * { "type": "trace-validate-sub-agents", "weight": 0.3,
 *   "config": { "requiredAgents": ["Database Research Agent", "Web Research Agent"], "minIterations": 1 } }
 * ```
 */
export class TraceSubAgentValidatorOracle implements IOracle {
    readonly type = 'trace-validate-sub-agents';

    /** Guard against a cyclic or pathologically deep run tree; real trees are 2–3 levels. */
    private static readonly MAX_DEPTH = 6;

    async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
        try {
            const agentRun = input.targetEntity as MJAIAgentRunEntity | undefined;
            if (!agentRun?.ID) {
                return { oracleType: this.type, passed: false, score: 0, message: 'No agent run entity provided' };
            }

            const facts = await this.collectFacts(agentRun.ID, input.contextUser);
            const result = evaluateSubAgentTrace(facts, config as SubAgentTraceConfig);
            return { oracleType: this.type, passed: result.passed, score: result.score, message: result.message, details: result.details };
        } catch (error) {
            return {
                oracleType: this.type,
                passed: false,
                score: 0,
                message: `Sub-agent trace validation error: ${(error as Error).message}`
            };
        }
    }

    /** Walks the run tree, collecting dispatched sub-agent names and the parent's iteration count. */
    private async collectFacts(rootRunID: string, contextUser: UserInfo): Promise<SubAgentTraceFacts> {
        const dispatchedAgents: string[] = [];
        const visited = new Set<string>();
        const rootSteps = await this.loadSteps(rootRunID, contextUser);
        // Iterations are the PARENT's prompt steps only — a sub-agent's prompts are its own passes.
        const iterations = rootSteps.filter((s) => s.StepType === 'Prompt').length;

        const walk = async (steps: MJAIAgentRunStepEntity[], depth: number): Promise<void> => {
            if (depth > TraceSubAgentValidatorOracle.MAX_DEPTH) {
                return;
            }
            for (const step of steps) {
                if (step.StepType !== 'Sub-Agent' || !step.TargetLogID || visited.has(step.TargetLogID)) {
                    continue;
                }
                visited.add(step.TargetLogID);
                const childRun = await this.loadRun(step.TargetLogID, contextUser);
                // Fall back to the step name when the child run is unreadable: a dispatch that
                // happened is a fact worth recording even if the child row cannot be loaded.
                dispatchedAgents.push(childRun?.Agent?.trim() || step.StepName?.trim() || '(unnamed sub-agent)');
                if (childRun) {
                    await walk(await this.loadSteps(childRun.ID, contextUser), depth + 1);
                }
            }
        };
        await walk(rootSteps, 1);

        return { dispatchedAgents, iterations };
    }

    private async loadSteps(agentRunID: string, contextUser: UserInfo): Promise<MJAIAgentRunStepEntity[]> {
        const result = await new RunView().RunView<MJAIAgentRunStepEntity>({
            EntityName: 'MJ: AI Agent Run Steps',
            ExtraFilter: `AgentRunID='${agentRunID}'`,
            OrderBy: 'StepNumber',
            ResultType: 'entity_object'
        }, contextUser);
        return result.Success ? (result.Results ?? []) : [];
    }

    private async loadRun(agentRunID: string, contextUser: UserInfo): Promise<MJAIAgentRunEntity | null> {
        const result = await new RunView().RunView<MJAIAgentRunEntity>({
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: `ID='${agentRunID}'`,
            ResultType: 'entity_object'
        }, contextUser);
        return result.Success && result.Results?.length === 1 ? result.Results[0] : null;
    }
}
